"use client";

import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import { shopFile } from "@/lib/format";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

export function HomeNimbus({
  content = defaultHomeDetails.nimbus,
  media,
}: { content?: HomeDetails["nimbus"]; media?: TemplateMedia } = {}) {
  const artwork = resolveHomeTemplateMedia("home-nimbus", media);
  const [open, setOpen] = useState(false);
  return (
    <section className="home-nimbus-wrap" aria-label="The Nimbus Collection">
      <div className={`home-nimbus ${open ? "is-open" : ""}`}>
        <picture className="home-nimbus-media">
          <source
            media="(max-width: 767px)"
            srcSet={artwork.mobileImage}
          />
          <img
            src={artwork.image}
            alt={artwork.alt}
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
        <p className="home-nimbus-lead" data-nimbus-lead>{content.tagline}</p>
        <Link className="home-nimbus-explore" href="/pages/nimbus-collection" data-nimbus-explore>{content.cta}</Link>
        <div className="home-nimbus-content" id="nimbus-details">
          <h2>{content.heading}</h2>
          <p>{content.tagline}</p>
          <div className="home-nimbus-icons">
            {content.features.map((label, i) => (
              <div key={i}>
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
            href="/pages/nimbus-collection"
            onFocus={() => setOpen(true)}
          >
            {content.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
