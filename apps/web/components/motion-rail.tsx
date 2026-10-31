import type { ReactNode } from "react";
import { HomeCarousel } from "./home-carousel";

export function MovingCities({ children, autoplay = true }: { children: ReactNode; autoplay?: boolean }) {
  return (
    <HomeCarousel label="Cities served" autoplay={autoplay} railClassName="home-city-viewport" className="city-motion">
      <div className="home-city-track">{children}</div>
    </HomeCarousel>
  );
}

export { InstagramRail } from "@/components/store/home/instagram-rail";
