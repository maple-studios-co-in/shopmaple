"use client";

import { useEffect, useId, useState } from "react";
import type { CampaignContent } from "@shopmaple/contracts";

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
  return (
    <section aria-label="Campaign schedule">
      <h3>Campaign schedule</h3>
      <p>India time · Asia/Kolkata · UTC+05:30</p>
      <p role="status">
        Draft schedule: {!value?.startsAt && !value?.endsAt ? "Always visible" : (
          <>{value?.startsAt ? `From ${indiaInput(value.startsAt).replace("T", " ")} (inclusive)` : "No start limit"}
            {" · "}{value?.endsAt ? `Until ${indiaInput(value.endsAt).replace("T", " ")} (exclusive)` : "No end limit"}</>
        )}
      </p>
      <p id={descriptionId}>
        The banner is visible from the start time (inclusive) until the end time (exclusive), and hidden outside this window.
        Apply schedule changes, then Save draft and Publish draft to update the storefront.
        Leave either date empty for no limit.
      </p>
      {editing ? (
        <>
          <p>Schedule edit in progress. Apply or cancel before saving, publishing, or switching sections.</p>
          <div className="admin-fields">
            <label className="admin-field">
              <span>Starts at (India time)</span>
              <input type="datetime-local" step="0.001" aria-label="Starts at (India time)" value={starts}
                aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`} aria-invalid={Boolean(error)}
                onInput={(event) => {
                  setStarts(event.currentTarget.value);
                  setBadStart(event.currentTarget.validity.badInput);
                }} />
            </label>
            <label className="admin-field">
              <span>Ends at (India time)</span>
              <input type="datetime-local" step="0.001" aria-label="Ends at (India time)" value={ends}
                aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`} aria-invalid={Boolean(error)}
                onInput={(event) => {
                  setEnds(event.currentTarget.value);
                  setBadEnd(event.currentTarget.validity.badInput);
                }} />
            </label>
          </div>
          {error && <p role="alert" id={errorId}>{error}</p>}
          <button type="button" disabled={Boolean(error)} onClick={() => {
            if (error || startsAt === undefined || endsAt === undefined) return;
            onChange({ startsAt, endsAt });
            close();
          }}>Apply schedule to draft</button>
          <button type="button" onClick={close}>Cancel schedule edit</button>
        </>
      ) : (
        <>
          <button type="button" onClick={begin}>{value ? "Edit schedule" : "Enable schedule"}</button>
          {value && <button type="button" onClick={() => onChange(null)}>Clear schedule</button>}
        </>
      )}
    </section>
  );
}
