import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { YOUTUBE_DIR } from './paths.mjs';

/* Gig folders are the directories under tools/youtube that carry the tool's
 * marker CSV. They are named "YYYY-MM-DD Place", so sorting them as strings
 * sorts them by date and the last one is the most recent gig. */
export function listGigs(marker) {
  return readdirSync(YOUTUBE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(YOUTUBE_DIR, e.name, marker)))
    .map((e) => e.name)
    .sort();
}
