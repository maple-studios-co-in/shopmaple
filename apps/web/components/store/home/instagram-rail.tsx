import { ContentImage as Image } from "@/components/content-image";
import { Instagram } from "lucide-react";
import { HomeCarousel } from "@/components/store/carousel";

export function InstagramRail({ posts, autoplay = true }: {
  posts: readonly { href: string; src: string; alt?: string }[];
  autoplay?: boolean;
}) {
  return (
    <HomeCarousel label="Instagram posts" autoplay={autoplay} controlsClassName="mt-3"
      railClassName="mt-6 flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-3 [scrollbar-width:none] md:gap-4">
      {posts.map(post => (
        <a key={post.href} href={post.href} target="_blank" rel="noopener noreferrer" aria-label={post.alt ?? "Maple on Instagram"}
          className="group/post relative block aspect-[4/5] w-[75%] shrink-0 snap-start overflow-hidden rounded-[4px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand md:w-[calc((100%-80px)/6)]">
          <Image src={post.src} alt={post.alt ?? "Maple on Instagram"} fill
            sizes="(max-width:767px) 75vw, calc((100vw - 208px) / 6)"
            className="object-cover transition-transform duration-300 group-hover/post:scale-[1.025] motion-reduce:transition-none" />
          <Instagram aria-hidden="true" size={22} className="absolute right-3.5 bottom-3.5 text-white drop-shadow-[0_1px_3px_#222]" />
        </a>
      ))}
    </HomeCarousel>
  );
}
