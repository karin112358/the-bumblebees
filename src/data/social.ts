/*
 * The band's public profiles, in one place because they are linked from more
 * than one component (the footer and the booking section).
 *
 * These are plain outbound links everywhere they are used — never embeds,
 * plugins or tracking pixels. Nothing is requested from Meta or Google until a
 * visitor actually clicks, which is what the "Links zu sozialen Netzwerken"
 * section of src/pages/datenschutz.astro states.
 */

/*
 * Lower case, although the profile is often written in capitals: Instagram
 * treats handles case-insensitively, and one spelling in the repo beats two.
 */
export const instagramUrl = 'https://www.instagram.com/bumblebeestheband';

export const youtubeUrl = 'https://www.youtube.com/@bumblebeestheband';

/* Same handle on both platforms, so it is worth having as its own label. */
export const handle = '@bumblebeestheband';
