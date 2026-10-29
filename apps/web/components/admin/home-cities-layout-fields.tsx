"use client";

import { useLayoutEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { HomeCitiesLayout, HomeCityKey } from "@shopmaple/contracts";
import { defaultHomeCitiesLayout, homeCityNames } from "@/lib/home-cities-defaults";
import { Button } from "@/components/ui/button";
import { Notice } from "./crm-primitives";
import { SectionHeading } from "./kit";
import { ToggleRows } from "./service-page-fields";

export function HomeCitiesLayoutFields({ value, onChange }: {
  value?: HomeCitiesLayout;
  onChange: (value: HomeCitiesLayout) => void;
}) {
  const current = value ?? defaultHomeCitiesLayout;
  const rows = useRef(new Map<HomeCityKey, HTMLLIElement>());
  const pendingFocus = useRef<HomeCityKey | null>(null);
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      rows.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  }, [current]);
  const original = current.every((item, index) => item.key === defaultHomeCitiesLayout[index]?.key && item.enabled === defaultHomeCitiesLayout[index]?.enabled);
  function update(next: HomeCitiesLayout, focus: HomeCityKey) {
    pendingFocus.current = focus;
    onChange(next);
  }
  return <section aria-label="Homepage cities layout" className="grid gap-3">
    <SectionHeading className="mb-0" description="Drag city illustrations into order, or use the Move buttons, and choose which ones visitors see. Replace their images in Artwork → Cities. Save a draft, then publish when ready.">City artwork order and visibility</SectionHeading>
    <Notice tone="info">These controls change homepage presentation only. Actual delivery serviceability is managed by Keeri.</Notice>
    <ToggleRows
      items={current}
      name={item => homeCityNames[item.key]}
      label={item => homeCityNames[item.key]}
      onChange={next => onChange(next)}
      onReorder={(next, moved) => update(next, moved.key)}
      rowProps={item => ({ tabIndex: -1, "aria-label": `City artwork ${homeCityNames[item.key]}`, ref: (node: HTMLElement | null) => {
        if (node) rows.current.set(item.key, node as HTMLLIElement);
        else rows.current.delete(item.key);
      } })}
    />
    <div>
      <Button type="button" variant="outline" size="sm" disabled={original} onClick={() => update(defaultHomeCitiesLayout.map(item => ({...item})), "delhi")}>
        <RotateCcw aria-hidden="true" strokeWidth={1.5} />Restore original city layout
      </Button>
    </div>
  </section>;
}
