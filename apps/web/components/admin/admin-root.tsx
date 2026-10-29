"use client";
import { useState, type ComponentProps } from "react";
import { PortalContainerProvider } from "@/components/ui/portal-container";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The `.shop-admin` element every admin screen renders in. It carries the tokens, and
 * overlays and toasts render inside it so they get the same tokens and base.
 */
export function AdminRoot({ className, children, ...props }: ComponentProps<"section">) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  return (
    <section ref={setRoot} className={cn("shop-admin", className)} {...props}>
      <PortalContainerProvider container={root}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </PortalContainerProvider>
    </section>
  );
}
