"""Inventory every asset referenced by the two puzzle scenes + by runtime code.

Resolves Unity GUIDs to real project-relative paths so a build script can copy them.
"""
import re, os, glob, collections

ROOT = "D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle"
GAME_REL = "Assets/Games/Sliding-Puzzle"
GAME = os.path.join(ROOT, GAME_REL)

# ── guid -> project-relative asset path ────────────────────────────────────
guid2path = {}
for meta in glob.glob(os.path.join(ROOT, "Assets") + "/**/*.meta", recursive=True):
    try:
        head = open(meta, encoding="utf-8", errors="replace").read(400)
    except OSError:
        continue
    g = re.search(r"guid: (\w+)", head)
    if not g:
        continue
    asset = meta[:-5]                                    # strip .meta
    rel = os.path.relpath(asset, ROOT).replace("\\", "/")
    guid2path[g.group(1)] = rel

SCENES = {
    "Portrait":  os.path.join(GAME, "Scenes/MAP_PuzzleScene_Portrait.unity"),
    "Landscape": os.path.join(GAME, "Scenes/MAP_PuzzleScene_Landscape.unity"),
}

# guid -> set(scene labels)
used = collections.defaultdict(set)
for label, path in SCENES.items():
    txt = open(path, encoding="utf-8", errors="replace").read()
    for g in set(re.findall(r"guid: (\w+)", txt)):
        used[g].add(label)

EXT_KIND = {
    ".png": "sprite", ".jpg": "sprite", ".jpeg": "sprite", ".tga": "sprite",
    ".otf": "font-source", ".ttf": "font-source",
    ".asset": "tmp-font-asset", ".mat": "material", ".shader": "shader",
    ".prefab": "prefab", ".unity": "scene", ".cs": "script",
    ".anim": "animation", ".controller": "animator", ".wav": "audio", ".mp3": "audio",
}

rows = []
for g, scenes in used.items():
    p = guid2path.get(g)
    if not p:
        continue
    ext = os.path.splitext(p)[1].lower()
    kind = EXT_KIND.get(ext)
    if kind not in ("sprite", "font-source", "tmp-font-asset", "audio"):
        continue
    # only assets that belong to this game (skip packages/other modules noise)
    rows.append((kind, p, "+".join(sorted(scenes))))

rows.sort(key=lambda r: (r[0], r[1].lower()))

print("### Assets referenced by the scenes\n")
cur = None
for kind, p, scenes in rows:
    if kind != cur:
        print(f"\n-- {kind} --")
        cur = kind
    size = ""
    full = os.path.join(ROOT, p)
    if os.path.isfile(full):
        size = f"{os.path.getsize(full)/1024:.0f} KB"
    print(f"{p}   [{scenes}]  {size}")

# ── runtime-loaded (not GUID-referenced) ──────────────────────────────────
print("\n\n### Runtime-loaded folders (loaded by path/code, not GUID)\n")
tex = os.path.join(GAME, "Textures")
if os.path.isdir(tex):
    files = [f for f in os.listdir(tex) if os.path.splitext(f)[1].lower() in (".png", ".jpg", ".jpeg")]
    print(f"{GAME_REL}/Textures/  -> {len(files)} local fallback images")
    for f in sorted(files)[:20]:
        print(f"   {f}")

print("\n\n### All PNGs under UI/ (superset — includes any not scene-referenced)\n")
for p in sorted(glob.glob(os.path.join(GAME, "UI") + "/**/*.png", recursive=True)):
    rel = os.path.relpath(p, ROOT).replace("\\", "/")
    mark = "" if any(rel == r[1] for r in rows) else "   (NOT referenced by scenes)"
    print(f"{rel}{mark}")
