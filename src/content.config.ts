import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Blog posts. Markdown with colocated images, processed by astro:assets at build
 * time. Schema matches the old site so posts migrate verbatim.
 */
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    draft: z.boolean().default(false),
  }),
});

/**
 * Portfolio projects, one YAML file each.
 */
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.yaml' }),
  schema: z.object({
    name: z.string(),
    language: z.enum(['rust', 'c', 'typescript', 'python', 'java']),
    shortDescription: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    github: z.url(),
    demo: z.url().optional(),
    docs: z.url().optional(),
    crate: z.url().optional(),
    order: z.number(),
  }),
});

/**
 * Photo manifest. Stored as one JSON file but loaded as a collection so
 * individual photos are addressable via getEntry('photos', slug) — which is what
 * lets blog posts reference a photo. See docs/ARCHITECTURE.md §4 and §7.
 *
 * Written by `npm run photos:import`; not hand-edited except for the three
 * optional authored fields (title, caption, tags).
 */
const photos = defineCollection({
  loader: file('src/data/photos.json'),
  schema: z.object({
    /** Slug: <YYYY-MM-DD>-<first 8 of sourceHash>. Also the collection key. */
    id: z.string(),
    /** sha256 of the original bytes (12 hex chars). Import idempotency key. */
    sourceHash: z.string(),

    /** Intrinsic dimensions of the original. */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** Precomputed so layout needs no image loaded and produces no CLS. */
    aspectRatio: z.number().positive(),

    /** Widths actually generated — never upscaled past the original. */
    variants: z.array(z.number().int().positive()),
    formats: z.array(z.enum(['avif', 'webp'])),
    /** ~16px WebP as a base64 data URI. Inlined; costs no extra request. */
    lqip: z.string(),

    // EXIF allowlist. Anything not listed here is dropped at import,
    // including GPS. See docs/ARCHITECTURE.md §5.6.
    takenAt: z.coerce.date().nullable(),
    camera: z.string().nullable(),
    lens: z.string().nullable(),
    focalLength: z.string().nullable(),
    aperture: z.string().nullable(),
    shutter: z.string().nullable(),
    iso: z.number().int().nullable(),

    /**
     * The shoot this photo belongs to — the calendar date of the group's
     * earliest frame, e.g. "2022-10-29". Derived from capture time by
     * `photos:shoots`, assigned once and never recomputed. Names for shoots
     * live in `src/data/shoots.json`, keyed by this value.
     */
    shoot: z.string().nullable().default(null),

    // Authored: written by `photos:describe` or by hand, reviewed in the diff.
    title: z.string().nullable().default(null),
    caption: z.string().nullable().default(null),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog, projects, photos };
