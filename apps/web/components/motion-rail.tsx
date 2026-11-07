import type { ReactNode } from "react";
import { ContentImage as Image } from "@/components/content-image";
import { Instagram } from "lucide-react";
import { HomeMarquee } from "./home-marquee";

export function InstagramRail({ posts, autoplay = true }: {
  posts: readonly { href: string; src: string; alt?: string }[];
  autoplay?: boolean;
}) {
  return (
    <HomeMarquee label="Instagram posts" autoplay={autoplay} className="instagram-motion" seconds={Math.max(24, posts.length * 6)}
      items={(copy) => (
        <div className="home-instagram-posts">
          {posts.map(post => (
            <a key={post.href} href={post.href} target="_blank" rel="noopener noreferrer" aria-label={post.alt ?? "Maple on Instagram"}
              tabIndex={copy ? -1 : undefined}>
              <Image src={post.src} alt={copy ? "" : post.alt ?? "Maple on Instagram"} fill
                sizes="(max-width:479px) 62vw, (max-width:767px) 42vw, (max-width:1023px) 30vw, 22vw" />
              <Instagram aria-hidden="true" size={22} />
            </a>
          ))}
        </div>
      )} />
  );
}

/** The cities served, drifting by without end; `children` draws the row (twice: the second pass is decoration). */
export function MovingCities({ children, autoplay = true, count }: {
  children: (copy: boolean) => ReactNode;
  autoplay?: boolean;
  count: number;
}) {
  return (
    <HomeMarquee label="Cities served" autoplay={autoplay} toggle={false} className="city-motion" seconds={Math.max(20, count * 4)}
      items={(copy) => <div className="home-city-track">{children(copy)}</div>} />
  );
}
