import { z } from "zod";

/** A film uploaded to the media library (owner, 12 Nov 2026): `/media/uploads/<sha256>.mp4` or `.webm`, as the library names it. */
export const contentFilmSchema = z.string().max(100).regex(/^\/media\/uploads\/[a-f0-9]{64}\.(?:mp4|webm)$/, "Choose a film from the media library");

/**
 * The places a film can be chosen for, beside the hero slides (which carry their own): the homepage testimonial, played
 * with its poster, and the Nimbus and Terra pages' collection films. Each is separate from the template artwork.
 */
export const templateFilmKeys = ["home-testimonial", "nimbus-hero", "terra-hero"] as const;
export type TemplateFilmKey = (typeof templateFilmKeys)[number];
const templateFilmSchema = z.object({
  key: z.enum(templateFilmKeys),
  src: contentFilmSchema,
  /**
   * An optional phone cut (owner, 12 Nov 2026), for example a 9:16 version of a square film: screens up to 749px wide
   * play it in place of `src`. Without one, every screen plays `src`.
   */
  mobileSrc: contentFilmSchema.optional(),
  /** The running time the library read from the file, shown beside a collection film's link ("00:25"). */
  durationMs: z.number().int().min(1).max(24 * 60 * 60 * 1000).optional(),
}).strict();
export const templateFilmsSchema = z.array(templateFilmSchema).max(templateFilmKeys.length)
  .refine(items => new Set(items.map(item => item.key)).size === items.length, "Choose one film for each place");
export type TemplateFilm = z.infer<typeof templateFilmSchema>;
export type TemplateFilms = z.infer<typeof templateFilmsSchema>;
