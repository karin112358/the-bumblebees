// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Served from the custom domain's root via GitHub Pages, so there is no
  // `base`. `site` is what canonical, og: and sitemap URLs are built from —
  // change it here if the domain ever changes.
  site: 'https://thebumblebees.at',
  // Writes sitemap-index.xml (+ sitemap-0.xml) at build time; public/robots.txt
  // points crawlers at it.
  integrations: [sitemap()],
});
