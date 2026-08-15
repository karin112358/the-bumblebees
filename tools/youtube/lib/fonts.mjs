import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { decompress } from 'woff2-encoder';

import { at, YOUTUBE_DIR } from './paths.mjs';

const FONT_CACHE = join(YOUTUBE_DIR, '.fonts');

/*
 * @fontsource ships woff2 only, and none of these faces are installed system-wide.
 * resvg can be handed font files explicitly but reads sfnt (ttf/otf), not woff2,
 * so each face is decompressed once into .fonts/ and reused from there.
 *
 * Only the `latin` subset of each family is loaded, on purpose. The latin-ext and
 * vietnamese files are separate faces claiming the *same* family name, and having
 * several of them in the db makes which one wins a matter of load order. Latin
 * covers ä/ö/ü/ß, which is all the German text here needs.
 */
const FACES = [
  ['anton-400.ttf', '@fontsource/anton/files/anton-latin-400-normal.woff2'],
  ['barlow-condensed-400.ttf', '@fontsource/barlow-condensed/files/barlow-condensed-latin-400-normal.woff2'],
  /* The eyebrow asks for weight 500, which has no file of its own. Loading 400 and
   * 600 lets resvg pick the nearer of the two instead of losing the family. */
  ['barlow-condensed-600.ttf', '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2'],
];

/* Returns the resvg `font` options object. Throws when a woff2 source is missing,
 * which callers report and turn into a non-zero exit. */
export async function loadFonts() {
  mkdirSync(FONT_CACHE, { recursive: true });

  const fontFiles = [];
  for (const [ttfName, woff2Path] of FACES) {
    const ttf = join(FONT_CACHE, ttfName);
    if (!existsSync(ttf)) {
      const source = at(`node_modules/${woff2Path}`);
      if (!existsSync(source)) {
        throw new Error(`Missing font source ${source}\nRun \`npm install\` first.`);
      }
      writeFileSync(ttf, Buffer.from(await decompress(readFileSync(source))));
    }
    fontFiles.push(ttf);
  }

  /*
   * With system fonts off, every family a template names that is *not* in this
   * list — Impact, Arial Narrow, system-ui, sans-serif, Manrope — collapses to
   * defaultFontFamily. Naming it explicitly is what makes that predictable: left
   * unset, resvg falls back to whichever face happens to be first in fontFiles.
   * So a broken cache shows up as visibly wrong Barlow Condensed titles rather
   * than as something silently arbitrary.
   */
  return {
    loadSystemFonts: false,
    fontFiles,
    defaultFontFamily: 'Barlow Condensed',
  };
}
