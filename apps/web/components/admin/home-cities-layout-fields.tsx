"use client";

import { useLayoutEffect, useRef } from "react";
import type { HomeCitiesLayout, HomeCityKey } from "@shopmaple/contracts";
import { defaultHomeCitiesLayout, homeCityNames } from "@/lib/home-cities-defaults";

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
  return <section aria-label="Homepage cities layout">
    <h3>City artwork order and visibility</h3>
    <p>These controls change homepage presentation only. Actual delivery serviceability is managed by Keeri.</p>
    <p>Choose which city illustrations visitors see and their order. Replace their images in Artwork → Cities. Save a draft, then publish when ready.</p>
    <ol className="admin-section-list">
      {current.map((item, index) => <li key={item.key} tabIndex={-1} aria-label={`City artwork ${homeCityNames[item.key]}`} ref={node => {
        if (node) rows.current.set(item.key, node);
        else rows.current.delete(item.key);
      }}>
        <label>
          <input type="checkbox" aria-label={`Show ${homeCityNames[item.key]}`} checked={item.enabled} onChange={event => {
            onChange(current.map(city => city.key === item.key ? {...city, enabled:event.target.checked} : city));
          }} />
          <span>{homeCityNames[item.key]}</span>
        </label>
        <div className="admin-actions">
          {([-1, 1] as const).map(direction => <button key={direction} type="button"
            aria-label={`Move ${homeCityNames[item.key]} ${direction === -1 ? "up" : "down"}`}
            disabled={index + direction < 0 || index + direction >= current.length}
            onClick={() => {
              const next = [...current];
              [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
              update(next, item.key);
            }}>{direction === -1 ? "Move up" : "Move down"}</button>)}
        </div>
      </li>)}
    </ol>
    <button type="button" disabled={original} onClick={() => update(defaultHomeCitiesLayout.map(item => ({...item})), "delhi")}>Restore original city layout</button>
  </section>;
}
