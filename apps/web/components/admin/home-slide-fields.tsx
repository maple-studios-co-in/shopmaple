"use client";
import { useRef } from "react";
import type { HomeDetails } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { EditableList, FieldGrid, Hint, Subsection, textField, textFields } from "./kit";
import { MediaPicker } from "./media-picker";

type NimbusSlide = NonNullable<HomeDetails["nimbus"]["slides"]>[number];
type Media = { session?: StaffSession; onExpired?: () => void };

/** Rows keep a stable identity while their text is edited, so a row keeps its place and focus. */
let nextRow = 0;
const rowId = () => `slide-${++nextRow}`;
type Row<T> = { id: string; slide: T };
function rows<T>(slides: readonly T[], known: string[]): Row<T>[] {
  return slides.map((slide, i) => ({ id: (known[i] ??= rowId()), slide }));
}

/** An object without the properties whose text is empty (an optional address that was cleared). */
function withoutEmpty<T extends object>(value: T, keys: (keyof T)[]): T {
  const next = { ...value };
  for (const key of keys) if (next[key] === "" || next[key] === undefined) delete next[key];
  return next;
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
            <MediaPicker label={`${name} picture`} value={slide.image} session={session} onExpired={onExpired} onChange={image => change({ ...slide, image })} target={`nimbus-slide:${index}`} />
            <MediaPicker label={`${name} phone picture`} value={slide.mobileImage ?? ""} session={session} onExpired={onExpired}
              onChange={mobileImage => change(withoutEmpty({ ...slide, mobileImage }, ["mobileImage"]))} />
          </>}
        </>;
      }} />
  </Subsection>;
}
