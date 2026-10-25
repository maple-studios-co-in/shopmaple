"use client";
import { useEffect, useRef } from "react";
import type { HomeDetails } from "@shopmaple/contracts";
import { resolveHomeDetails } from "@/lib/home-details-defaults";
import { Field } from "./forms";

const tileNames = { sofas: "Sofas", chairs: "Chairs", tables: "Tables", beds: "Beds" };
const valueNames = { "quiet-luxury": "Quiet luxury", "real-living": "Real living", "ages-beautifully": "Ages beautifully", strength: "Strength" };
export function HomeDetailsFields({ value, onChange }: {
  value?: HomeDetails;
  onChange: (value: HomeDetails) => void;
}) {
  const page = resolveHomeDetails(value);
  const paragraphFields = useRef<HTMLDivElement>(null);
  const addParagraph = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<number | "add" | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === "add") addParagraph.current?.focus();
    else paragraphFields.current?.querySelectorAll("textarea")[target]?.focus();
    pendingFocus.current = null;
  }, [page.testimonial.paragraphs.length]);
  function update<K extends keyof HomeDetails>(key: K, value: HomeDetails[K]) {
    onChange({ ...page, [key]: value });
  }
  const field = (label: string, value: string, maxLength: number, onChange: (value: string) => void, multiline = false) => (
    <Field key={label} label={label} value={value} maxLength={maxLength} onChange={onChange} multiline={multiline} />
  );
  return (
    <section aria-label="Homepage section content">
      <h3>Section content</h3>
      <p>Open a section to edit its text. Changes appear on the storefront only after publishing.</p>
      <details>
        <summary>Hero</summary>
        <div className="admin-fields">
          {field("Hero collection button", page.hero.cta, 80, cta => update("hero", { ...page.hero, cta }))}
          {page.hero.tiles.map(tile => (
            <fieldset key={tile.key}>
              <legend>{tileNames[tile.key]}</legend>
              {field(`${tileNames[tile.key]} tile label`, tile.label, 80, label => update("hero", { ...page.hero, tiles: page.hero.tiles.map(item => item.key === tile.key ? { ...item, label } : item) }))}
              {field(`${tileNames[tile.key]} starting-price label`, tile.priceLabel, 80, priceLabel => update("hero", { ...page.hero, tiles: page.hero.tiles.map(item => item.key === tile.key ? { ...item, priceLabel } : item) }))}
            </fieldset>
          ))}
        </div>
        <p>Starting-price labels are display text. Product prices and availability are managed in Keeri.</p>
      </details>
      <details>
        <summary>The Maple Difference</summary>
        <div className="admin-fields">
          {field("Difference eyebrow", page.difference.eyebrow, 160, eyebrow => update("difference", { ...page.difference, eyebrow }))}
          {field("Difference heading", page.difference.heading, 160, heading => update("difference", { ...page.difference, heading }))}
          {field("Difference button", page.difference.cta, 80, cta => update("difference", { ...page.difference, cta }))}
          {page.difference.promises.map((value, index) => field(`Difference promise ${index + 1}`, value, 160, value => update("difference", { ...page.difference, promises: page.difference.promises.map((item, i) => i === index ? value : item) })))}
        </div>
      </details>
      <details>
        <summary>Nimbus</summary>
        <div className="admin-fields">
          {field("Nimbus heading", page.nimbus.heading, 160, heading => update("nimbus", { ...page.nimbus, heading }))}
          {field("Nimbus tagline", page.nimbus.tagline, 300, tagline => update("nimbus", { ...page.nimbus, tagline }))}
          {field("Nimbus button", page.nimbus.cta, 80, cta => update("nimbus", { ...page.nimbus, cta }))}
          {page.nimbus.features.map((value, index) => field(`Nimbus feature ${index + 1}`, value, 160, value => update("nimbus", { ...page.nimbus, features: page.nimbus.features.map((item, i) => i === index ? value : item) })))}
        </div>
      </details>
      <details>
        <summary>Customer testimonial</summary>
        <p>Use only approved customer wording and attribution.</p>
        <div className="admin-fields" ref={paragraphFields}>
          {field("Testimonial title", page.testimonial.title, 160, title => update("testimonial", { ...page.testimonial, title }))}
          {field("Testimonial customer name", page.testimonial.name, 120, name => update("testimonial", { ...page.testimonial, name }))}
          {field("Testimonial attribution", page.testimonial.attribution, 160, attribution => update("testimonial", { ...page.testimonial, attribution }))}
          {page.testimonial.paragraphs.map((value, index) => (
            <div key={index}>
              {field(`Testimonial paragraph ${index + 1}`, value, 2000, value => update("testimonial", { ...page.testimonial, paragraphs: page.testimonial.paragraphs.map((item, i) => i === index ? value : item) }), true)}
              <button type="button" disabled={page.testimonial.paragraphs.length === 1} aria-label={`Remove testimonial paragraph ${index + 1}`} onClick={() => {
                pendingFocus.current = "add";
                update("testimonial", { ...page.testimonial, paragraphs: page.testimonial.paragraphs.filter((_, i) => i !== index) });
              }}>Remove paragraph</button>
            </div>
          ))}
        </div>
        <button type="button" ref={addParagraph} disabled={page.testimonial.paragraphs.length === 6} onClick={() => {
          pendingFocus.current = page.testimonial.paragraphs.length;
          update("testimonial", { ...page.testimonial, paragraphs: [...page.testimonial.paragraphs, ""] });
        }}>Add testimonial paragraph</button>
      </details>
      <details>
        <summary>Newsletter</summary>
        <div className="admin-fields">
          {field("Newsletter heading", page.newsletter.heading, 160, heading => update("newsletter", { ...page.newsletter, heading }))}
          {field("Newsletter body", page.newsletter.body, 2000, body => update("newsletter", { ...page.newsletter, body }), true)}
          {field("Newsletter signup heading", page.newsletter.signupHeading, 160, signupHeading => update("newsletter", { ...page.newsletter, signupHeading }))}
        </div>
      </details>
      <details>
        <summary>Values</summary>
        <div className="admin-fields">
          {page.values.map(value => (
            <fieldset key={value.key}>
              <legend>{valueNames[value.key]}</legend>
              {field(`${valueNames[value.key]} title`, value.title, 160, title => update("values", page.values.map(item => item.key === value.key ? { ...item, title } : item)))}
              {field(`${valueNames[value.key]} body`, value.body, 2000, body => update("values", page.values.map(item => item.key === value.key ? { ...item, body } : item)), true)}
            </fieldset>
          ))}
        </div>
      </details>
      <details>
        <summary>Cities</summary>
        <div className="admin-fields">
          {field("Cities eyebrow", page.cities.eyebrow, 160, eyebrow => update("cities", { ...page.cities, eyebrow }))}
          {field("Cities heading", page.cities.heading, 160, heading => update("cities", { ...page.cities, heading }))}
        </div>
      </details>
      <details>
        <summary>Project introduction</summary>
        <div className="admin-fields">
          {field("Project heading", page.project.heading, 160, heading => update("project", { ...page.project, heading }))}
          {field("Project text before response time", page.project.introBefore, 1000, introBefore => update("project", { ...page.project, introBefore }), true)}
          {field("Project response time", page.project.responseTime, 80, responseTime => update("project", { ...page.project, responseTime }))}
          {field("Project text after response time", page.project.introAfter, 1000, introAfter => update("project", { ...page.project, introAfter }), true)}
          {field("Project body", page.project.body, 2000, body => update("project", { ...page.project, body }), true)}
        </div>
        <p>Spacing around the highlighted response time is added automatically. This text does not change enquiry handling.</p>
      </details>
    </section>
  );
}
