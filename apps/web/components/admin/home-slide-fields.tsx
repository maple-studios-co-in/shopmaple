"use client";
import { useRef } from "react";
import { Plus, X } from "lucide-react";
import type { HomeDetails } from "@shopmaple/contracts";
import { Notice } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { ActionButton, EditableList, FieldGrid, Hint, SelectField, Subsection, textField, textFields } from "./kit";
import { MediaPicker } from "./media-picker";

type HeroSlide = NonNullable<HomeDetails["hero"]["slides"]>[number];
type NimbusSlide = NonNullable<HomeDetails["nimbus"]["slides"]>[number];
type Media = { session?: StaffSession; onExpired?: () => void };

/** Rows keep a stable identity while their text is edited, so a row keeps its place and focus. */
let nextRow = 0;
const rowId = () => `slide-${++nextRow}`;
type Row<T> = { id: string; slide: T };
function rows<T>(slides: readonly T[], known: string[]): Row<T>[] {
  return slides.map((slide, i) => ({ id: (known[i] ??= rowId()), slide }));
}

/** A film from the media library, as a video slide's `src` is. */
const isFilm = (src: string) => /^\/media\/uploads\/[a-f0-9]{64}\.(?:mp4|webm)$/.test(src);

/** An object without the properties whose text is empty (an optional address that was cleared). */
function withoutEmpty<T extends object>(value: T, keys: (keyof T)[]): T {
  const next = { ...value };
  for (const key of keys) if (next[key] === "" || next[key] === undefined) delete next[key];
  return next;
}

/** The hero tile's slider: add, order and edit slides. With none, the hero shows four default stills. */
export function HeroSlidesFields({ hero, onChange, session, onExpired }: { hero: HomeDetails["hero"]; onChange: (hero: HomeDetails["hero"]) => void } & Media) {
  const slides = hero.slides;
  const known = useRef<string[]>([]).current;
  const set = (next: HeroSlide[]) => {
    const { slides: _removed, ...rest } = hero;
    onChange(next.length ? { ...rest, slides: next } : rest);
  };
  const blank = (): HeroSlide => ({ kind: "image", src: "", alt: "", headline: "", intro: "" });
  const picker = (label: string, slot: "src" | "poster" | "film", slide: HeroSlide, edit: (slide: HeroSlide) => void) => session && onExpired && (
    <div data-slide-picker={slot}>
      <MediaPicker label={label} value={(slot === "poster" ? slide.poster : slide.src) ?? ""} session={session} onExpired={onExpired} accept={slot === "film" ? "video" : "image"}
        onChange={url => edit(withoutEmpty({ ...slide, [slot === "poster" ? "poster" : "src"]: url }, ["poster"]))} />
    </div>
  );
  /**
   * Changing a slide's kind keeps its pictures where they still fit: an image slide's picture becomes the video's poster
   * and back. A film is never an image slide's picture, nor a picture a video's film.
   */
  const rekind = (slide: HeroSlide, kind: HeroSlide["kind"]): HeroSlide => {
    if (kind === slide.kind) return slide;
    const film = isFilm(slide.src);
    return kind === "video"
      ? withoutEmpty({ ...slide, kind, src: film ? slide.src : "", poster: slide.poster || (film ? "" : slide.src) }, ["poster"])
      : withoutEmpty({ ...slide, kind, src: !film && slide.src ? slide.src : slide.poster ?? "", poster: "" }, ["poster"]);
  };
  return <Subsection title="Hero slides"
    description="Slides of the large hero tile, with a dot for each. With none, the hero shows four stills: the Workshop video poster and the three Nimbus slideshow rooms (your uploads, else photos of Keeri products). A video slide plays a film from the media library on its own, muted, over its poster; visitors who ask for reduced motion see the poster.">
    {!slides ? <div>
      <ActionButton icon={Plus} onClick={() => set([blank()])}>Add hero slide</ActionButton>
      <p className="mt-2 max-w-[68ch] text-xs text-muted-foreground">Your slides replace the default stills.</p>
    </div> : <>
      <Notice tone="info">For a video slide, upload the film (MP4 or WebM, up to 80 MB, exported for the web) in the media library and choose it with its poster picture below.</Notice>
      <EditableList name="Hero slide" items={rows(slides, known)} identity={row => row.id} min={1} max={6} create={() => ({ id: rowId(), slide: blank() })}
        onChange={next => { known.splice(0, known.length, ...next.map(row => row.id)); set(next.map(row => row.slide)); }}
        render={({ slide, id }, index, edit) => {
          const name = `Hero slide ${index + 1}`, change = (next: HeroSlide) => edit({ id, slide: next });
          const video = slide.kind === "video";
          return <>
            <FieldGrid>
              <SelectField label={`${name} kind`} value={slide.kind} onChange={event => change(rekind(slide, event.currentTarget.value as HeroSlide["kind"]))}>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </SelectField>
              {!video && textField(`${name} media address`, slide.src, 1000, src => change({ ...slide, src }))}
              {textFields(slide, [[ "alt", `${name} image description`, 200], ["headline", `${name} headline`, 120], ["intro", `${name} intro`, 300, true]], change)}
              <Hint>{video ? "Choose the film and its poster below. The poster shows while the film loads and for visitors who ask for reduced motion." : "Paste an approved address, or choose from the media library below."}</Hint>
            </FieldGrid>
            {video && picker(`${name} film`, "film", slide, change)}
            {picker(video ? `${name} poster` : `${name} picture`, video ? "poster" : "src", slide, change)}
          </>;
        }} />
      <div><ActionButton icon={X} onClick={() => set([])}>Use the default stills</ActionButton></div>
    </>}
  </Subsection>;
}

/** The Nimbus slider's extra collections after the base card. */
export function NimbusSlidesFields({ nimbus, onChange, session, onExpired }: { nimbus: HomeDetails["nimbus"]; onChange: (nimbus: HomeDetails["nimbus"]) => void } & Media) {
  const known = useRef<string[]>([]).current;
  const slides = nimbus.slides ?? [];
  const set = (next: NimbusSlide[]) => {
    const { slides: _removed, ...rest } = nimbus;
    onChange(next.length ? { ...rest, slides: next } : rest);
  };
  const blank = (): NimbusSlide => ({ heading: "", tagline: "", features: ["", "", "", ""], cta: "", href: "", image: "", alt: "" });
  return <Subsection title="More collections"
    description="Collections that follow the Nimbus card in the slider, each with its own picture, words and link, for example Terra or another theme. The Nimbus card itself is edited above.">
    <EditableList name="Nimbus collection" items={rows(slides, known)} identity={row => row.id} max={5} create={() => ({ id: rowId(), slide: blank() })}
      onChange={next => { known.splice(0, known.length, ...next.map(row => row.id)); set(next.map(row => row.slide)); }}
      render={({ slide, id }, index, edit) => {
        const name = `Nimbus collection ${index + 1}`, change = (next: NimbusSlide) => edit({ id, slide: next });
        return <>
          <FieldGrid>
            {textFields(slide, [["heading", `${name} heading`, 160], ["cta", `${name} button`, 80], ["tagline", `${name} tagline`, 300, true]], change)}
            {textField(`${name} link`, slide.href, 500, href => change({ ...slide, href }))}
            {slide.features.map((feature, n) => textField(`${name} feature ${n + 1}`, feature, 160, value => change({ ...slide, features: slide.features.map((item, i) => i === n ? value : item) })))}
            {textField(`${name} image`, slide.image, 1000, image => change({ ...slide, image }))}
            {textField(`${name} mobile image`, slide.mobileImage ?? "", 1000, mobileImage => change(withoutEmpty({ ...slide, mobileImage }, ["mobileImage"])))}
            {textFields(slide, [["alt", `${name} image description`, 200]], change)}
            <Hint>The link is a store page such as /collections/terra. The mobile image is optional and shows on phones.</Hint>
          </FieldGrid>
          {session && onExpired && <>
            <MediaPicker label={`${name} picture`} value={slide.image} session={session} onExpired={onExpired} onChange={image => change({ ...slide, image })} />
            <MediaPicker label={`${name} phone picture`} value={slide.mobileImage ?? ""} session={session} onExpired={onExpired}
              onChange={mobileImage => change(withoutEmpty({ ...slide, mobileImage }, ["mobileImage"]))} />
          </>}
        </>;
      }} />
  </Subsection>;
}
