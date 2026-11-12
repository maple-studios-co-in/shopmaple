"use client";
import type { ReactNode } from "react";
import type { CollectionLandingContent, CollectionSectionKey } from "@shopmaple/contracts";
import { ContentPanel, ContentPanels, FieldGrid, PageEditor, SectionToggles, textField } from "./kit";

/**
 * The collection template's editor (Figma 311:548 Nimbus, 311:921 Terra; owner, 10 Nov 2026): the regions' order and
 * visibility, then each region's words. `name` starts every field's label ("Nimbus opening heading"); items are edited in
 * place, each matched to its photo, icon and link by position. Links, photos and products stay with the page.
 */
const regionLabels: Record<CollectionSectionKey, string> = {
  hero: "Opening", "room-nav": "Room links", philosophy: "Point of view", origin: "Origin", rooms: "Rooms", feeling: "How it feels",
  material: "Material story", browse: "Collections", pieces: "The edit", consultation: "Consultation", promise: "Promise",
};
const line = 160, eyebrow = 300, para = 2000;

export function CollectionLandingFields({ name, title, value, onChange, description }: {
  /** The collection's name as staff know it ("Nimbus"); every label starts with it. */
  name: string;
  /** The editor's heading ("The Nimbus Collection"). */
  title: string;
  /** The page's complete words, as its resolver gives them. */
  value: CollectionLandingContent;
  onChange: (value: CollectionLandingContent) => void;
  description: ReactNode;
}) {
  const page = value;
  const set = <K extends keyof CollectionLandingContent>(key: K, next: CollectionLandingContent[K]) => onChange({ ...page, [key]: next });
  const at = <T,>(items: readonly T[], index: number, next: T) => items.map((item, i) => (i === index ? next : item));
  const field = (label: string, text: string, max: number, change: (text: string) => void, multiline = false) =>
    textField(`${name} ${label}`, text, max, change, multiline);
  const heads = <K extends "hero" | "philosophy" | "origin" | "feeling" | "material" | "browse" | "pieces" | "consultation">(key: K, label: string) => [
    field(`${label} eyebrow`, page[key].eyebrow, eyebrow, text => set(key, { ...page[key], eyebrow: text })),
    field(`${label} heading`, page[key].heading, line, text => set(key, { ...page[key], heading: text }), true),
  ];
  const regions: Partial<Record<CollectionSectionKey, ReactNode>> = {
    hero: <FieldGrid>
      {heads("hero", "opening")}
      {field("opening text", page.hero.body, para, text => set("hero", { ...page.hero, body: text }), true)}
      {field("opening button", page.hero.cta, line, text => set("hero", { ...page.hero, cta: text }))}
      {page.hero.film !== undefined && field("film link", page.hero.film, line, text => set("hero", { ...page.hero, film: text }))}
    </FieldGrid>,
    "room-nav": <FieldGrid>
      {page.roomNav.map((item, index) => field(`room link ${index + 1}`, item.label, line, text => set("roomNav", at(page.roomNav, index, { label: text }))))}
    </FieldGrid>,
    philosophy: <FieldGrid>
      {heads("philosophy", "point of view")}
      {field("point of view text", page.philosophy.body, para, text => set("philosophy", { ...page.philosophy, body: text }), true)}
    </FieldGrid>,
    origin: <FieldGrid>
      {heads("origin", "origin")}
      {field("origin text", page.origin.body, para, text => set("origin", { ...page.origin, body: text }), true)}
    </FieldGrid>,
    ...(page.rooms ? {
      rooms: <FieldGrid>
        {field("rooms eyebrow", page.rooms.eyebrow, eyebrow, text => set("rooms", { ...page.rooms!, eyebrow: text }))}
        {field("rooms heading", page.rooms.heading, line, text => set("rooms", { ...page.rooms!, heading: text }), true)}
        {page.rooms.items.flatMap((room, index) => {
          const change = (patch: Partial<typeof room>) => set("rooms", { ...page.rooms!, items: at(page.rooms!.items, index, { ...room, ...patch }) });
          const n = index + 1;
          return [
            field(`room ${n} label`, room.label, line, text => change({ label: text })),
            field(`room ${n} heading`, room.heading, line, text => change({ heading: text }), true),
            field(`room ${n} text`, room.body, para, text => change({ body: text }), true),
            field(`room ${n} tags`, room.tags, line, text => change({ tags: text })),
            field(`room ${n} button`, room.cta, line, text => change({ cta: text })),
          ];
        })}
      </FieldGrid>,
    } : {}),
    feeling: <FieldGrid>
      {heads("feeling", "feeling")}
      {page.feeling.items.flatMap((item, index) => [
        field(`feeling card ${index + 1} title`, item.title, line, text => set("feeling", { ...page.feeling, items: at(page.feeling.items, index, { ...item, title: text }) })),
        field(`feeling card ${index + 1} text`, item.body, para, text => set("feeling", { ...page.feeling, items: at(page.feeling.items, index, { ...item, body: text }) }), true),
      ])}
    </FieldGrid>,
    material: <FieldGrid>
      {heads("material", "material")}
      {field("material text", page.material.body, para, text => set("material", { ...page.material, body: text }), true)}
      {page.material.notes.map((note, index) => field(`material note ${index + 1}`, note.label, line,
        text => set("material", { ...page.material, notes: at(page.material.notes, index, { label: text }) })))}
      {field("material button", page.material.cta, line, text => set("material", { ...page.material, cta: text }))}
    </FieldGrid>,
    browse: <FieldGrid>
      {heads("browse", "collections")}
      {page.browse.items.map((item, index) => field(`collection card ${index + 1} title`, item.title, line,
        text => set("browse", { ...page.browse, items: at(page.browse.items, index, { title: text }) })))}
      {field("collection card link", page.browse.link, line, text => set("browse", { ...page.browse, link: text }))}
    </FieldGrid>,
    pieces: <FieldGrid>
      {heads("pieces", "edit")}
      {page.pieces.lead !== undefined && field("edit lead", page.pieces.lead, para, text => set("pieces", { ...page.pieces, lead: text }), true)}
      {page.pieces.items.flatMap((item, index) => {
        // A catalogue product is drawn as the store's own product card, with the catalogue's name, rating and price
        // (owner, 12 Nov 2026), so it has no words to write here. A concept's name, line and link are staff copy.
        if (item.title === undefined) return [];
        const change = (patch: Partial<typeof item>) => set("pieces", { ...page.pieces, items: at(page.pieces.items, index, { ...item, ...patch }) });
        return [
          field(`edit card ${index + 1} title`, item.title, line, text => change({ title: text })),
          field(`edit card ${index + 1} line`, item.line, line, text => change({ line: text })),
        ];
      })}
      {page.pieces.items.some(item => item.title !== undefined) &&
        field("edit card link", page.pieces.link, line, text => set("pieces", { ...page.pieces, link: text }))}
      {page.pieces.cta !== undefined && field("edit button", page.pieces.cta, line, text => set("pieces", { ...page.pieces, cta: text }))}
    </FieldGrid>,
    consultation: <FieldGrid>
      {heads("consultation", "consultation")}
      {field("consultation text", page.consultation.body, para, text => set("consultation", { ...page.consultation, body: text }), true)}
      {field("consultation button", page.consultation.cta, line, text => set("consultation", { ...page.consultation, cta: text }))}
      {field("consultation note", page.consultation.note, line, text => set("consultation", { ...page.consultation, note: text }))}
    </FieldGrid>,
    promise: <FieldGrid>
      {page.promise.map((item, index) => field(`promise ${index + 1}`, item.label, line, text => set("promise", at(page.promise, index, { label: text }))))}
    </FieldGrid>,
  };
  const shown = page.sections.filter(section => regions[section.key]);
  return (
    <PageEditor label={`${name} page content`} title={title} description={description}
      intro={<FieldGrid>{field("page title", page.title, line, text => set("title", text))}</FieldGrid>}>
      <SectionToggles prefix={name} labels={regionLabels} items={shown} onChange={sections => set("sections", sections)}
        description="Drag regions into order, or use the Move buttons, and hide the ones you do not need. A page heading remains available to screen readers." />
      <ContentPanels>
        {shown.map(section => <ContentPanel key={section.key} title={regionLabels[section.key]}>{regions[section.key]}</ContentPanel>)}
      </ContentPanels>
    </PageEditor>
  );
}
