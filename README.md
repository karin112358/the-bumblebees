# The Bumblebees

Website of [The Bumblebees](https://thebumblebees.at) — a seven-piece hobby band from Upper Austria playing rock with a horn section. The site is a one-page site in German with standalone Impressum and Datenschutz pages.

## Tech stack

- [Astro](https://astro.build/) 7, fully static output, no UI framework
- TypeScript (strict), plain CSS in `src/styles/global.css`
- Fonts self-hosted via `@fontsource` packages
- Privacy-friendly analytics via Simple Analytics

## Getting started

Prerequisites:

- Node.js >= 22.12.0
- `ffmpeg` / `ffprobe` on PATH — only needed for the [YouTube video tools](#youtube-video-tools), not for the site

```sh
npm install
npm run dev        # dev server at http://localhost:4321
npm run build      # production build -> dist/
npm run preview    # preview the production build
npx astro check    # type checking
```

## Project structure

```
src/
  pages/           index.astro (one-page site), impressum.astro, datenschutz.astro
  components/      Hero, About, Setlist, BandGrid, Gallery, VideoSection, Shows, ...
  layouts/         BaseLayout.astro (HTML shell, SEO/OG tags, favicons, analytics)
  data/            shows.yaml (concerts), members.ts, setlist.ts, social.ts
  lib/             shows.ts (upcoming/past split)
  assets/          images, logos (bee.svg, wordmark.svg)
  styles/          global.css (the whole design system)
public/            favicons (generated, committed)
scripts/           build-favicon.mjs
tools/youtube/     offline video pipeline for YouTube uploads
```

## Common tasks

### Adding a concert

Append an entry to `src/data/shows.yaml`. The schema is documented in the file itself and enforced by `src/content.config.ts` (`date` as `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`, plus `venue`, `city` and optional fields).

Upcoming vs. past shows are computed at **build time** (`src/lib/shows.ts`), so the site has to be rebuilt for a gig to move to "past" — any push to `main` does that.

### Regenerating favicons

After changing `src/assets/logo/bee.svg`:

```sh
node scripts/build-favicon.mjs
```

Commit the regenerated files in `public/` (this script is intentionally not part of `astro build`).

## Privacy constraints

The Datenschutz page makes promises that the code must keep:

- The YouTube embed (`src/components/VideoSection.astro`) is a two-step consent facade: **nothing** is requested from `youtube-nocookie.com` until the visitor clicks the consent button.
- Social links (`src/data/social.ts`) are plain outbound links — no embeds, plugins, or tracking pixels.

Don't break these when changing components.

## YouTube video tools

`tools/youtube/` contains two Node scripts that produce YouTube-ready MP4s for a gig. Each gig lives in a folder named `YYYY-MM-DD Place` (e.g. `tools/youtube/2026-07-11 Sierning/`) and is driven by a semicolon-delimited CSV. Both scripts require `ffmpeg`/`ffprobe` on PATH.

### `npm run youtube:mp3`

Reads `create-video-from-mp3.csv` (`file;title;artist;location;date;image`) and builds one still-image MP4 per MP3: a cover PNG is rendered from `youtube-cover.svg` (with `%column%` tokens substituted per row) and combined with the audio. Output goes to `<gig>/out/create-video-from-mp3/`.

### `npm run youtube:split`

Reads `split-video.csv` (`from;until;title;artist;location;date`) and cuts one MP4 per song out of the full concert recording — the camera's numbered AVCHD segments (`00000.MTS`, `00001.MTS`, ...) treated as one continuous timeline. Each song gets a lower-third overlay rendered from `video-overlay.svg`, faded in over the opening. Rows with empty timestamps are skipped and reported, so the CSV can be filled in song by song while scrubbing. Output goes to `<gig>/out/split-video/` plus thumbnails.

### Shared behavior

- Newest gig folder is picked automatically; pass a folder name to override.
- `--images-only` renders only covers/overlays (no media files needed), `--force` rebuilds everything.

```sh
node tools/youtube/split-video.mjs "2026-07-11 Sierning" --images-only
node tools/youtube/create-video-from-mp3.mjs --force
```

Media files (`*.mp3`, `*.MTS`, `full-video.mp4`, `out/`) are deliberately gitignored — they are large, and the recordings are of songs the band holds no rights to. Only the CSVs, SVG templates, and scripts are tracked; drop the media back into a gig folder to rebuild.

## Deployment

Every push to `main` deploys via GitHub Actions (`.github/workflows/deploy.yml`) to GitHub Pages using `withastro/action`. The custom domain `thebumblebees.at` is configured in the repository's Pages settings (no `CNAME` file is tracked).
