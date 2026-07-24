import type { ImageMetadata } from 'astro';

import birgit from '../assets/members/birgit.jpg';
import carina from '../assets/members/carina.jpg';
import harald from '../assets/members/harald.jpg';
import karin from '../assets/members/karin.jpg';
import martin from '../assets/members/martin.jpg';
import wolfgang from '../assets/members/wolfgang.jpg';

export interface Member {
  name: string;
  role: string;
  /** Missing until a photo exists — the grid renders a striped slot instead. */
  photo?: ImageMetadata;
}

/*
 * Order matches the design: the grid is 4-up, so this reads as a row of four
 * then a row of three.
 */
export const members: Member[] = [
  { name: 'Carina Wojtak', role: 'Gesang', photo: carina },
  { name: 'Wolfgang Neumar', role: 'Gitarre', photo: wolfgang },
  { name: 'Birgit Hrazdera', role: 'Saxophon', photo: birgit },
  { name: 'Melanie Schallauer', role: 'Saxophon' }, // TODO: no photo supplied yet.
  { name: 'Harald Pixner', role: 'Bass', photo: harald },
  { name: 'Martin Stummer', role: 'Schlagzeug', photo: martin },
  { name: 'Karin Huber', role: 'Piano', photo: karin },
];
