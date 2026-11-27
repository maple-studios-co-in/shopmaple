"use client";
import { useId, type ReactNode } from "react";
import {
  bannerFontNames, bannerFonts, type BannerFont, type BannerLook, type CollectionBannerLook,
} from "@shopmaple/contracts";
import { cn } from "@/lib/utils";
import { CheckField, Hint, focusRing } from "./kit";

/** One choice among a few, as a row of pills: the words' look on every banner and hero slide. */
export function Choice<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div role="group" aria-labelledby={id} className={cn("grid min-w-0 gap-1.5", disabled && "opacity-50")}>
    <span id={id} className="text-xs font-medium text-foreground">{label}</span>
    <div className="inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-full bg-black/[0.06] p-[3px]">
      {options.map(([option, text]) => (
        <button key={option} type="button" aria-pressed={value === option} disabled={disabled} onClick={() => onChange(option)}
          className={cn("h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors duration-150 ease-admin hover:text-foreground disabled:pointer-events-none",
            focusRing, "aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs")}>{text}</button>
      ))}
    </div>
  </div>;
}

/**
 * The type styles (owner, 25 Nov 2026: "add an option to change the font style of the text"), each named in its own style
 * so staff see what they choose (styles/banner-look.css). The store's own typefaces and a classic serif: no font to load.
 */
export function FontChoice({ label = "Type style", value, onChange, disabled = false }: {
  label?: string; value: BannerFont; onChange: (font: BannerFont) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div role="group" aria-labelledby={id} className={cn("grid min-w-0 gap-1.5", disabled && "opacity-50")} data-font-choice={value}>
    <span id={id} className="text-xs font-medium text-foreground">{label}</span>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2">
      {bannerFonts.map(font => (
        <button key={font} type="button" aria-pressed={value === font} disabled={disabled} onClick={() => onChange(font)} data-banner-font={font}
          className={cn("min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-[15px] leading-tight text-foreground",
            "transition-[border-color,box-shadow] duration-150 ease-admin hover:border-foreground/30 disabled:pointer-events-none",
            focusRing, "aria-pressed:border-primary aria-pressed:shadow-[0_0_0_1px_var(--primary)]")}>
          <span className="banner-font-sample block truncate">{bannerFontNames[font]}</span>
        </button>
      ))}
    </div>
  </div>;
}

const shades = [["none", "None"], ["soft", "Soft"], ["strong", "Strong"]] as const;
const tones = [["light", "Light"], ["dark", "Dark"]] as const;
const sizes = [["small", "Small"], ["medium", "Medium"], ["large", "Large"]] as const;

/**
 * A campaign banner's look (owner, 25 Nov 2026: "gradient, texts, cta all should be completely editable if the person
 * wants can keep it else remove it"): its words and its button on or off, the shade behind the words, light or dark words,
 * the headline's size and the type style. `strip`: the homepage announcement, which has its own light ground and no shade.
 */
export function BannerLookFields({ value, onChange, strip = false, note }: {
  value: BannerLook; onChange: (look: BannerLook) => void; strip?: boolean; note?: ReactNode;
}) {
  const set = <K extends keyof BannerLook>(key: K, next: BannerLook[K]) => onChange({ ...value, [key]: next });
  return <fieldset className="m-0 grid min-w-0 gap-5 border-0 p-0" data-banner-look>
    <legend className="sr-only">How the banner looks</legend>
    <div className="grid gap-4 @md:grid-cols-2">
      <CheckField label="Show the words" checked={value.words} onChange={event => set("words", event.currentTarget.checked)}
        description="Turn off for a picture that already has its own words." />
      <CheckField label="Show the button" checked={value.button} onChange={event => set("button", event.currentTarget.checked)}
        description="Turn off for a picture with its own button: the whole banner then opens the destination." />
    </div>
    <div className="flex flex-wrap gap-x-6 gap-y-4">
      {!strip && <Choice label="Shade behind the words" value={value.shade} options={shades} onChange={shade => set("shade", shade)} disabled={!value.words} />}
      {!strip && <Choice label="Words" value={value.tone} options={tones} onChange={tone => set("tone", tone)} disabled={!value.words && !value.button} />}
      <Choice label="Headline size" value={value.size} options={sizes} onChange={size => set("size", size)} disabled={!value.words} />
    </div>
    <FontChoice value={value.font} onChange={font => set("font", font)} disabled={!value.words} />
    <Hint>{note ?? (strip
      ? "The announcement keeps its own light ground and dark words. The live preview shows your choices as you make them."
      : "Light words read best on a darker picture, dark words on a lighter one. With no shade the picture shows in full. The live preview shows your choices as you make them.")}</Hint>
  </fieldset>;
}

/** How a collection page's name and line read over a photo staff chose for its banner (the Artwork screen). */
export function WordsLookFields({ value, onChange }: { value: CollectionBannerLook; onChange: (look: CollectionBannerLook) => void }) {
  const set = <K extends keyof CollectionBannerLook>(key: K, next: CollectionBannerLook[K]) => onChange({ ...value, [key]: next });
  return <fieldset className="m-0 grid min-w-0 gap-5 border-0 p-0" data-banner-look>
    <legend className="mb-1 text-sm font-semibold text-foreground">How the words look</legend>
    <div className="flex flex-wrap gap-x-6 gap-y-4">
      <Choice label="Shade behind the words" value={value.shade} options={shades} onChange={shade => set("shade", shade)} />
      <Choice label="Words" value={value.tone} options={tones} onChange={tone => set("tone", tone)} />
      <Choice label="Headline size" value={value.size} options={sizes} onChange={size => set("size", size)} />
    </div>
    <FontChoice value={value.font} onChange={font => set("font", font)} />
  </fieldset>;
}
