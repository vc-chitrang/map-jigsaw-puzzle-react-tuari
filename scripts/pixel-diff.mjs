#!/usr/bin/env node
/**
 * Numeric pixel-parity check: Unity capture vs port capture.
 *
 * Replaces the ImageMagick recipe in docs/pixel-perfect-replication.md §9 —
 * `magick` is not installed on this machine, and pixelmatch is a devDependency
 * so the check runs anywhere the repo does.
 *
 * Usage:
 *   node scripts/pixel-diff.mjs <unity.png> <port.png> [out-diff.png] [--threshold 0.1]
 *
 * Exit code 0 if the differing-pixel ratio is under --max (default 1 %), else 1,
 * so this can gate a phase exit in CI.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

function parseArgs(argv) {
  const positional = [];
  const flags = { threshold: 0.1, max: 0.01 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--threshold' || arg === '--max') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value)) throw new Error(`${arg} needs a number`);
      flags[arg.slice(2)] = value;
      i += 1;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const [baselinePath, candidatePath, diffPath = 'captures/diff.png'] = positional;

if (!baselinePath || !candidatePath) {
  console.error('usage: node scripts/pixel-diff.mjs <unity.png> <port.png> [diff.png] [--threshold 0.1] [--max 0.01]');
  process.exit(2);
}

const baseline = PNG.sync.read(readFileSync(baselinePath));
const candidate = PNG.sync.read(readFileSync(candidatePath));

if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
  console.error(
    `Size mismatch: ${basename(baselinePath)} is ${baseline.width}×${baseline.height}, ` +
      `${basename(candidatePath)} is ${candidate.width}×${candidate.height}.\n` +
      'Both captures must be taken at the same window size — the scale factor is ' +
      'derived from it, so a mismatch invalidates the comparison entirely.',
  );
  process.exit(2);
}

const { width, height } = baseline;
const diff = new PNG({ width, height });

const differing = pixelmatch(baseline.data, candidate.data, diff.data, width, height, {
  threshold: flags.threshold,
  includeAA: false,
  // Grey out matching pixels so geometry drift is obvious at a glance.
  alpha: 0.3,
  diffColor: [213, 0, 50], // MAP Sharbati
});

writeFileSync(diffPath, PNG.sync.write(diff));

const total = width * height;
const ratio = differing / total;
const pass = ratio <= flags.max;

console.log('');
console.log(`  baseline   ${baselinePath}`);
console.log(`  candidate  ${candidatePath}`);
console.log(`  diff       ${diffPath}`);
console.log(`  size       ${width} × ${height}  (${total.toLocaleString()} px)`);
console.log(`  differing  ${differing.toLocaleString()} px`);
console.log(`  ratio      ${(ratio * 100).toFixed(3)} %   (budget ${(flags.max * 100).toFixed(2)} %)`);
console.log(`  result     ${pass ? 'PASS' : 'FAIL'}`);
console.log('');

if (!pass) {
  console.log('Open the diff image. Differences confined to glyph edges are expected');
  console.log('(SDF vs hinted text); anything with a hard rectangular edge is geometry drift.');
}

process.exit(pass ? 0 : 1);
