import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const shows = defineCollection({
  loader: file('src/data/shows.yaml'),
  schema: z
    .object({
      // file() requires a unique id per entry when the source is an array.
      id: z.string(),
      // Either "2026-08-28" or "2026-08-28 18:00". js-yaml hands a bare date to
      // us as a Date (at UTC midnight) but a date+time as a plain string, so
      // accept both and pull the parts out ourselves in the transform below.
      date: z.union([z.string(), z.date()]),
      venue: z.string(),
      city: z.string(),
      country: z.string().optional(),
      ticketUrl: z.url().optional(),
      soldOut: z.boolean().default(false),
      // Rendered as the tag at the right of each show row, e.g. "Eintritt frei".
      note: z.string().optional(),
    })
    .transform((entry, ctx) => {
      // Read the calendar date and optional start time straight from the text
      // and build a *local* Date from the parts — never via a UTC instant. So
      // the weekday, day, month and time all read back exactly as written, the
      // same on this machine as on the UTC CI runner, with no timezone shifting.
      let year: number, month: number, day: number;
      let hour: number | null = null;
      let minute: number | null = null;

      if (entry.date instanceof Date) {
        // A bare date, already parsed to UTC midnight by js-yaml before it got
        // here — recover the y-m-d it was written with. No time in this form.
        [year, month, day] = entry.date.toISOString().slice(0, 10).split('-').map(Number);
      } else {
        const m = entry.date.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
        if (!m) {
          ctx.addIssue({ code: 'custom', message: `Unrecognised date "${entry.date}"` });
          return z.NEVER;
        }
        year = +m[1];
        month = +m[2];
        day = +m[3];
        if (m[4] !== undefined) {
          hour = +m[4];
          minute = +m[5];
        }
      }

      return {
        ...entry,
        date: new Date(year, month - 1, day, hour ?? 0, minute ?? 0),
        // "18:00", or null when no time was given (so the row shows no "Beginn").
        time:
          hour === null
            ? null
            : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      };
    }),
});

export const collections = { shows };
