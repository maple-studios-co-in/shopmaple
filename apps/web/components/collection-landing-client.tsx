"use client";
import { useRef } from "react";
import { X } from "lucide-react";
import type { CollectionFilm as Film } from "@/lib/collection-landing";

/**
 * "Watch collection film / 00:25": opens the collection's film over the page in a native modal dialog, with the
 * browser's own controls. It loads only when asked for, starts at once unless the visitor prefers less motion, and gives
 * focus back to the link when it closes (Escape, the close button or a click outside the film).
 */
export function CollectionFilm({ film }: { film: Film }) {
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  function open() {
    const player = video.current;
    const frame = dialog.current;
    if (!player || !frame) return;
    const phone = film.mobileSrc && window.matchMedia?.("(max-width: 749px)").matches;
    const source = phone ? film.mobileSrc! : film.src;
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
        <span>{film.label}</span> <span className="collection-film-slash" aria-hidden="true">/</span> <span>{film.duration}</span>
      </button>
      <dialog ref={dialog} className="collection-film" aria-label={film.title} onClose={closed}
        onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
        <div className="collection-film-frame">
          <video ref={video} controls playsInline preload="none" poster={film.poster} />
          <button type="button" className="collection-film-close" aria-label="Close the film" onClick={() => dialog.current?.close()}>
            <X size={22} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </dialog>
    </>
  );
}
