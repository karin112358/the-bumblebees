/*
 * Builds one YouTube-ready MP4 per song of a gig, from that gig's songs.csv.
 *
 *   node tools/youtube/build-videos.mjs "2026-07-11 Sierning"   # that gig
 *   node tools/youtube/build-videos.mjs                          # newest gig
 *   node tools/youtube/build-videos.mjs --images-only            # covers, no video
 *   node tools/youtube/build-videos.mjs --force                  # rebuild everything
 *
 * Each row of songs.csv becomes a cover PNG rendered from youtube-cover.svg and
 * then a still-image MP4 carrying the row's MP3. Outputs land in <gig>/out/, named
 * "<Title> - The Bumblebees" after the row's title rather than after the MP3.
 *
 * --images-only stops after the cover. Encoding is by far the slow part, so this
 * is the mode for iterating on the template, and it does not need the MP3s to
 * exist yet — covers can be proofed before the recordings are exported.
 *
 * Substitution is driven by the CSV header, not by hardcoded column names: every
 * %column% token in the template is replaced with that row's value. Adding a
 * column to the CSV and a matching token to the SVG needs no change here.
 *
 * Two columns mean something beyond text. `file` names the MP3 and gives the
 * outputs their name; `image` optionally replaces the cover's background photo,
 * looked up in the gig folder first and then in src/assets/images. A row with no
 * `image` keeps whatever background the template carries.
 */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'woff2-encoder';

const at = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

const YOUTUBE_DIR = at('tools/youtube');
const TEMPLATE = join(YOUTUBE_DIR, 'youtube-cover.svg');
const FONT_CACHE = join(YOUTUBE_DIR, '.fonts');

const WIDTH = 1920;
const HEIGHT = 1080;

/* The title is centred on a 1920 px canvas; 120 px of air each side keeps it off
 * the edge, so this is the widest a line may render before it has to shrink. */
const MAX_TEXT_WIDTH = 1680;

const args = process.argv.slice(2);
const force = args.includes('--force');
const imagesOnly = args.includes('--images-only');
const requested = args.find((a) => !a.startsWith('--'));

/* A mistyped flag would otherwise be ignored, and the cost of that is a full
 * re-encode of every song before anyone notices. */
const unknown = args.filter((a) => a.startsWith('--') && !['--force', '--images-only'].includes(a));
if (unknown.length > 0) {
  console.error(
    `Unknown option${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}\n` +
      `Usage: node tools/youtube/build-videos.mjs [gig folder] [--images-only] [--force]`,
  );
  process.exit(1);
}

/* ---------------------------------------------------------------- gig folder */

const gigFolders = readdirSync(YOUTUBE_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(YOUTUBE_DIR, e.name, 'songs.csv')))
  .map((e) => e.name)
  .sort();

/* Folders are named "YYYY-MM-DD Place", so sorting them as strings sorts them by
 * date and the last one is the most recent gig. */
const gigName = requested ?? gigFolders.at(-1);

if (!gigName) {
  console.error(`No gig folder with a songs.csv found in ${YOUTUBE_DIR}`);
  process.exit(1);
}

const gigDir = join(YOUTUBE_DIR, gigName);
const csvPath = join(gigDir, 'songs.csv');

if (!existsSync(csvPath)) {
  console.error(`No songs.csv in ${gigDir}\nAvailable gigs: ${gigFolders.join(', ') || '(none)'}`);
  process.exit(1);
}

const outDir = join(gigDir, 'out');
mkdirSync(outDir, { recursive: true });

/* ---------------------------------------------------------------------- fonts */

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

mkdirSync(FONT_CACHE, { recursive: true });

const fontFiles = [];
for (const [ttfName, woff2Path] of FACES) {
  const ttf = join(FONT_CACHE, ttfName);
  if (!existsSync(ttf)) {
    const source = at(`node_modules/${woff2Path}`);
    if (!existsSync(source)) {
      console.error(`Missing font source ${source}\nRun \`npm install\` first.`);
      process.exit(1);
    }
    writeFileSync(ttf, Buffer.from(await decompress(readFileSync(source))));
  }
  fontFiles.push(ttf);
}

/*
 * With system fonts off, every family the template names that is *not* in this
 * list — Impact, Arial Narrow, system-ui, sans-serif, Manrope — collapses to
 * defaultFontFamily. Naming it explicitly is what makes that predictable: left
 * unset, resvg falls back to whichever face happens to be first in fontFiles.
 * So a broken cache shows up as visibly wrong Barlow Condensed titles rather
 * than as something silently arbitrary.
 */
const font = {
  loadSystemFonts: false,
  fontFiles,
  defaultFontFamily: 'Barlow Condensed',
};

/* ---------------------------------------------------------------------- audio */

/* Falls back to null on anything unexpected so the caller can use -shortest, which
 * is imprecise but never depends on the header being truthful. */
const probeDuration = (file) => {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  const seconds = Number.parseFloat(probe.stdout ?? '');
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/* ------------------------------------------------------------------ rendering */

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/*
 * resvg's bbox methods measure the whole document, and there is no way to ask for
 * one element, so width is measured against a throwaway SVG holding nothing but
 * the line in question. innerBBox() clips its result to the viewBox, hence the
 * deliberately oversized canvas — a tight one would report a truncated width.
 */
const measure = (text, family, size, spacing) => {
  const probe =
    `<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="2000" viewBox="0 0 20000 2000">` +
    `<text x="0" y="1000" font-family="${family}" font-size="${size}" letter-spacing="${spacing}">${text}</text></svg>`;
  return new Resvg(probe, { font }).innerBBox()?.width ?? 0;
};

/*
 * Long titles overflow the canvas at the template's 180 px, so shrink until they
 * fit. Scaling by the overflow ratio undershoots slightly — letter-spacing is an
 * absolute length and does not shrink with the font — so this converges from
 * above in one or two passes; the loop bound is only there to stop a pathological
 * input from spinning.
 */
const fitFontSize = (text, family, size, spacing) => {
  let current = size;
  for (let pass = 0; pass < 6; pass += 1) {
    const width = measure(text, family, current, spacing);
    if (width === 0 || width <= MAX_TEXT_WIDTH) break;
    current = Math.floor(current * (MAX_TEXT_WIDTH / width) * 10) / 10;
  }
  return current;
};

/* The opening tag of a <text> carries no '>' of its own, so [^>]* spans it even
 * though the template wraps these tags across several lines. */
const setFontSize = (svg, id, size) =>
  svg.replace(new RegExp(`(<text[^>]*id="${id}"[^>]*?font-size=")[^"]*(")`), `$1${size}$2`);

const readTextOf = (svg, id) =>
  svg.match(new RegExp(`<text[^>]*id="${id}"[^>]*>([\\s\\S]*?)</text>`))?.[1].trim() ?? '';

const setAttr = (svg, id, attr, value) =>
  svg.replace(new RegExp(`(<[a-z]+[^>]*id="${id}"[^>]*?\\s${attr}=")[^"]*(")`), `$1${value}$2`);

/* ------------------------------------------------------------- output naming */

const BAND = 'The Bumblebees';

/* Windows rejects these characters outright, and a trailing dot or space is
 * silently dropped from a name, which would leave two songs fighting over one
 * file. Titles are free text, so neither can be assumed away. */
const fileSafe = (s) =>
  s
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    /* A title ending in "?" or "!" is common and would otherwise leave the
     * substituted dash dangling at the end of the name. */
    .replace(/[-. ]+$/, '')
    .trim();

/* Only the first letter of each word is raised and the rest is left exactly as
 * the CSV wrote it. The usual title-case implementation lowercases the remainder,
 * which would turn "AC/DC" into "Ac/Dc" and "TNT" into "Tnt". */
const titleCase = (s) => s.replace(/(^|\s)(\S)/g, (_, lead, first) => lead + first.toUpperCase());

/* The multitrack exports are filed with an " MTK" suffix. That is studio
 * bookkeeping rather than part of the song, so it is stripped before anything is
 * named after it — matched case-insensitively and only as a whole word, so a
 * title that merely contains those letters is left alone. */
const MULTITRACK_TAG = /(?:^|\s+)MTK\b/gi;

/* Named from the title rather than the MP3: the title is the song's real name and
 * carries the punctuation the filename should have — "Sweet Child O' Mine", where
 * the recording is filed as "sweet child MTK.mp3". */
const outputName = (title) => `${titleCase(fileSafe(title.replace(MULTITRACK_TAG, '')))} - ${BAND}`;

/* ----------------------------------------------------------------- background */

/* What resvg can decode from a data URI. WebP is deliberately absent — it is not
 * supported, and a silent black background would be a confusing way to find out. */
const IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

/* A gig-specific photo sits with the recordings; the band's stock shots live in
 * the site's asset folder. Looking in both means the CSV can just name a file. */
const imageDirs = [gigDir, at('src/assets/images')];
const findImage = (name) => imageDirs.map((dir) => join(dir, name)).find(existsSync) ?? null;

/* Setlists usually share one photo across every song, so the base64 is built once
 * per file rather than once per row. */
const backgrounds = new Map();
const backgroundUri = (path) => {
  if (!backgrounds.has(path)) {
    const type = IMAGE_TYPES[extname(path).toLowerCase()];
    backgrounds.set(path, `data:${type};base64,${readFileSync(path).toString('base64')}`);
  }
  return backgrounds.get(path);
};

/* The template carries the photo twice, as xlink:href and href, so both are
 * rewritten — a stale xlink:href would win in some renderers. */
const setBackground = (svg, dataUri) =>
  svg.replace(/<image[^>]*id="background"[^>]*>/, (tag) =>
    tag.replace(/(\s(?:xlink:)?href=")[^"]*"/g, (_, lead) => `${lead}${dataUri}"`),
  );

/*
 * The footer is authored as venue | dot | date pivoting on a fixed centre, which
 * centres the line only when the two halves happen to be equally wide. They are
 * not — "SCHLOSS CAFE BAR SIERNING" against "11. JULI 2026" hangs visibly to the
 * left. Both halves are therefore measured and all three parts re-placed so the
 * line centres as a whole, keeping the authored 48 px on each side of the dot.
 */
const FOOTER = {
  family: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  size: 40,
  spacing: 4,
  gap: 48,
};

const centreFooter = (svg) => {
  const venue = measure(readTextOf(svg, 'venue'), FOOTER.family, FOOTER.size, FOOTER.spacing);
  const date = measure(readTextOf(svg, 'date'), FOOTER.family, FOOTER.size, FOOTER.spacing);
  if (venue === 0 && date === 0) return svg;

  /* The venue is anchored at its end and the date at its start, so these two x
   * values are the block's inner edges and the dot sits midway between them. */
  const venueX = WIDTH / 2 - (venue + FOOTER.gap * 2 + date) / 2 + venue;
  const places = [
    ['venue', 'x', venueX],
    ['separator', 'cx', venueX + FOOTER.gap],
    ['date', 'x', venueX + FOOTER.gap * 2],
  ];
  return places.reduce((out, [id, attr, x]) => setAttr(out, id, attr, Math.round(x * 10) / 10), svg);
};

/* ---------------------------------------------------------------------- songs */

/* UTF-8, semicolon-delimited, CRLF. Small and hand-maintained, so a full CSV
 * parser (quoting, embedded delimiters) would be more machinery than it earns. */
const rows = readFileSync(csvPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(';'));

const [header, ...body] = rows;
const columns = header.map((h) => h.trim());
const songs = body.map((cells) =>
  Object.fromEntries(columns.map((name, i) => [name, (cells[i] ?? '').trim()])),
);

if (songs.length === 0) {
  console.error(`${csvPath} has a header but no songs.`);
  process.exit(1);
}

/* Read once: the template is ~1.2 MB of base64 artwork, and resvg re-decodes all
 * of it on every construction. */
const template = readFileSync(TEMPLATE, 'utf8');
const templateMtime = statSync(TEMPLATE).mtimeMs;
const csvMtime = statSync(csvPath).mtimeMs;

const summary = [];
const seenNames = new Set();
const seenFiles = new Set();

for (const song of songs) {
  if (!song.file) {
    console.error(`  ! ${song.title || '(untitled)'}: row has no file name`);
    process.exitCode = 1;
    continue;
  }

  const mp3 = join(gigDir, song.file);

  /* The cover is built entirely from the CSV row, so the audio only has to be
   * there when there is a video to encode. */
  if (!imagesOnly && !existsSync(mp3)) {
    console.error(`  ! ${song.title}: no such MP3 "${song.file}" in ${gigName}`);
    process.exitCode = 1;
    continue;
  }

  if (!song.title) {
    console.error(`  ! "${song.file}": row has no title, so its output cannot be named`);
    process.exitCode = 1;
    continue;
  }

  const stem = outputName(song.title);
  const png = join(outDir, `${stem}.png`);
  const mp4 = join(outDir, `${stem}.mp4`);
  const partial = join(outDir, `${stem}.part.mp4`);

  /* Two rows that reduce to the same name would have the second quietly replace
   * the first. Sharing an MP3 is a separate mistake — it is how a copy-pasted row
   * shows up — and it would encode one recording twice under two names. */
  if (seenNames.has(stem)) {
    console.error(`  ! ${song.title}: an earlier row already writes "${stem}.mp4"`);
    process.exitCode = 1;
    continue;
  }
  if (seenFiles.has(song.file)) {
    console.error(`  ! ${song.title}: "${song.file}" is already used by an earlier row`);
    process.exitCode = 1;
    continue;
  }
  seenNames.add(stem);
  seenFiles.add(song.file);

  /* Resolved before the freshness check so a swapped photo counts as a change. */
  let background = null;
  if (song.image) {
    background = findImage(song.image);
    if (!background) {
      console.error(`  ! ${song.title}: no such image "${song.image}" in ${imageDirs.join(' or ')}`);
      process.exitCode = 1;
      continue;
    }
    if (!IMAGE_TYPES[extname(background).toLowerCase()]) {
      console.error(`  ! ${song.title}: "${song.image}" is not a format resvg can read (${Object.keys(IMAGE_TYPES).join(', ')})`);
      process.exitCode = 1;
      continue;
    }
  }

  /*
   * Decided before rendering, not after, because the target is rewritten on every
   * run and comparing against it afterwards would never let anything skip. The
   * CSV counts as an input to both modes: a corrected title has to re-render. The
   * MP3 only feeds the video.
   */
  const target = imagesOnly ? png : mp4;
  const inputs = [templateMtime, csvMtime];
  if (background) inputs.push(statSync(background).mtimeMs);
  if (!imagesOnly) inputs.push(statSync(mp3).mtimeMs);

  if (!force && existsSync(target)) {
    const built = statSync(target).mtimeMs;
    if (inputs.every((changed) => built > changed)) {
      summary.push(`  = ${song.title} — up to date`);
      continue;
    }
  }

  /* The design is set in capitals throughout. toUpperCase() maps ß to SS, so
   * "Schloß Cafe Bar Sierning" reads SCHLOSS CAFE BAR SIERNING as intended. */
  let svg = template;
  for (const [name, value] of Object.entries(song)) {
    svg = svg.replaceAll(`%${name}%`, xmlEscape(value.toUpperCase()));
  }

  /* %title% sits on its own indented line in the template. XML whitespace rules
   * would collapse that anyway, but a centred line is exactly where a stray
   * leading space would show, so it is removed rather than trusted. */
  svg = svg.replace(/>\s+(?=\S)/g, '>').replace(/\s+(?=<\/text>)/g, '');

  for (const [id, family, size, spacing] of [
    ['song-title', 'Anton, Impact, sans-serif', 180, 1],
    ['original-artist', "'Barlow Condensed', 'Arial Narrow', sans-serif", 54, 3.2],
  ]) {
    const fitted = fitFontSize(readTextOf(svg, id), family, size, spacing);
    if (fitted !== size) svg = setFontSize(svg, id, fitted);
  }

  svg = centreFooter(svg);

  if (background) svg = setBackground(svg, backgroundUri(background));

  writeFileSync(png, new Resvg(svg, { font, fitTo: { mode: 'width', value: WIDTH } }).render().asPng());

  if (imagesOnly) {
    summary.push(`  + ${song.title} — ${stem}.png, ${(statSync(png).size / 1024).toFixed(0)} kB`);
    continue;
  }

  const seconds = probeDuration(mp3);
  const length = seconds === null ? ['-shortest'] : ['-t', seconds.toFixed(3)];

  /*
   * A still image plus an audio track. Every number below came out of measuring
   * this cover, because the intuitive answers were wrong twice.
   *
   * Frame rate is the biggest lever on file size, which is not obvious. The
   * picture never changes, yet x264 still spends ~10 kB on each P-frame holding
   * it at the requested quality, and at 10 fps those P-frames were 65% of the
   * video track against the keyframes' 29%. So it is the sheer number of frames
   * that costs, not the keyframes. Dropping 10 fps to 2 took the video track from
   * 15.0 MB to 6.3 MB on a five-minute song. Do not go below ~2 fps; some players
   * and thumbnail extractors behave oddly. YouTube accepts frame rates outside
   * the usual set.
   *
   * Do NOT follow YouTube's "GOP of half the frame rate" advice. It is written
   * for moving footage; on a still frame it re-encodes the whole photograph
   * several times a second, measured at 163 MB against 27 MB for an identical
   * picture. At -g 250 and 2 fps a keyframe lands every 125 s, and seeking is
   * still instant because the frames in between are nearly empty.
   *
   * Audio is 192k AAC. The sources are ~200 kbps MP3s, so a higher rate spends
   * bits re-encoding detail that was discarded long ago — 384k cost an extra 5 MB
   * per song for nothing audible. Copying the MP3 stream through would save a
   * little more again and avoid a second lossy generation, but YouTube documents
   * AAC-LC and is silent on MP3, and it transcodes on ingest either way.
   *
   * Length comes from probing the MP3 and passing -t, not from -shortest.
   * -shortest overshoots: it stops feeding frames once the audio ends, but the
   * frames already buffered still get written, which left the video running 8 s
   * past the audio on a 5-minute track. -shortest_buf_duration does not rein that
   * in (measured: no better). An exact -t costs one ffprobe and truncates nothing
   * — the encoded audio is sample-for-sample what -shortest produced.
   *
   * yuv420p is what makes the file play everywhere. It drops alpha without
   * compositing, which is safe only because the template paints an opaque rect
   * behind everything.
   *
   * The encode goes to a .part.mp4 and is renamed only on success. ffmpeg writes
   * the moov atom last — +faststart moves it to the front in a second pass — so a
   * run stopped with Ctrl+C leaves an unplayable file. Written under the real
   * name, that fragment carries a fresh mtime and every later run then reports it
   * as up to date, which is exactly how a 3 MB stub survived here. The extension
   * stays .mp4 because ffmpeg picks its muxer from it.
   */
  const ffmpeg = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loop', '1', '-framerate', '2', '-i', png,
      '-i', mp3,
      '-c:v', 'libx264', '-preset', 'medium', '-tune', 'stillimage', '-crf', '18',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-bf', '2', '-g', '250',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      ...length,
      '-movflags', '+faststart',
      partial,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
  );

  if (ffmpeg.error || ffmpeg.status !== 0) {
    rmSync(partial, { force: true });
    const detail = ffmpeg.error?.message ?? ffmpeg.stderr?.trim().split('\n').slice(-5).join('\n');
    console.error(`  ! ${song.title}: ffmpeg failed\n${detail}`);
    process.exitCode = 1;
    continue;
  }

  renameSync(partial, mp4);

  const mb = (statSync(mp4).size / 1024 / 1024).toFixed(1);
  summary.push(`  + ${song.title} — ${stem}.mp4, ${mb} MB`);
}

const heading = `${gigName} — ${songs.length} song${songs.length === 1 ? '' : 's'}`;
console.log([heading, ...summary].join('\n'));
