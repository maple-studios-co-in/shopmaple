"use client";
import { useState, type ComponentProps } from "react";
import { PortalContainerProvider } from "@/components/ui/portal-container";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The `.shop-admin` element every admin screen renders in. It carries the tokens, and
 * overlays render inside it so they get the same tokens and base.
 */
export function AdminRoot({ className, children, ...props }: ComponentProps<"section">) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  return (
    <section ref={setRoot} className={cn("shop-admin", className)} {...props}>
      <PortalContainerProvider container={root}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </PortalContainerProvider>
    </section>
  );
}
