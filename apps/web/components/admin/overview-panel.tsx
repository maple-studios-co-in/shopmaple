"use client";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { StorefrontContent } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmSummary } from "./crm-summary";
import type { StaffSession } from "./dashboard";
import { PanelHeader } from "./kit";

/** A stat tile: a sunken tray holding a raised card, label above a large tabular number. */
function StatTile({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="rounded-xl bg-sunken/70 p-1 ring-1 ring-line-soft">
      <div className="grid h-full gap-3 rounded-[calc(var(--radius-xl)-4px)] bg-card px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span className="flex items-baseline gap-2">
          <strong className="text-[32px] leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums">{value}</strong>
          <small className="text-[12.5px] text-muted-foreground">{note}</small>
        </span>
      </div>
    </div>
  );
}

export function OverviewPanel({ content, session, onExpired, version, publishedVersion, dirty }: {
  content: StorefrontContent;
  session: StaffSession;
  onExpired: () => void;
  version: number | null;
  publishedVersion: number | null;
  dirty: boolean;
}) {
  const visible = content.homeSections.filter((s) => s.enabled).length;
  return (
    <>
      <PanelHeader title="Overview" description="What is in the draft right now, and where the storefront stands." />
      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Draft summary">
        <StatTile label="Homepage sections" value={visible} note={`visible of ${content.homeSections.length}`} />
        <StatTile label="Campaigns" value={content.campaigns.length} note="editable" />
        <StatTile label="Informational pages" value={content.pages.length} note={content.pages.length === 1 ? "page" : "pages"} />
      </div>
      {session.user.canManageEnquiries === true && <div className="mt-8"><CrmSummary session={session} onExpired={onExpired} /></div>}
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="gap-3 py-5 shadow-xs">
          <CardHeader className="px-5"><CardTitle className="text-[15px]"><h3>Publishing</h3></CardTitle></CardHeader>
          <CardContent className="grid gap-2.5 px-5 text-[13.5px] leading-relaxed text-muted-foreground">
            <p>
              {session.user.role === "publisher"
                ? "You can edit and publish. Save any unsaved changes before publishing."
                : "You can edit and save drafts. A publisher must publish your changes."}
            </p>
            <p>Restoring a revision creates a draft. It does not change the live storefront until published.</p>
            <p className="text-foreground">
              {publishedVersion
                ? `The storefront is on version ${publishedVersion}; the draft is version ${version}${dirty ? " with unsaved changes" : ""}.`
                : "Nothing is published yet. Visitors see the bundled storefront content until the first publish."}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-3 py-5 shadow-xs">
          <CardHeader className="px-5">
            <CardTitle className="text-[15px]"><h3>Storefront</h3></CardTitle>
            <CardDescription className="text-[13.5px] leading-relaxed">Open the live storefront in a new tab, or use Live preview in the top bar to see the draft beside the editor.</CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <Button asChild variant="outline" size="sm">
              <a href="/" target="_blank" rel="noopener noreferrer">Open storefront <ExternalLink aria-hidden="true" strokeWidth={1.5} /></a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
