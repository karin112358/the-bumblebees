import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const shows = defineCollection({
  loader: file('src/data/shows.yaml'),
  schema: z.object({
    // file() requires a unique id per entry when the source is an array.
    id: z.string(),
    date: z.coerce.date(),
    venue: z.string(),
    city: z.string(),
    country: z.string().optional(),
    ticketUrl: z.url().optional(),
    soldOut: z.boolean().default(false),
    // Rendered as the tag at the right of each show row, e.g. "Eintritt frei".
    note: z.string().optional(),
  }),
});

export const collections = { shows };
