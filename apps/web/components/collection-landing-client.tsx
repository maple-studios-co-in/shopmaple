"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { mountAmbientFilm } from "@/lib/ambient-film";
import { phoneFilmQuery as phoneQuery } from "@/lib/film-source";
import type { CollectionClip, CollectionFilm as Film } from "@/lib/collection-landing";

/**
 * The opening's clip (owner, 12 Nov 2026), muted and looping over the opening photo, which stays beneath it as the
 * still. Script chooses the cut (portrait on a phone), and the clip fades in only once it plays: while the opening is on
 * screen (mountAmbientFilm), never for visitors who ask for reduced motion, and never without script, so those visitors
 * keep the photo. Paused off screen, it keeps its frame. Decorative: the photo's description says what it shows.
 */
export function CollectionOpeningClip({ clip }: { clip: CollectionClip }) {
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = player.current;
    if (!video) return;
    const phone = Boolean(clip.mobileSrc) && window.matchMedia?.(phoneQuery).matches === true;
    video.src = phone ? clip.mobileSrc! : clip.src;
    const playing = () => video.setAttribute("data-playing", "");
    const emptied = () => video.removeAttribute("data-playing");
    video.addEventListener("playing", playing);
    video.addEventListener("emptied", emptied);
    const stop = mountAmbientFilm(video);
    return () => {
      stop();
      video.removeEventListener("playing", playing);
      video.removeEventListener("emptied", emptied);
    };
  }, [clip.src, clip.mobileSrc]);
  return <video ref={player} className="collection-hero-clip" muted loop playsInline preload="metadata" disablePictureInPicture
    aria-hidden="true" tabIndex={-1} data-collection-clip="" />;
}

/**
 * "Watch collection film / 00:25": opens the collection's film over the page in a native modal dialog, with the
 * browser's own controls. The film and its poster load only when asked for; it starts at once unless the visitor prefers
 * less motion, and gives focus back to the link when it closes (Escape, the close button or a click outside the film).
 * Without a known running time the link shows its words alone.
 */
export function CollectionFilm({ film }: { film: Film }) {
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  function open() {
    const player = video.current;
    const frame = dialog.current;
    if (!player || !frame) return;
    const phone = film.mobileSrc && window.matchMedia?.(phoneQuery).matches;
    const source = phone ? film.mobileSrc! : film.src;
    if (!player.getAttribute("poster")) player.setAttribute("poster", film.poster);
    if (player.getAttribute("src") !== source) player.setAttribute("src", source);
    if (!frame.open) frame.showModal();
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) void player.play()?.catch(() => {});
  }
  function closed() {
    video.current?.pause();
    opener.current?.focus();
  }
  return (
    <>
      <button ref={opener} type="button" className="collection-film-link" data-collection-film="" aria-haspopup="dialog" onClick={open}>
        <span className="collection-film-play" aria-hidden="true">
          <svg viewBox="0 0 10 12" fill="currentColor" focusable="false"><path d="M0 0v12l10-6z" /></svg>
        </span>
        <span>{film.label}</span>
        {film.duration && <> <span className="collection-film-slash" aria-hidden="true">/</span> <span>{film.duration}</span></>}
      </button>
      <dialog ref={dialog} className="collection-film" aria-label={film.title} onClose={closed}
        onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
        <div className="collection-film-frame">
          <video ref={video} controls playsInline preload="none" />
          <button type="button" className="collection-film-close" aria-label="Close the film" onClick={() => dialog.current?.close()}>
            <X size={22} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </dialog>
    </>
  );
}
