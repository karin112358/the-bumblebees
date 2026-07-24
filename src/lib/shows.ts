import { getCollection, type CollectionEntry } from 'astro:content';

export type Show = CollectionEntry<'shows'>;

/**
 * Splits tour dates into upcoming and past.
 *
 * The cutoff is frozen at build time, so a gig stays under "upcoming" until the
 * next rebuild. That's fine while dates are edited by hand — editing shows.yaml
 * is itself a rebuild — but it means the site needs rebuilding to self-correct.
 */
export async function getShows() {
  const all = await getCollection('shows');

  // Day boundary rather than the current instant, so a show doesn't move to
  // "past" while the band is still on stage.
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);

  const upcoming = all
    .filter((s) => s.data.date >= cutoff)
    .sort((a, b) => a.data.date.valueOf() - b.data.date.valueOf());

  const past = all
    .filter((s) => s.data.date < cutoff)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return { upcoming, past };
}

/*
 * Dates in YAML parse to UTC midnight, so they must be formatted in UTC too —
 * otherwise they render a day early anywhere west of Greenwich.
 *
 * de-AT rather than de-DE: the band is Upper Austrian, and the two differ on
 * month names (Jänner/Januar) even though the abbreviations here happen to match.
 */
const LOCALE = 'de-AT';

/**
 * The design splits each date across two lines — "FR 28" above, "AUG" below —
 * so the parts are returned separately rather than as one formatted string.
 */
export function formatShowDate(date: Date) {
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString(LOCALE, { timeZone: 'UTC', ...options });

  return {
    // "Fr" / "So" — uppercased to match the display face.
    weekday: part({ weekday: 'short' }).replace('.', '').toUpperCase(),
    day: part({ day: 'numeric' }),
    // "Aug" / "Sep", likewise without the German trailing period.
    month: part({ month: 'short' }).replace('.', '').toUpperCase(),
  };
}

/** Machine-readable value for <time datetime="…">. */
export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
