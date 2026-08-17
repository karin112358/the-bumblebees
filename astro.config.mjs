// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Deployed as a GitHub Pages *project* page, so the origin and the
  // subdirectory are configured separately: `site` is the bare origin and
  // `base` is the repo name. Together they produce
  // https://karin112358.github.io/the-bumblebees/ for canonical and og: URLs.
  //
  // If this ever moves to a custom domain, set `site` to that domain and
  // delete `base` — a custom domain serves from the root.
  site: 'https://thebumblebees.at',
});
