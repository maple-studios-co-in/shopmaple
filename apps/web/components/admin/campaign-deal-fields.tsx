"use client";
import { useState } from "react";
import { campaignDealSchema, type CampaignContent } from "@shopmaple/contracts";
import { Plus } from "lucide-react";
import { endsLabel } from "@/components/store/product-deal";
import { Notice } from "./crm-primitives";
import { Field } from "./field";
import { ActionButton, FieldGrid, RemoveButton, SectionHeading, usePendingFocus } from "./kit";

type Deal = NonNullable<CampaignContent["deal"]>;

/** The contract's own messages, so the form and a save can never disagree about what is valid. */
const problems = (deal: Deal) => (["offer", "code"] as const).flatMap((field) => campaignDealSchema.shape[field].safeParse(deal[field]).error?.issues[0]?.message ?? []);

/** The offer this campaign runs on the product page's countdown. Its start and end are the campaign schedule's. */
export function CampaignDealFields({ value, endsAt, onChange }: {
  value: CampaignContent["deal"]; endsAt: string | null | undefined; onChange: (deal: Deal | undefined) => void;
}) {
  // The control that was clicked goes away with the click, so focus moves on to what replaced it.
  const focus = usePendingFocus<"fields" | "add">(value === undefined);
  const change = (deal: Deal | undefined, target: "fields" | "add") => { focus.focusAfter(target); onChange(deal); };
  // When the screen opened, for telling an end that has already passed (owner, 10 Nov 2026: "it is not coming").
  const [openedAt] = useState(Date.now);
  return (
    <section aria-label="Product page timer" className="mt-8 grid gap-4 rounded-lg border border-line-soft bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <SectionHeading className="m-0" description="Shows “Don’t miss the deal” with this code and a countdown on every product page while the campaign runs. It starts and ends with the schedule above. Add only an offer your team honours.">
          Product page timer
        </SectionHeading>
        {value && <RemoveButton label="Remove the timer offer" onClick={() => change(undefined, "add")} />}
      </div>
      {value ? (
        <>
          <div ref={focus.track("fields")} tabIndex={-1} className="outline-none">
            <FieldGrid>
              <Field label="Timer offer" value={value.offer} maxLength={40} onChange={(offer) => onChange({ ...value, offer })} />
              <Field label="Timer offer code" value={value.code} maxLength={24} onChange={(code) => onChange({ ...value, code: code.toUpperCase().replace(/\s+/g, "") })} />
            </FieldGrid>
          </div>
          {problems(value).map((message) => <p key={message} data-field-error className="text-xs font-medium text-danger">{message}</p>)}
          {!endsAt
            ? <Notice tone="info">Add an end time to the campaign schedule. The timer needs a deadline, and stays hidden until it has one.</Notice>
            : Date.parse(endsAt) > openedAt
              ? <p className="text-xs text-muted-foreground">Counts down to {endsLabel(endsAt)}.</p>
              : <Notice tone="info">This end has passed, so product pages show no timer. Move the end in the schedule above to run it again.</Notice>}
        </>
      ) : (
        <div><ActionButton icon={Plus} ref={focus.track("add")} onClick={() => change({ offer: "", code: "" }, "fields")}>Add a timer offer</ActionButton></div>
      )}
    </section>
  );
}
