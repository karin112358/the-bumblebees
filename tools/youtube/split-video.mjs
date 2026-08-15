/*
 * Cuts a gig's whole-concert recording into one YouTube-ready MP4 per song,
 * driven by that gig's split-video.csv.
 *
 *   node tools/youtube/split-video.mjs "2026-07-11 Sierning"   # that gig
 *   node tools/youtube/split-video.mjs                          # newest gig
 *   node tools/youtube/split-video.mjs --images-only            # overlays, no video
 *   node tools/youtube/split-video.mjs --force                  # rebuild everything
 *
 * split-video.csv is semicolon-delimited with the header
 *
 *   from;until;title;artist;location;date
 *
 * `from` and `until` are timestamps into the gig's full-video.mp4, written as
 * seconds, M:SS, MM:SS or H:MM:SS, each with an optional .ms fraction. Rows
 * whose timestamps are still empty are reported and skipped rather than treated
 * as errors, so the file can be filled in song by song while scrubbing through
 * the recording. Every other %column% token in video-overlay.svg is replaced
 * with the row's value, exactly as create-video-from-mp3.mjs does for covers.
 *
 * Each row becomes <gig>/out/split-video/"<Title> - The Bumblebees.mp4": the
 * row's range cut from full-video.mp4, with the rendered overlay faded in over
 * the opening, held, and faded out (FADE_IN/HOLD/FADE_OUT below). Each tool
 * owns a subfolder of out/, keeping these clear of the identically-named
 * still-image MP4s from create-video-from-mp3.mjs.
 *
 * The overlay's bee and wordmark are injected from src/assets/logo/ at build
 * time — the template only carries placeholder hrefs — so the site and the
 * videos can never disagree about the logo.
 *
 * --images-only stops after rendering the overlay PNGs and does not need the
 * recording to exist. Without a probeable source the title is fitted against
 * the template's full 1920 px width instead of the source's visible frame
 * width, which is close enough for proofing the design.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';

import { encode, probeVideo } from './lib/ffmpeg.mjs';
import { loadFonts } from './lib/fonts.mjs';
import { listGigs } from './lib/gigs.mjs';
import { readRows } from './lib/csv.mjs';
import { outputName } from './lib/naming.mjs';
import { at, YOUTUBE_DIR } from './lib/paths.mjs';
import {
  makeMeasurer,
  readTextOf,
  setAttr,
  setFontSize,
  setImageHref,
  substituteRow,
  toDataUri,
} from './lib/svg.mjs';

/* Air between the rule's underside and the tops of the title's capitals, at the
 * title's authored size. A shrunk title gets proportionally less: the gap is
 * part of the title block's look, and held constant it reads ever larger as the
 * letters get smaller. */
const RULE_GAP = 24;

const CSV_NAME = 'split-video.csv';
const SOURCE_NAME = 'full-video.mp4';
const TEMPLATE = join(YOUTUBE_DIR, 'video-overlay.svg');
const LOGOS = [
  ['bee', at('src/assets/logo/bee.svg')],
  ['wordmark', at('src/assets/logo/wordmark.svg')],
];

/* The overlay is authored on a 1920×1080 canvas with 120 px of air on the left;
 * text must also stay 120 px clear of the frame's right edge. */
const WIDTH = 1920;
const MARGIN = 120;

/* Seconds of overlay at the start of every song: fade in, hold, fade out. */
const FADE_IN = 0.5;
const HOLD = 5;
const FADE_OUT = 1;

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
      `Usage: node tools/youtube/split-video.mjs [gig folder] [--images-only] [--force]`,
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

const source = join(gigDir, SOURCE_NAME);

if (!imagesOnly && !existsSync(source)) {
  console.error(`No ${SOURCE_NAME} in ${gigDir} — nothing to split.`);
  process.exit(1);
}

const outDir = join(gigDir, 'out', 'split-video');
mkdirSync(outDir, { recursive: true });

/* --------------------------------------------------------------------- source */

/*
 * The recording decides the geometry. This gig's camera shoots 1440×1080 (4:3),
 * so the 1920-wide overlay pinned at the top-left corner loses its right side at
 * the frame edge — by design, everything it draws is left-aligned — and text may
 * only run to the *visible* width. That width is the source's, scaled to the
 * overlay's 1080-line canvas, so a future 16:9 gig gets the full 1920 without a
 * code change.
 */
const video = existsSync(source) ? probeVideo(source) : null;

if (!imagesOnly && !video) {
  console.error(`ffprobe could not read ${source}`);
  process.exit(1);
}

const visibleWidth = video ? Math.round((video.width * 1080) / video.height) : WIDTH;
const maxTextWidth = visibleWidth - MARGIN * 2;

/* ---------------------------------------------------------------------- fonts */

let font;
try {
  font = await loadFonts();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const { inkBox, measure, fitFontSize } = makeMeasurer(font);

/* ------------------------------------------------------------------- template */

let template = readFileSync(TEMPLATE, 'utf8');
for (const [id, path] of LOGOS) {
  if (!existsSync(path)) {
    console.error(`Missing logo ${path}`);
    process.exit(1);
  }
  template = setImageHref(template, id, toDataUri(path));
}

/* A template edit that breaks the id-matching regex would otherwise render every
 * video without its logos and nobody would notice until after upload. Each
 * injected tag carries the URI twice, as href and xlink:href. */
const injected = template.split('data:image/svg+xml').length - 1;
if (injected !== LOGOS.length * 2) {
  console.error(
    `${TEMPLATE} lost its logo slots — expected <image> tags with ids ` +
      `${LOGOS.map(([id]) => `"${id}"`).join(' and ')}.`,
  );
  process.exit(1);
}

/* Read from the template rather than duplicated here, so re-authoring the
 * overlay cannot silently desync the rule placement. */
const titleBaseline = Number(template.match(/<text[^>]*id="song-title"[^>]*?\sy="([\d.]+)"/)?.[1] ?? 850);
const ruleHeight = Number(template.match(/<rect[^>]*id="rule"[^>]*?\sheight="([\d.]+)"/)?.[1] ?? 3);

/*
 * The footer is authored as venue | dot | date with hardcoded positions that only
 * suit one venue length. The line is left-aligned, so it just flows: the dot goes
 * a gap after the measured venue text and the date a gap after the dot.
 */
const FOOTER = {
  family: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  size: 34,
  spacing: 3.4,
  gap: 24,
};

const flowFooter = (svg) => {
  const venue = measure(readTextOf(svg, 'venue'), FOOTER.family, FOOTER.size, FOOTER.spacing);
  if (venue === 0) return svg;
  const dot = MARGIN + venue + FOOTER.gap;
  const placed = setAttr(svg, 'dot', 'cx', Math.round(dot * 10) / 10);
  return setAttr(placed, 'date', 'x', Math.round((dot + FOOTER.gap) * 10) / 10);
};

/* ----------------------------------------------------------------- timestamps */

/* Seconds, M:SS, MM:SS or H:MM:SS, optional .ms — returns seconds or null. The
 * two leading groups are both optional, so whichever ones matched are read from
 * the right: the last is minutes, the one before it hours. */
const parseTimestamp = (s) => {
  const match = /^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (!match) return null;
  const [, first, second, secondsPart] = match;
  const seconds = Number.parseFloat(secondsPart);
  const minutes = Number.parseInt(second ?? first ?? '0', 10);
  const hours = second === undefined ? 0 : Number.parseInt(first ?? '0', 10);
  if (seconds >= 60 || (second !== undefined && minutes >= 60)) return null;
  return hours * 3600 + minutes * 60 + seconds;
};

/* ---------------------------------------------------------------------- songs */

const songs = readRows(csvPath);

if (songs.length === 0) {
  console.error(`${csvPath} has a header but no songs.`);
  process.exit(1);
}

const templateMtime = statSync(TEMPLATE).mtimeMs;
const csvMtime = statSync(csvPath).mtimeMs;
const logoMtimes = LOGOS.map(([, path]) => statSync(path).mtimeMs);

const summary = [];
const seenNames = new Set();
const ranges = [];

for (const song of songs) {
  if (!song.title) {
    console.error(`  ! (untitled): row has no title, so its output cannot be named`);
    process.exitCode = 1;
    continue;
  }

  /* Empty timestamps are how a half-filled setlist looks while scrubbing through
   * the recording, so they are a notice rather than an error. */
  if (!song.from && !song.until) {
    summary.push(`  ~ ${song.title} — from/until not filled in yet`);
    continue;
  }

  const from = parseTimestamp(song.from);
  const until = parseTimestamp(song.until);

  if (from === null || until === null) {
    const bad = from === null ? `from "${song.from}"` : `until "${song.until}"`;
    console.error(`  ! ${song.title}: cannot read ${bad} — use seconds, M:SS, MM:SS or H:MM:SS`);
    process.exitCode = 1;
    continue;
  }
  if (until <= from) {
    console.error(`  ! ${song.title}: until (${song.until}) is not after from (${song.from})`);
    process.exitCode = 1;
    continue;
  }
  if (video?.duration && until > video.duration + 0.5) {
    console.error(
      `  ! ${song.title}: until (${song.until}) is past the end of ${SOURCE_NAME} ` +
        `(${Math.floor(video.duration / 60)}:${String(Math.floor(video.duration % 60)).padStart(2, '0')})`,
    );
    process.exitCode = 1;
    continue;
  }

  /* Neighbouring songs legitimately share a little applause or a segue, so an
   * overlap is pointed out rather than refused. */
  const overlap = ranges.find((r) => from < r.until && until > r.from);
  if (overlap) {
    console.warn(`  ? ${song.title}: overlaps ${overlap.title} (${song.from}–${song.until})`);
  }

  const stem = outputName(song.title);
  const png = join(outDir, `${stem}.png`);
  const mp4 = join(outDir, `${stem}.mp4`);
  const partial = join(outDir, `${stem}.part.mp4`);

  /* Two rows that reduce to the same name would have the second quietly replace
   * the first. */
  if (seenNames.has(stem)) {
    console.error(`  ! ${song.title}: an earlier row already writes "${stem}.mp4"`);
    process.exitCode = 1;
    continue;
  }
  seenNames.add(stem);
  ranges.push({ from, until, title: song.title });

  /* Decided before rendering, not after, because the target is rewritten on every
   * run and comparing against it afterwards would never let anything skip. The
   * logos count as inputs because they are injected into every overlay. */
  const target = imagesOnly ? png : mp4;
  const inputs = [templateMtime, csvMtime, ...logoMtimes];
  if (!imagesOnly) inputs.push(statSync(source).mtimeMs);

  if (!force && existsSync(target)) {
    const built = statSync(target).mtimeMs;
    if (inputs.every((changed) => built > changed)) {
      summary.push(`  = ${song.title} — up to date`);
      continue;
    }
  }

  let svg = substituteRow(template, song);

  for (const [id, family, size, spacing] of [
    ['song-title', 'Anton, Impact, sans-serif', 142, 0.7],
    ['original-artist', "'Barlow Condensed', 'Arial Narrow', sans-serif", 44, 2.6],
  ]) {
    const text = readTextOf(svg, id);
    const fitted = fitFontSize(text, family, size, spacing, maxTextWidth);
    if (fitted !== size) svg = setFontSize(svg, id, fitted);

    /* The rule above the title matches exactly the title's rendered box —
     * measured after fitting, since a shrunk title is both narrower and shorter
     * than the authored size suggests. The title hangs from a fixed baseline,
     * so when it shrinks its cap tops sit lower; the rule follows them down
     * instead of floating at its authored height with a widening gap. */
    if (id === 'song-title') {
      const box = inkBox(text, family, fitted, spacing);
      if (box.width > 0) {
        svg = setAttr(svg, 'rule', 'width', Math.round(box.width * 10) / 10);
        /* Anchored to cap height, not to the line's own tallest ink: glyphs
         * like parentheses overshoot the capitals in Anton, and a rule keyed
         * to them would float visibly higher above the letters. */
        const capTop = titleBaseline - inkBox('H', family, fitted, 0).ascent;
        const gap = RULE_GAP * (fitted / size);
        svg = setAttr(svg, 'rule', 'y', Math.round((capTop - gap - ruleHeight) * 10) / 10);
      }
    }
  }

  svg = flowFooter(svg);

  /* No opaque background and semi-transparent scrim stops: the PNG keeps real
   * alpha (resvg's canvas is transparent), which the fade below relies on. */
  writeFileSync(png, new Resvg(svg, { font, fitTo: { mode: 'width', value: WIDTH } }).render().asPng());

  if (imagesOnly) {
    summary.push(`  + ${song.title} — ${stem}.png, ${(statSync(png).size / 1024).toFixed(0)} kB`);
    continue;
  }

  /*
   * One pass per song. -ss before -i seeks fast (keyframe, then decode-and-
   * discard) and is frame-accurate because everything is re-encoded anyway; it
   * also resets timestamps to zero, so the fade times below are song-relative.
   *
   * The overlay PNG needs -loop 1: a single frame reaches EOF immediately and
   * fade would have nothing left to fade. `alpha=1` animates only the alpha
   * plane — hence the explicit format=rgba first — so the scrim fades as a
   * whole instead of blending to black. scale=-2:H matches the overlay to the
   * source's line count (a no-op at 1080); pinned at 0:0, whatever sticks out
   * past the source's right edge is clipped by overlay itself. eof_action=pass
   * plus the enable window keeps the main video untouched once the overlay has
   * fully faded, and enable also skips the per-frame compositing cost for the
   * rest of the song.
   *
   * Real footage, so none of the still-image tricks from create-video-from-mp3
   * apply: default GOP, no stillimage tune. crf 19 is generous against the
   * camera's ~2.5 Mbps source. The audio is Opus in this recording, which MP4
   * players widely refuse, so it is re-encoded to the same 192k AAC the other
   * tool uses.
   */
  const overlayEnd = FADE_IN + HOLD + FADE_OUT;
  const filter =
    `[1:v]format=rgba,scale=-2:${video.height},` +
    `fade=t=in:st=0:d=${FADE_IN}:alpha=1,` +
    `fade=t=out:st=${FADE_IN + HOLD}:d=${FADE_OUT}:alpha=1[ov];` +
    `[0:v][ov]overlay=0:0:eof_action=pass:enable='lte(t,${overlayEnd + 0.1})'[v]`;

  const result = encode(
    [
      '-y',
      '-ss', from.toFixed(3), '-t', (until - from).toFixed(3), '-i', source,
      '-loop', '1', '-framerate', '30', '-i', png,
      '-filter_complex', filter,
      '-map', '[v]', '-map', '0:a',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
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
