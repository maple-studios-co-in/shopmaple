"use client";
import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";

type Props = Omit<ImageProps, "src"> & { src?: string | null };
export function ProductImage({ src, alt, onError, ...props }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src)
    return (
      <div
        className="product-image-placeholder"
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
