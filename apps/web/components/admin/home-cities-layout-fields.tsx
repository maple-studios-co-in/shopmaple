"use client";
import { RotateCcw } from "lucide-react";
import type { HomeCitiesLayout, HomeCityKey } from "@shopmaple/contracts";
import { defaultHomeCitiesLayout, homeCityNames } from "@/lib/home-cities-defaults";
import { Notice } from "./crm-primitives";
import { ActionButton, SectionHeading, ToggleRows, usePendingFocus } from "./kit";

export function HomeCitiesLayoutFields({ value, onChange }: { value?: HomeCitiesLayout; onChange: (value: HomeCitiesLayout) => void }) {
  const current = value ?? defaultHomeCitiesLayout;
  const rows = usePendingFocus<HomeCityKey>(current);
  const original = current.every((item, index) => item.key === defaultHomeCitiesLayout[index]?.key && item.enabled === defaultHomeCitiesLayout[index]?.enabled);
  function update(next: HomeCitiesLayout, focus: HomeCityKey) {
    rows.focusAfter(focus);
    onChange(next);
  }
  return (
    <section aria-label="Homepage cities layout" className="grid gap-3">
      <SectionHeading className="mb-0"
        description="Drag city illustrations into order, or use the Move buttons, and choose which ones visitors see. Replace their images in Artwork → Cities. Save a draft, then publish when ready.">
        City artwork order and visibility
      </SectionHeading>
      <Notice tone="info">These controls change homepage presentation only. Actual delivery serviceability is managed by Keeri.</Notice>
      <ToggleRows items={current} name={item => homeCityNames[item.key]} label={item => homeCityNames[item.key]} onChange={onChange}
        onReorder={(next, moved) => update(next, moved.key)}
        rowProps={item => ({ tabIndex: -1, "aria-label": `City artwork ${homeCityNames[item.key]}`, ref: rows.track(item.key) })} />
      <div>
        <ActionButton icon={RotateCcw} disabled={original} onClick={() => update(defaultHomeCitiesLayout.map(item => ({ ...item })), "delhi")}>
          Restore original city layout
        </ActionButton>
      </div>
    </section>
  );
}
