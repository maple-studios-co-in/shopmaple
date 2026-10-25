import Image from "next/image";
import { HomeCities } from "@/components/home-sections";
import { CategoryVideo } from "@/components/category-controls";
import { MaplePromises } from "@/components/category-nimbus";
import story from "@/data/landing-story.json";
const section = (key: string) =>
  story.sections.find((item) => item.key === key)!;

export function StoryLanding() {
  const belief = section("media_with_content_be4kK3");
  const film = section("media_with_content_deBkJg");
  const timeline = section("1777584986bee6da6f").custom[0] as Record<
    string,
    string | boolean | number
  >;
  return (
    <div className="home-parity landing-parity landing-story">
      <h1 className="landing-story-title">
        MADE DIFFERENT,
        <br />
        BY DESIGN
      </h1>
      <div className="home-divider home-divider-short" />
      <h2 className="landing-story-tagline">
        Furniture tailored to your narrative.
      </h2>
      <MaplePromises />
      <section className="landing-media-content landing-story-belief">
        <Image
          src={belief.images[0]!}
          alt="Maple furniture craftsmanship"
          width={1200}
          height={1200}
          sizes="(max-width:749px) 100vw, 50vw"
        />
        <div>
          <p className="home-eyebrow">{belief.texts[0]}</p>
          <h2>
            Maple doesn&apos;t believe in loud luxury.
            <br />
            It believes in presence
          </h2>
          <p>{belief.texts[2]}</p>
        </div>
      </section>
      <section className="landing-story-film">
        <CategoryVideo
          desktop={film.videos[0]!}
          label="The Maple workshop"
          autoPlay={false}
        />
        <h2>
          It&apos;s
          <br />
          what
          <br />
          stays
        </h2>
      </section>
      <section className="landing-journey home-container">
        <h2>The Maple Journey</h2>
        <ol>
          {Array.from({ length: 7 }, (_, i) => i + 1).map((i) => (
            <li key={i}>
              <time>{String(timeline[`item_${i}_date`])}</time>
              <div>
                <h3>{String(timeline[`item_${i}_title`])}</h3>
                <p>{String(timeline[`item_${i}_description`])}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="home-divider" />
      <HomeCities />
      <div className="home-divider" />
    </div>
  );
}
