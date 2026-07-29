/**
 * Public surface of the pure game core.
 *
 * Nothing in here imports React, the DOM, or a browser global — see
 * docs/architecture.md §2.1. Screens consume this module; it never consumes them.
 */

export * from './types';
export * from './constants';
export * from './board';
export * from './moves';
export * from './shuffle';
export * from './timer';
export * from './highScore';
export * from './reducer';
