"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { StorefrontContent, TemplateMediaKey } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { templateMediaSlots } from "@/lib/template-media-defaults";
import { sectionName, type HomeSectionKey } from "@/lib/section-thumbnails";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { CampaignFields, InstagramFields } from "./forms";
import { HomeCitiesLayoutFields } from "./home-cities-layout-fields";
import { HomeDetailFields, type HomeDetailSection } from "./home-details-fields";
import { HomeMerchandisingFields, type MerchandisingPart } from "./home-merchandising-fields";
import { CheckField, FieldGrid, PanelHeader } from "./kit";
import { ArtworkSlots } from "./template-artwork-fields";

type Copy = StorefrontContent["homeCopy"];
type Motion = StorefrontContent["motion"];
/** The homepage copy each section shows, with the labels and limits the Homepage screen uses. */
const copyFields: Partial<Record<HomeSectionKey, [keyof Copy, string, number][]>> = {
  categories: [["categoryHeading", "Category heading", 160]],
  bestsellers: [["bestsellersHeading", "Bestsellers heading", 160]],
  chairs: [["chairsHeading", "Chairs heading", 160]],
  instagram: [["socialHeading", "Social heading", 160]],
  ticker: [["ticker", "Brand ticker", 600]],
  testimonial: [["testimonialHeading", "Testimonial heading", 160], ["testimonialSubheading", "Testimonial subheading", 300]],
};
const detailSections: readonly HomeSectionKey[] = ["hero", "difference", "nimbus", "testimonial", "newsletter", "values", "cities", "project"];
const merchandising: Partial<Record<HomeSectionKey, MerchandisingPart>> = { categories: "categories", offers: "offers", bestsellers: "bestsellers", chairs: "chairs" };
const campaigns: Partial<Record<HomeSectionKey, string[]>> = {
  announcement: ["landing-announcement"], "dining-banner": ["landing-dining-table"],
  "seating-banner": ["landing-sofa-accent-chair"], promos: ["landing-dining", "landing-storage", "landing-consoles"],
};
/** The artwork placements each section draws, in the Artwork screen's order. */
const artwork: Partial<Record<HomeSectionKey, (key: string) => boolean>> = {
  hero: (key) => key === "home-workshop-poster" || key.startsWith("home-hero-"),
  difference: (key) => key.startsWith("home-difference-"),
  values: (key) => key.startsWith("home-value-"),
  cities: (key) => key.startsWith("home-city-"),
  nimbus: (key) => key === "home-nimbus",
  newsletter: (key) => key === "home-newsletter",
  testimonial: (key) => key === "home-testimonial-poster",
};
const motion: Partial<Record<HomeSectionKey, [keyof Motion, string, boolean]>> = {
  ticker: ["autoplayTicker", "Automatically move the homepage ticker", true],
  instagram: ["autoplaySocial", "Automatically move Instagram posts", true],
  cities: ["autoplayCities", "Automatically move city illustrations", true],
};
type Tab = "Content" | "Media" | "Layout" | "Motion";

/**
 * Everything one homepage section shows, in one place: its text and products or campaign
 * (Content), its artwork (Media), its arrangement (Layout) and its movement (Motion). It takes
 * the editor column, so the live preview beside it keeps showing the change.
 */
export function SectionInspector({ section, content, edit, session, onExpired, onScheduleEditingChange, onBack }: {
  section: HomeSectionKey;
  content: StorefrontContent;
  edit: (next: StorefrontContent) => void;
  session: StaffSession;
  onExpired: () => void;
  onScheduleEditingChange: (editing: boolean) => void;
  onBack: () => void;
}) {
  const name = sectionName(section);
  const heading = useRef<HTMLHeadingElement>(null);
  const media = templateMediaSlots.filter((slot) => artwork[section]?.(slot.key)).map((slot) => slot.key as TemplateMediaKey);
  const moving = motion[section];
  const panels: Partial<Record<Tab, ReactNode>> = {
    Content: <>
      {copyFields[section] && <FieldGrid className="mb-6">
        {copyFields[section]!.map(([key, label, limit]) => (
          <Field key={key} label={label} value={content.homeCopy[key] ?? (key === "chairsHeading" ? "Chairs" : "")} maxLength={limit} multiline={key === "ticker"}
            onChange={(value) => edit({ ...content, homeCopy: { ...content.homeCopy, [key]: value } })} />
        ))}
      </FieldGrid>}
      {detailSections.includes(section) && <div className="grid gap-4">
        <HomeDetailFields section={section as HomeDetailSection} value={content.homeDetails} onChange={(homeDetails) => edit({ ...content, homeDetails })} />
      </div>}
      {merchandising[section] && <HomeMerchandisingFields only={merchandising[section]} embedded value={content.homeMerchandising}
        onChange={(homeMerchandising) => edit({ ...content, homeMerchandising })} session={session} onExpired={onExpired} />}
      {campaigns[section] && <CampaignFields only={campaigns[section]} embedded content={content} onChange={edit}
        session={session} onExpired={onExpired} onScheduleEditingChange={onScheduleEditingChange} />}
      {section === "instagram" && <InstagramFields content={content} onChange={edit} session={session} onExpired={onExpired} />}
    </>,
    ...(media.length ? { Media: <ArtworkSlots keys={media} value={content.templateMedia} onChange={(templateMedia) => edit({ ...content, templateMedia })} session={session} onExpired={onExpired} /> } : {}),
    ...(section === "cities" ? { Layout: <HomeCitiesLayoutFields value={content.homeCitiesLayout} onChange={(homeCitiesLayout) => edit({ ...content, homeCitiesLayout })} /> } : {}),
    ...(moving ? { Motion: <div className="grid gap-3">
      <CheckField label={moving[1]} checked={content.motion[moving[0]] ?? moving[2]}
        onChange={(event) => edit({ ...content, motion: { ...content.motion, [moving[0]]: event.target.checked } })} />
      <p className="text-xs text-muted-foreground">Visitors can pause motion. Their reduced-motion preference takes priority.</p>
    </div> } : {}),
  };
  const tabs = (Object.keys(panels) as Tab[]);
  const [active, setActive] = useState<Tab>(tabs[0]!);
  const shown = content.homeSections.find((item) => item.key === section)?.enabled ?? false;
  // Opening a section moves focus to its name, so keyboard and screen reader users land in it.
  useEffect(() => {
    const node = heading.current?.querySelector<HTMLElement>("h2");
    if (!node) return;
    node.tabIndex = -1;
    node.focus({ preventScroll: true });
  }, [section]);

  return (
    <section data-section-inspector={section} aria-label={`${name} section`}>
      <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft aria-hidden="true" strokeWidth={1.5} />Back to sections
      </Button>
      <div ref={heading}>
        <PanelHeader title={name} description="Everything this section shows. Changes stay in your draft and appear in the live preview."
          actions={<CheckField label="Show on the homepage" checked={shown}
            onChange={(event) => edit({ ...content, homeSections: content.homeSections.map((item) => item.key === section ? { ...item, enabled: event.target.checked } : item) })} />} />
      </div>
      <Tabs value={active} onValueChange={(next) => setActive(next as Tab)} className="gap-5">
        {tabs.length > 1 && <TabsList aria-label={`${name} settings`}>
          {/* Radix activates tabs on mousedown and focus; a plain click selects too. */}
          {tabs.map((tab) => <TabsTrigger key={tab} value={tab} className="px-3" onClick={() => setActive(tab)}>{tab}</TabsTrigger>)}
        </TabsList>}
        {tabs.map((tab) => <TabsContent key={tab} value={tab}>{panels[tab]}</TabsContent>)}
      </Tabs>
    </section>
  );
}
