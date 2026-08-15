import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import { Resvg } from '@resvg/resvg-js';

export const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* The opening tag of a <text> carries no '>' of its own, so [^>]* spans it even
 * though the templates wrap these tags across several lines. */
export const setFontSize = (svg, id, size) =>
  svg.replace(new RegExp(`(<text[^>]*id="${id}"[^>]*?font-size=")[^"]*(")`), `$1${size}$2`);

export const readTextOf = (svg, id) =>
  svg.match(new RegExp(`<text[^>]*id="${id}"[^>]*>([\\s\\S]*?)</text>`))?.[1].trim() ?? '';

export const setAttr = (svg, id, attr, value) =>
  svg.replace(new RegExp(`(<[a-z]+[^>]*id="${id}"[^>]*?\\s${attr}=")[^"]*(")`), `$1${value}$2`);

/* What resvg can decode from a data URI. WebP is deliberately absent — it is not
 * supported, and a silent black background would be a confusing way to find out. */
export const IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

/* SVG is embeddable too (usvg decodes it inside <image>), but only for data URIs
 * built here — it stays out of IMAGE_TYPES so CSV-supplied backgrounds keep being
 * validated against the raster formats only. */
const DATA_URI_TYPES = { ...IMAGE_TYPES, '.svg': 'image/svg+xml' };

/* Templates usually share one file across every song, so the base64 is built once
 * per file rather than once per row. */
const dataUris = new Map();
export const toDataUri = (path) => {
  if (!dataUris.has(path)) {
    const type = DATA_URI_TYPES[extname(path).toLowerCase()];
    dataUris.set(path, `data:${type};base64,${readFileSync(path).toString('base64')}`);
  }
  return dataUris.get(path);
};

/* Templates carry images twice, as xlink:href and href, so both are rewritten —
 * a stale xlink:href would win in some renderers. */
export const setImageHref = (svg, id, dataUri) =>
  svg.replace(new RegExp(`<image[^>]*id="${id}"[^>]*>`), (tag) =>
    tag.replace(/(\s(?:xlink:)?href=")[^"]*"/g, (_, lead) => `${lead}${dataUri}"`),
  );

/* Substitution is driven by the row's keys, not by hardcoded column names: every
 * %column% token in the template is replaced with that row's value. The design is
 * set in capitals throughout. toUpperCase() maps ß to SS, so "Schloß Cafe Bar
 * Sierning" reads SCHLOSS CAFE BAR SIERNING as intended. */
export const substituteRow = (svg, row) => {
  let out = svg;
  for (const [name, value] of Object.entries(row)) {
    out = out.replaceAll(`%${name}%`, xmlEscape(value.toUpperCase()));
  }
  /* %title% sits on its own indented line in the templates. XML whitespace rules
   * would collapse that anyway, but a text line is exactly where a stray leading
   * space would show, so it is removed rather than trusted. */
  return out.replace(/>\s+(?=\S)/g, '>').replace(/\s+(?=<\/text>)/g, '');
};

export const makeMeasurer = (font) => {
  /*
   * resvg's bbox methods measure the whole document, and there is no way to ask for
   * one element, so width is measured against a throwaway SVG holding nothing but
   * the line in question. innerBBox() clips its result to the viewBox, hence the
   * deliberately oversized canvas — a tight one would report a truncated width.
   */
  const inkBox = (text, family, size, spacing) => {
    const probe =
      `<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="2000" viewBox="0 0 20000 2000">` +
      `<text x="0" y="1000" font-family="${family}" font-size="${size}" letter-spacing="${spacing}">${text}</text></svg>`;
    const box = new Resvg(probe, { font }).innerBBox();
    /* The probe's baseline sits at 1000, so the box's distance above it is how
     * far the rendered line reaches over its baseline — the cap height for the
     * all-caps text here. */
    return box ? { width: box.width, ascent: 1000 - box.y } : { width: 0, ascent: 0 };
  };

  const measure = (text, family, size, spacing) => inkBox(text, family, size, spacing).width;

  /*
   * Long titles overflow the canvas at the template's authored size, so shrink
   * until they fit maxWidth. Scaling by the overflow ratio undershoots slightly —
   * letter-spacing is an absolute length and does not shrink with the font — so
   * this converges from above in one or two passes; the loop bound is only there
   * to stop a pathological input from spinning.
   */
  const fitFontSize = (text, family, size, spacing, maxWidth) => {
    let current = size;
    for (let pass = 0; pass < 6; pass += 1) {
      const width = measure(text, family, current, spacing);
      if (width === 0 || width <= maxWidth) break;
      current = Math.floor(current * (maxWidth / width) * 10) / 10;
    }
    return current;
  };

  return { inkBox, measure, fitFontSize };
};
