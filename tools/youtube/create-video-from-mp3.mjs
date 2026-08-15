/*
 * Builds one YouTube-ready MP4 per song of a gig, from that gig's
 * create-video-from-mp3.csv.
 *
 *   node tools/youtube/create-video-from-mp3.mjs "2026-07-11 Sierning"   # that gig
 *   node tools/youtube/create-video-from-mp3.mjs                          # newest gig
 *   node tools/youtube/create-video-from-mp3.mjs --images-only            # covers, no video
 *   node tools/youtube/create-video-from-mp3.mjs --force                  # rebuild everything
 *
 * Each row of create-video-from-mp3.csv becomes a cover PNG rendered from
 * youtube-cover.svg and then a still-image MP4 carrying the row's MP3. Outputs
 * land in <gig>/out/create-video-from-mp3/, named "<Title> - The Bumblebees"
 * after the row's title rather than after the MP3.
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
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';

import { encode, probeDuration } from './lib/ffmpeg.mjs';
import { loadFonts } from './lib/fonts.mjs';
import { listGigs } from './lib/gigs.mjs';
import { readRows } from './lib/csv.mjs';
import { outputName } from './lib/naming.mjs';
import { at, YOUTUBE_DIR } from './lib/paths.mjs';
import {
  IMAGE_TYPES,
  makeMeasurer,
  readTextOf,
  setAttr,
  setFontSize,
  setImageHref,
  substituteRow,
  toDataUri,
} from './lib/svg.mjs';

const CSV_NAME = 'create-video-from-mp3.csv';
const TEMPLATE = join(YOUTUBE_DIR, 'youtube-cover.svg');

const WIDTH = 1920;

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
      `Usage: node tools/youtube/create-video-from-mp3.mjs [gig folder] [--images-only] [--force]`,
  );
  process.exit(1);
}

/* ---------------------------------------------------------------- gig folder */

const gigFolders = listGigs(CSV_NAME);
const gigName = requested ?? gigFolders.at(-1);

if (!gigName) {
  console.error(`No gig folder with a ${CSV_NAME} found in ${YOUTUBE_DIR}`);
  process.exit(1);
}

const gigDir = join(YOUTUBE_DIR, gigName);
const csvPath = join(gigDir, CSV_NAME);

if (!existsSync(csvPath)) {
  console.error(`No ${CSV_NAME} in ${gigDir}\nAvailable gigs: ${gigFolders.join(', ') || '(none)'}`);
  process.exit(1);
}

/* Each tool owns a subfolder of out/, so the two artifact families cannot fight
 * over the identical "<Title> - The Bumblebees" file names. */
const outDir = join(gigDir, 'out', 'create-video-from-mp3');
mkdirSync(outDir, { recursive: true });

/* ---------------------------------------------------------------------- fonts */

let font;
try {
  font = await loadFonts();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const { measure, fitFontSize } = makeMeasurer(font);

/* ----------------------------------------------------------------- background */

/* A gig-specific photo sits with the recordings; the band's stock shots live in
 * the site's asset folder. Looking in both means the CSV can just name a file. */
const imageDirs = [gigDir, at('src/assets/images')];
const findImage = (name) => imageDirs.map((dir) => join(dir, name)).find(existsSync) ?? null;

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

const songs = readRows(csvPath);

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

  let svg = substituteRow(template, song);

  for (const [id, family, size, spacing] of [
    ['song-title', 'Anton, Impact, sans-serif', 180, 1],
    ['original-artist', "'Barlow Condensed', 'Arial Narrow', sans-serif", 54, 3.2],
  ]) {
    const fitted = fitFontSize(readTextOf(svg, id), family, size, spacing, MAX_TEXT_WIDTH);
    if (fitted !== size) svg = setFontSize(svg, id, fitted);
  }

  svg = centreFooter(svg);

  if (background) svg = setImageHref(svg, 'background', toDataUri(background));

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
   */
  const result = encode(
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
    partial,
    mp4,
  );

  if (!result.ok) {
    console.error(`  ! ${song.title}: ffmpeg failed\n${result.detail}`);
    process.exitCode = 1;
    continue;
  }

  const mb = (statSync(mp4).size / 1024 / 1024).toFixed(1);
  summary.push(`  + ${song.title} — ${stem}.mp4, ${mb} MB`);
}

const heading = `${gigName} — ${songs.length} song${songs.length === 1 ? '' : 's'}`;
console.log([heading, ...summary].join('\n'));
