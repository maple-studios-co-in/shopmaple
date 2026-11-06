import { reviewPhotoLimit, reviewSubmissionSchema, type ReviewSubmission } from "@shopmaple/contracts/reviews";

export const maxPhotoBytes = 10 * 1024 * 1024;
const photoTypes = ["image/jpeg", "image/png"];

/** The frame's limits on the photos a customer picks ("Up to 5 photos · JPG or PNG · 10 MB each"), each said in words. */
export function acceptPhotos(current: File[], picked: File[]): { photos: File[]; problem: string } {
  const photos = [...current];
  let problem = "";
  for (const file of picked) {
    if (!photoTypes.includes(file.type)) problem = `${file.name} is not a JPG or PNG.`;
    else if (file.size > maxPhotoBytes) problem = `${file.name} is larger than 10 MB.`;
    else if (photos.length >= reviewPhotoLimit) problem = `You can add up to ${reviewPhotoLimit} photos.`;
    else photos.push(file);
  }
  return { photos, problem };
}

// The request travels through the site's proxy, which holds 10 MB: five photos of this size, in base64, and the words.
const photoBudgetBytes = 1_400_000;
const attempts = [[2000, 0.82], [1600, 0.78], [1280, 0.72], [1024, 0.66]] as const;

/**
 * A chosen photo made small in the browser and returned as base64, so a phone's 8 MB picture does not have to travel. The
 * server still checks and re-makes what arrives. A transparent PNG gets a white ground, as JPEG has no transparency.
 */
export async function encodePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    for (const [side, quality] of attempts) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) break;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= photoBudgetBytes) return await asBase64(blob);
    }
  } finally { bitmap.close(); }
  throw new Error("Photo could not be made small enough");
}

function asBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Photo could not be read"));
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.readAsDataURL(blob);
  });
}

export function reviewFailureMessage(status: number) {
  if (status === 429) return "Too many reviews from this connection. Please try again later.";
  if (status === 400) return "Your review could not be sent. Please check your details and try again.";
  if (status === 413) return "Your photos are too large to send together. Please remove one and try again.";
  return "Your review could not be sent just now. Please try again in a moment.";
}

/** One key per form: a retry after a lost reply cannot make a second review, while an edited review is a new one. */
export function createReviewSender(transport: typeof fetch = fetch) {
  let previous = "";
  let key = "";
  return async (input: ReviewSubmission): Promise<void> => {
    const body = JSON.stringify(reviewSubmissionSchema.parse(input));
    if (body !== previous) {
      key = crypto.randomUUID();
      previous = body;
    }
    let response: Response;
    try {
      response = await transport("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body,
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new Error("We could not confirm your review was sent. Please try again.");
    }
    if (!response.ok) throw new Error(reviewFailureMessage(response.status));
  };
}
