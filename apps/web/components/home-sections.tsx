import { MovingCities } from "@/components/motion-rail";
import { ContentImage as Image, getContentImageProps as getImageProps } from "@/components/content-image";
import Link from "next/link";
import { shopFile } from "@/lib/format";
import type { HomeDetails, HomeCitiesLayout, TemplateMedia } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { defaultHomeDetails } from "@/lib/home-details-defaults";
import { defaultHomeCitiesLayout } from "@/lib/home-cities-defaults";

export function HomeBanner({
  desktop,
  mobile,
  alt,
  href,
  flush = false,
}: {
  desktop: string;
  mobile: string;
  alt: string;
  href: string;
  flush?: boolean;
}) {
  const desktopProps = getImageProps({
    src: shopFile(desktop),
    alt,
    width: 2784,
    height: 700,
    sizes: "100vw",
  }).props;
  const mobileProps = getImageProps({
    src: shopFile(mobile),
    alt,
    width: 4796,
    height: 4796,
    sizes: "100vw",
  }).props;
  return (
    <div className={`home-promo ${flush ? "home-promo-flush" : ""}`}>
      <Link href={href}>
        <picture>
          <source
            media="(max-width: 749px)"
            srcSet={mobileProps.srcSet}
            sizes={mobileProps.sizes}
            width={4796}
            height={4796}
          />
          <img {...desktopProps} />
        </picture>
      </Link>
    </div>
  );
}

export function HomeCities({
  content = defaultHomeDetails.cities,
  autoplay = true,
  media,
  layout = defaultHomeCitiesLayout,
}: {
  content?: HomeDetails["cities"];
  autoplay?: boolean;
  media?: TemplateMedia;
  layout?: HomeCitiesLayout;
} = {}) {
  const cities = layout.filter(city => city.enabled);
  if (!cities.length) return null;
  return (
    <section className="home-cities home-container">
      <header>
        <p className="home-eyebrow">{content.eyebrow}</p>
        <h2>{content.heading}</h2>
        <a className="city-photo-credits" href="/media/cities/credits.html">Image credits</a>
      </header>
      <MovingCities autoplay={autoplay}>
        {cities.map(({ key }) => {
          const artwork = resolveTemplateMedia(`home-city-${key}`, media);
          return (
            <figure key={key} className="home-city-card">
              <div className="home-city-artwork">
                <Image
                  src={artwork.image}
                  alt={artwork.alt}
                  width={400}
                  height={600}
                />
              </div>
              {artwork.alt && <figcaption>{artwork.alt}</figcaption>}
            </figure>
          );
        })}
      </MovingCities>
    </section>
  );
}


export { HomeDifference, HomeSocial, HomeTestimonial, HomeNewsletter, HomeValues, HomeProject } from "@/components/store/home/sections";
