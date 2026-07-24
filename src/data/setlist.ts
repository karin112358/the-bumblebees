export interface Song {
  title: string;
  artist: string;
}

/*
 * An excerpt, not the full set — the numbering the section renders is just the
 * position in this array, so reordering here reorders the printed list.
 *
 * Kept as a plain module rather than a content collection like shows.yaml:
 * there is nothing to parse, coerce or filter, so the collection machinery
 * would buy nothing.
 */
export const setlist: Song[] = [
  { title: 'Ex’s & Oh’s', artist: 'Elle King' },
  { title: 'December, 1963', artist: 'The Four Seasons' },
  { title: 'Smooth Operator', artist: 'Sade' },
  { title: 'Virtual Insanity', artist: 'Jamiroquai' },
  { title: 'Under Pressure', artist: 'Queen & David Bowie' },
  { title: 'Hold the Line', artist: 'Toto' },
  { title: 'I Wish', artist: 'Stevie Wonder' },
  { title: 'Sweet Child O’ Mine', artist: 'Guns N’ Roses' },
];
