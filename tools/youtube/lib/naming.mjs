export const BAND = 'The Bumblebees';

/* Windows rejects these characters outright, and a trailing dot or space is
 * silently dropped from a name, which would leave two songs fighting over one
 * file. Titles are free text, so neither can be assumed away. */
export const fileSafe = (s) =>
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
export const titleCase = (s) => s.replace(/(^|\s)(\S)/g, (_, lead, first) => lead + first.toUpperCase());

/* The multitrack exports are filed with an " MTK" suffix. That is studio
 * bookkeeping rather than part of the song, so it is stripped before anything is
 * named after it — matched case-insensitively and only as a whole word, so a
 * title that merely contains those letters is left alone. */
export const MULTITRACK_TAG = /(?:^|\s+)MTK\b/gi;

/* Named from the title rather than the recording: the title is the song's real
 * name and carries the punctuation the filename should have — "Sweet Child O'
 * Mine", where the recording is filed as "sweet child MTK.mp3". */
export const outputName = (title) => `${titleCase(fileSafe(title.replace(MULTITRACK_TAG, '')))} - ${BAND}`;
