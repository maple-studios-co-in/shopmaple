import type { ReactNode } from "react";
import Image from "next/image";
import { Instagram } from "lucide-react";
import { HomeCarousel } from "./home-carousel";

export function InstagramRail({ posts, autoplay = true }: {
  posts: readonly { href: string; src: string; alt?: string }[];
  autoplay?: boolean;
}) {
  return (
    <HomeCarousel label="Instagram posts" autoplay={autoplay} railClassName="home-instagram-posts" className="instagram-motion">
      {posts.map(post => (
        <a key={post.href} href={post.href} target="_blank" rel="noopener noreferrer" aria-label={post.alt ?? "Maple on Instagram"}>
          <Image src={post.src} alt={post.alt ?? "Maple on Instagram"} fill
            sizes="(max-width:479px) 48vw, (max-width:767px) 32vw, (max-width:1023px) 24vw, (max-width:1199px) 19vw, 16vw" />
          <Instagram aria-hidden="true" size={22} />
        </a>
      ))}
    </HomeCarousel>
  );
}

export function MovingCities({ children, autoplay = true }: { children: ReactNode; autoplay?: boolean }) {
  return (
    <HomeCarousel label="Cities served" autoplay={autoplay} railClassName="home-city-viewport" className="city-motion">
      <div className="home-city-track">{children}</div>
    </HomeCarousel>
  );
}
