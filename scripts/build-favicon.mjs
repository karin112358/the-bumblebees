/*
 * Regenerates public/favicon.svg, public/favicon.ico and
 * public/apple-touch-icon.png from src/assets/logo/bee.svg.
 *
 * Run with `node scripts/build-favicon.mjs` after changing the bee. It is not
 * wired into `astro build`: the bee changes about never, and the outputs are
 * committed, so paying for a rasterise on every build buys nothing.
 *
 * sharp comes in with Astro's image service, so this needs no extra dependency.
 */
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/*
 * The bee's own painted bounding box, straight off its viewBox. It is slightly
 * wider than it is tall, so the tile is squared off the larger side and the bee
 * is centred inside it rather than being stretched.
 */
const BEE = { x: 649.643, y: 480.589, w: 6462.211, h: 6218.137 };

/* The bee covers 84% of the tile; the rest is breathing room so it does not
 * collide with the rounded corners. */
const COVERAGE = 0.84;
const SIDE = Math.round(BEE.w / COVERAGE);
const RADIUS = Math.round(SIDE * 0.18);

/* Brand panel black — the same surface the bee sits on in the nav. */
const BACKGROUND = '#131312';

const source = readFileSync(at('src/assets/logo/bee.svg'), 'utf8');

/*
 * Everything between the <svg> tags: five paths, three rects and a circle.
 * Nothing here carries a class or a <style>, so the markup can be lifted
 * wholesale without dragging any cascade along with it.
 */
const body = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');

/*
 * The handoff export indents path data with literal tabs and newlines encoded
 * as character references, which is roughly a fifth of the file. Inside a `d`
 * attribute any run of whitespace is just a separator, so they collapse to one
 * space with no effect on the rendered curve.
 */
const collapsed = body.replace(/(&#xA;|&#x9;|[\r\n\t])+/g, ' ');

/*
 * Do NOT round the coordinates to shave more bytes. It was tried, and it
 * destroys the drawing: 87% of the 3600-odd path commands are *relative*, so a
 * rounding error on one delta shifts everything after it. The bee is not solid
 * shapes but hairline outlines — each stroke is a thin closed loop — so once the
 * accumulated drift approaches the width of a line, the outgoing and returning
 * edges cross and the fill floods the interior. At one decimal the wings and
 * body come out as solid amber blobs. Quantising safely would mean tracking the
 * absolute position and carrying the residual forward, which is a lot of
 * machinery to save a few kB on a file fetched once and cached.
 */
/* Centre the bee's box inside the square tile. */
const dx = +(SIDE / 2 - (BEE.x + BEE.w / 2)).toFixed(1);
const dy = +(SIDE / 2 - (BEE.y + BEE.h / 2)).toFixed(1);

/*
 * Optical sizing. The logo is line art whose strokes are about 50 units wide in
 * a 7700-unit box — around a tenth of a pixel once the whole thing is squeezed
 * into a 16 px tab, which anti-aliases down to a dim amber smudge. Re-stroking
 * the outlines in their own colour thickens them so they survive the downscale.
 * Each target therefore gets its own weight: heavy enough to read at that size,
 * light enough that the body stripes do not close up into a solid wedge (which
 * they start to do past ~300).
 */
const buildSvg = (stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIDE} ${SIDE}" fill="none">
<rect width="${SIDE}" height="${SIDE}" rx="${RADIUS}" fill="${BACKGROUND}"/>
<g stroke="${'#f3c814'}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round" transform="translate(${dx} ${dy})">${collapsed.trim()}</g>
</svg>
`;

/*
 * The shipped SVG is the one browsers scale to whatever size they please —
 * mostly 16 and 32 — so it takes a middle weight rather than the hairlines.
 */
const svg = buildSvg(200);
writeFileSync(at('public/favicon.svg'), svg);

/*
 * An SVG with no width/height rasterises at its viewBox size, and a 7700² canvas
 * is past sharp's pixel limit — so the copy handed to the rasteriser gets
 * explicit dimensions. Rendering at 512 and downscaling keeps the traced curves
 * smooth at the sizes that matter.
 */
const RASTER = 512;
const render = (size, stroke) =>
  sharp(Buffer.from(buildSvg(stroke).replace('<svg ', `<svg width="${RASTER}" height="${RASTER}" `)))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

writeFileSync(at('public/apple-touch-icon.png'), await render(180, 150));

/*
 * ICO, hand-assembled: a 6-byte header, one 16-byte directory entry per size,
 * then the images. Since Vista an entry may hold a whole PNG rather than a BMP,
 * which is why sharp's PNG output can be dropped in unchanged.
 */
const SIZES = [
  { size: 16, stroke: 420 },
  { size: 32, stroke: 280 },
  { size: 48, stroke: 200 },
];
const images = await Promise.all(SIZES.map(({ size, stroke }) => render(size, stroke)));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(images.length, 4);

let offset = header.length + images.length * 16;

const entries = images.map((image, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(SIZES[i].size, 0); // width  (0 would mean 256)
  entry.writeUInt8(SIZES[i].size, 1); // height
  entry.writeUInt8(0, 2); // palette size, 0 for truecolour
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.length;
  return entry;
});

writeFileSync(at('public/favicon.ico'), Buffer.concat([header, ...entries, ...images]));

console.log(
  `favicon.svg ${(svg.length / 1024).toFixed(1)} kB (from ${(source.length / 1024).toFixed(1)} kB)\n` +
    `favicon.ico ${(offset / 1024).toFixed(1)} kB — ${SIZES.map((s) => s.size).join(', ')} px\n` +
    `apple-touch-icon.png 180 px`,
);
