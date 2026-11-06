"use client";
import { useState } from "react";
import { Camera } from "lucide-react";
import type { RealPhotoGroup } from "@/lib/product-page-data";
import { cx } from "@/lib/cx";
import { Modal } from "./modal";
import { ProductImage } from "./product-image";

/**
 * "View real images" under the gallery: unedited photographs of the actual piece that staff marked in Keeri, by finish.
 * It opens on the finish being viewed when that finish has some, and is not shown at all when nothing is marked.
 */
export function ProductRealImages({ groups, variantId, title }: { groups: RealPhotoGroup[]; variantId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!groups.length) return null;
  const count = groups.reduce((n, group) => n + group.photos.length, 0);
  const shown = groups.find((group) => group.variantId === chosen) ?? groups[0]!;
  function show() {
    setChosen(groups.some((group) => group.variantId === variantId) ? variantId : groups[0]!.variantId);
    setOpen(true);
  }
  return (
    <>
      <button type="button" data-real-images onClick={show}
        className="inline-flex h-10 cursor-pointer items-center gap-2 self-start rounded-[30px] border border-solid border-maple/20 bg-white px-4 text-[14px] leading-[1.35] font-medium text-maple hover:bg-maple/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
        <Camera aria-hidden="true" className="size-4" />
        View real images <span className="text-[#756d68]">({count})</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Real photos of the ${title}`}>
        <div data-real-gallery className="flex flex-col gap-4 font-text">
          <p className="m-0 pr-10 text-[14px] leading-[1.5] text-[#756d68]">Unedited photographs of the actual piece.</p>
          {groups.length > 1 && (
            <div role="group" aria-label="Finish" className="flex flex-wrap gap-2">
              {groups.map((group) => (
                <button key={group.variantId ?? "piece"} type="button" data-real-finish aria-pressed={group === shown} onClick={() => setChosen(group.variantId)}
                  className={cx("cursor-pointer rounded-[30px] border border-solid px-3 py-1.5 text-[13px] leading-[1.35] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple",
                    group === shown ? "border-maple bg-maple text-white" : "border-maple/20 bg-white text-maple hover:bg-maple/6")}>
                  {group.label}
                </button>
              ))}
            </div>
          )}
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {shown.photos.map((photo) => (
              <li key={photo.url} data-real-photo className="relative aspect-square overflow-hidden rounded-[12px] bg-cream">
                <ProductImage src={photo.url} alt={photo.alt} fill sizes="(max-width:639px) 90vw, 280px" className="object-cover" />
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
