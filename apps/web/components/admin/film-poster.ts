"use client";

/*
 * A film's poster, made from the film itself (owner, 19 Nov 2026: upload a video for a slide and it simply works). The
 * poster shows while the film loads, on slides not in view, and to visitors who ask for reduced motion. It is a frame a
 * little way in, past a fade from black, drawn in the staff member's own browser and uploaded as an ordinary image.
 */

/** Waits for one event of a media element, or fails with `reason` after `ms` or on an error. */
function once(video: HTMLVideoElement, type: "loadeddata" | "seeked", ms: number, reason: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      video.removeEventListener(type, onEvent);
      video.removeEventListener("error", onError);
      if (ok) resolve(); else reject(Error(reason));
    };
    const onEvent = () => done(true), onError = () => done(false);
    const timer = window.setTimeout(() => done(false), ms);
    video.addEventListener(type, onEvent);
    video.addEventListener("error", onError);
  });
}

/** Where the poster frame is taken: a second in, or a quarter of the way through a shorter film. */
export const posterTime = (duration: number) => (Number.isFinite(duration) && duration > 0 ? Math.min(1, duration / 4) : 0);

/**
 * A JPEG of one frame of the film (a local file just chosen, or a library film's preview address), at most 1920 pixels
 * wide, named after the film. Fails (an Error in plain words) when this browser cannot decode the film, so staff can
 * choose a poster themselves.
 */
export async function filmPoster(source: Blob | string, filmName: string, { maxWidth = 1920, timeoutMs = 20_000 } = {}): Promise<File> {
  const reason = "A cover picture could not be made from this film here. Choose a picture for its cover below.";
  // A browser that cannot draw (no 2D canvas) cannot make one: say so at once rather than after loading the film.
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw Error(reason);
  const local = typeof source !== "string";
  const address = local ? URL.createObjectURL(source) : source;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    video.src = address;
    await once(video, "loadeddata", timeoutMs, reason);
    const at = posterTime(video.duration);
    if (at > 0) {
      video.currentTime = at;
      await once(video, "seeked", timeoutMs, reason);
    }
    if (!video.videoWidth || !video.videoHeight) throw Error(reason);
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size === 0) throw Error(reason);
    const base = filmName.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 120) || "Film";
    return new File([blob], `${base} cover.jpg`, { type: "image/jpeg" });
  } finally {
    video.removeAttribute("src");
    video.load();
    if (local) URL.revokeObjectURL(address);
  }
}
