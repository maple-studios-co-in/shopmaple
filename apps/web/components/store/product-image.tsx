"use client";
import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";

/** A product photo, or a labelled placeholder when the image is missing or fails to load (legacy `.product-image-placeholder`). */
type Props = Omit<ImageProps, "src"> & { src?: string | null };
export function ProductImage({ src, alt, onError, ...props }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src)
    return (
      <div
        data-image-placeholder
        className="flex size-full min-h-[76px] flex-col items-center justify-center gap-2.5 bg-[#f3f1eb] p-4 text-center text-[12px] text-[#66645c]"
        role="img"
        aria-label={`${alt || "Product"} — Image unavailable`}
      >
        <ImageOff size={28} aria-hidden="true" />
        <span>Image unavailable</span>
      </div>
    );
  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      onError={(event) => {
        setFailed(src);
        onError?.(event);
      }}
    />
  );
}
