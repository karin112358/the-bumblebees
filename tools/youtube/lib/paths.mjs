import { fileURLToPath } from 'node:url';

/* Resolves a repo-root-relative path regardless of the caller's cwd. lib/ sits
 * three levels below the repo root, hence the three ../ segments. */
export const at = (p) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

export const YOUTUBE_DIR = at('tools/youtube');
