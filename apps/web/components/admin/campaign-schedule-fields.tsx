"use client";

import { useEffect, useId, useState } from "react";
import type { CampaignContent } from "@shopmaple/contracts";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "./crm-primitives";
import { FieldGrid, SectionHeading } from "./kit";

type Schedule = NonNullable<CampaignContent["schedule"]>;
const indiaOffset = 330 * 60 * 1000;

function indiaInput(instant: string | null | undefined) {
  if (!instant) return "";
  const milliseconds = Date.parse(instant);
  if (!Number.isFinite(milliseconds)) return instant;
  const local = new Date(milliseconds + indiaOffset).toISOString().slice(0, -1);
  return local.endsWith(":00.000") ? local.slice(0, 16) : local;
}

function parseIndiaInput(value: string): string | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value)) return undefined;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const milliseconds = Date.parse(`${withSeconds}+05:30`);
  if (!Number.isFinite(milliseconds)) return undefined;
  const instant = new Date(milliseconds).toISOString();
  const expectedLocal = withSeconds.includes(".")
    ? withSeconds.padEnd(23, "0")
    : `${withSeconds}.000`;
  return new Date(milliseconds + indiaOffset).toISOString().slice(0, -1) === expectedLocal
    ? instant : undefined;
}

export function CampaignScheduleFields({ value, onChange, onEditingChange }: {
  value: CampaignContent["schedule"];
  onChange: (schedule: Schedule | null) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [badStart, setBadStart] = useState(false);
  const [badEnd, setBadEnd] = useState(false);
  const descriptionId = useId();
  const errorId = useId();
  const startsAt = parseIndiaInput(starts);
  const endsAt = parseIndiaInput(ends);
  const malformed = badStart || badEnd || startsAt === undefined || endsAt === undefined;
  const reversed = startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt);
  const error = malformed
    ? "Enter a complete, valid date and time, or clear the field."
    : reversed ? "The end must be after the start." : "";

  useEffect(() => () => onEditingChange(false), [onEditingChange]);

  function close() {
    setEditing(false);
    onEditingChange(false);
  }
  function begin() {
    setStarts(indiaInput(value?.startsAt));
    setEnds(indiaInput(value?.endsAt));
    setBadStart(false);
    setBadEnd(false);
    setEditing(true);
    onEditingChange(true);
  }
  const describedBy = `${descriptionId}${error ? ` ${errorId}` : ""}`;
  return (
    <section aria-label="Campaign schedule" className="mt-8 grid gap-4 rounded-lg border border-line-soft bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <SectionHeading className="m-0" description="India time · Asia/Kolkata · UTC+05:30">Campaign schedule</SectionHeading>
        <p role="status" className="flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-xs tabular-nums">
          <CalendarClock aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" />
          <span>
            Draft schedule: {!value?.startsAt && !value?.endsAt ? "Always visible" : (
              <>{value?.startsAt ? `From ${indiaInput(value.startsAt).replace("T", " ")} (inclusive)` : "No start limit"}
                {" · "}{value?.endsAt ? `Until ${indiaInput(value.endsAt).replace("T", " ")} (exclusive)` : "No end limit"}</>
            )}
          </span>
        </p>
      </div>
      <p id={descriptionId} className="max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
        The banner is visible from the start time (inclusive) until the end time (exclusive), and hidden outside this window.
        Apply schedule changes, then Save draft and Publish draft to update the storefront.
        Leave either date empty for no limit.
      </p>
      {editing ? (
        <>
          <Notice tone="info">Schedule edit in progress. Apply or cancel before saving, publishing, or switching sections.</Notice>
          <FieldGrid>
            {([["Starts at (India time)", starts, setStarts, setBadStart], ["Ends at (India time)", ends, setEnds, setBadEnd]] as const).map(([label, text, setText, setBad]) => (
              <label key={label} className="grid min-w-0 gap-2">
                <span className="text-xs font-medium text-foreground">{label}</span>
                <Input type="datetime-local" step="0.001" aria-label={label} value={text} className="h-10 bg-card text-sm tabular-nums"
                  aria-describedby={describedBy} aria-invalid={Boolean(error)} onChange={() => {}}
                  onInput={(event) => { setText(event.currentTarget.value); setBad(event.currentTarget.validity.badInput); }} />
              </label>
            ))}
          </FieldGrid>
          {error && <div id={errorId}><Notice tone="error">{error}</Notice></div>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={Boolean(error)} onClick={() => {
              if (error || startsAt === undefined || endsAt === undefined) return;
              onChange({ startsAt, endsAt });
              close();
            }}>Apply schedule to draft</Button>
            <Button type="button" variant="outline" size="sm" onClick={close}>Cancel schedule edit</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={begin}>{value ? "Edit schedule" : "Enable schedule"}</Button>
          {value && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange(null)}>Clear schedule</Button>}
        </div>
      )}
    </section>
  );
}
