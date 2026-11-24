import { z } from "zod";

/**
 * The media library's upload rules (owner, 23 Nov 2026: "allow only specific banner dimensions which we select ... if
 * anybody tries any other dimension then it will give an alert"). Set under Settings in the admin by a publisher; they
 * take effect at once, outside the draft-and-publish content. The admin checks a picture before sending it and the API
 * checks it again, so the rule holds for every way a picture reaches the library.
 */

/** The largest picture the library decodes (apps/api/src/admin/media.ts), so a larger allowed size could never upload. */
export const maxUploadPixels = 24_000_000;

const MiB = 1024 * 1024;
/**
 * The largest picture file a publisher can allow (owner, 23 Nov 2026: 5 MB). 8 MB is the most the API takes, and each
 * picture must arrive within 15 seconds, so a smaller file also uploads on a slower connection. Films keep their 80 MB.
 */
export const imageFileSizeChoices = [1 * MiB, 2 * MiB, 5 * MiB, 8 * MiB] as const;
export const defaultMaxImageBytes = 5 * MiB;
/** "5 MB": a file size as staff read it (in binary megabytes, as the limits are counted). */
export const describeFileSize = (bytes: number) => {
  const megabytes = bytes / MiB;
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
};

export const allowedImageSizeSchema = z
  .object({
    width: z.number().int().min(1).max(20_000),
    height: z.number().int().min(1).max(20_000),
    /** What the size is for, shown beside it ("Collection banner"); optional. */
    label: z.string().trim().max(60).regex(/^[^\u0000-\u001f\u007f]*$/, "Use letters, numbers and punctuation").default(""),
  })
  .strict()
  .refine(({ width, height }) => width * height <= maxUploadPixels, { message: "Choose a size of up to 24 million pixels" });

export const mediaUploadRulesSchema = z
  .object({
    /** On: an image is taken only when its own size (as uploaded) is one of `sizes`. Off: any size, as before. */
    restrictSizes: z.boolean(),
    sizes: z.array(allowedImageSizeSchema).max(40),
    /** The largest picture file taken, in bytes; rules saved before it existed read as 5 MB. */
    maxImageBytes: z.union([z.literal(imageFileSizeChoices[0]), z.literal(imageFileSizeChoices[1]), z.literal(imageFileSizeChoices[2]), z.literal(imageFileSizeChoices[3])]).default(defaultMaxImageBytes),
  })
  .strict()
  .refine(({ sizes }) => new Set(sizes.map(sizeKey)).size === sizes.length, { message: "Each size can be listed once", path: ["sizes"] })
  .refine(({ restrictSizes, sizes }) => !restrictSizes || sizes.length > 0, { message: "Add at least one size before turning the rule on", path: ["sizes"] });

export type AllowedImageSize = z.infer<typeof allowedImageSizeSchema>;
export type MediaUploadRules = z.infer<typeof mediaUploadRulesSchema>;

/** Until a publisher saves rules, every picture size is taken, as before the setting existed, in files up to 5 MB. */
export const defaultMediaUploadRules: MediaUploadRules = { restrictSizes: false, sizes: [], maxImageBytes: defaultMaxImageBytes };

/** Why a picture file of this many bytes is refused, in the words staff see; "" when it is allowed. */
export function imageFileProblem(rules: MediaUploadRules, bytes: number): string {
  if (bytes <= rules.maxImageBytes) return "";
  const shown = bytes / MiB;
  return `This file is ${shown < 10 ? shown.toFixed(1) : Math.round(shown)} MB. The largest picture file allowed is ${describeFileSize(rules.maxImageBytes)}. A publisher can change it under Settings, Banner sizes.`;
}

/**
 * The banner sizes the storefront's own picture placements ask for (their help texts in the admin), offered on the
 * Settings screen so staff can add them in one click.
 */
export const suggestedBannerSizes: readonly AllowedImageSize[] = [
  { width: 2784, height: 400, label: "Category and collection banner" },
  { width: 1000, height: 1000, label: "Category and collection banner, phones" },
  { width: 1900, height: 350, label: "Campaign banner" },
  { width: 500, height: 500, label: "Campaign banner, phones" },
  { width: 1920, height: 640, label: "Policy and returns page banner" },
];

const sizeKey = ({ width, height }: { width: number; height: number }) => `${width}x${height}`;

/** "2784 × 400". */
export const describeImageSize = ({ width, height }: { width: number; height: number }) => `${width} × ${height}`;

/** Whether a picture of this size may be uploaded under these rules. */
export function imageSizeAllowed(rules: MediaUploadRules, size: { width: number; height: number }): boolean {
  return !rules.restrictSizes || rules.sizes.some((allowed) => allowed.width === size.width && allowed.height === size.height);
}

/** Why a picture of this size is refused, in the words staff see; "" when it is allowed. */
export function imageSizeProblem(rules: MediaUploadRules, size: { width: number; height: number }): string {
  if (imageSizeAllowed(rules, size)) return "";
  const allowed = rules.sizes.map(describeImageSize).join(", ");
  return `This picture is ${describeImageSize(size)} px. Only ${rules.sizes.length === 1 ? "this size" : "these sizes"} can be uploaded: ${allowed} px. A publisher can change the list under Settings, Banner sizes.`;
}
