"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import { shopFile } from "@/lib/format";

export function HomeNimbus() {
  const [open, setOpen] = useState(false);
  return (
    <section className="home-nimbus-wrap" aria-label="The Nimbus Collection">
      <div className={`home-nimbus ${open ? "is-open" : ""}`}>
        <picture className="home-nimbus-media">
          <source
            media="(max-width: 767px)"
            srcSet={shopFile("Chairs_300_x_600_px.webp?width=900")}
          />
          <img
            src={shopFile("Chairs_9.svg")}
            alt="The Nimbus Collection — cloud-like upholstered furniture"
            loading="lazy"
          />
        </picture>
        <button
          className="home-nimbus-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="nimbus-details"
          aria-label={
            open
              ? "Close Nimbus collection details"
              : "Explore the Nimbus Collection"
          }
        >
          {open ? <ChevronDown /> : <ChevronUp />}
        </button>
        <div className="home-nimbus-content" id="nimbus-details">
          <h2>The Nimbus Collection</h2>
          <p>Comfort Shaped Like Clouds</p>
          <div className="home-nimbus-icons">
            {[
              "Cloud Like Comfort",
              "Soft Silhouettes",
              "Airy Luxury",
              "Modern Spaces",
            ].map((label, i) => (
              <div key={label}>
                <Image
                  src={shopFile(`Maple_Banner_${13 + i}.svg`)}
                  alt=""
                  width={75}
                  height={75}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <Link
            className="button"
            href="https://shop.maplefurnishers.com/pages/nimbus-collection"
            onFocus={() => setOpen(true)}
          >
            Shop Now
          </Link>
        </div>
      </div>
    </section>
  );
}
