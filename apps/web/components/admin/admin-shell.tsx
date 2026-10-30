"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, LogOut, Search, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { initials } from "./crm-primitives";

export type NavGroup<T extends string> = { label: string | null; items: T[] };

/** The grouped section navigation: collapsible groups, icons, the current section marked. */
export function AdminSidebar<T extends string>({ groups, current, icons, disabled, onSelect, publishedVersion }: {
  groups: NavGroup<T>[]; current: T; icons: Record<T, LucideIcon>; disabled: (name: T) => boolean; onSelect: (name: T) => void; publishedVersion: number | null;
}) {
  const item = (name: T) => {
    const Icon: LucideIcon = icons[name];
    return (
      <SidebarMenuItem key={name}>
        <SidebarMenuButton type="button" isActive={current === name} aria-current={current === name ? "page" : undefined} disabled={disabled(name)} tooltip={name} onClick={() => onSelect(name)}
          className="h-8 text-sm font-medium text-muted-foreground data-[active=true]:bg-card data-[active=true]:font-semibold data-[active=true]:text-foreground data-[active=true]:shadow-xs [&>svg]:text-faint data-[active=true]:[&>svg]:text-primary"
        >
          <Icon aria-hidden="true" strokeWidth={1.5} /><span>{name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };
  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 pt-4 pb-2 group-data-[collapsible=icon]:px-2">
        <a href="/" className="grid gap-0.5 rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 group-data-[collapsible=icon]:hidden">
          <strong className="font-display text-lg leading-tight font-normal text-foreground">Maple Furnishers</strong>
          <span className="text-2xs font-medium text-faint">Shop admin</span>
        </a>
        <span aria-hidden="true" className="hidden size-8 place-items-center rounded-md bg-primary font-display text-base text-primary-foreground group-data-[collapsible=icon]:grid">M</span>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Admin sections" className="grid gap-1">
          {groups.map((group) => group.label === null ? (
            <SidebarGroup key="top" className="py-0.5">
              <SidebarGroupContent><SidebarMenu>{group.items.map(item)}</SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <Collapsible key={group.label} defaultOpen className="group/collapsible">
              <SidebarGroup data-nav-group={group.label} className="py-0.5">
                <div className="flex items-center justify-between pr-1">
                  <SidebarGroupLabel className="h-7 text-2xs font-semibold tracking-[0.04em] text-faint">{group.label}</SidebarGroupLabel>
                  <CollapsibleTrigger
                    aria-label={`Toggle ${group.label} group`}
                    className="grid size-6 place-items-center rounded-md text-faint focus-visible:outline-none transition-colors duration-150 ease-admin hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 group-data-[collapsible=icon]:hidden"
                  >
                    <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-3.5 transition-transform duration-200 ease-admin group-data-[state=closed]/collapsible:-rotate-90" />
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <SidebarGroupContent><SidebarMenu>{group.items.map(item)}</SidebarMenu></SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-1 border-t border-line-soft px-4 py-3 text-xs group-data-[collapsible=icon]:hidden">
        <span className="text-muted-foreground">{publishedVersion ? `Live storefront on version ${publishedVersion}` : "Storefront not published yet"}</span>
        <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 rounded-sm font-semibold text-primary underline-offset-4 focus-visible:outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60">
          Open storefront <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
        </a>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

const chipTone = {
  accent: "bg-accent-tint text-primary",
  unsaved: "bg-warning-bg text-warning",
  saving: "bg-info-bg text-info",
  conflict: "bg-danger-bg text-danger",
  published: "bg-success-bg text-success",
  unpublished: "bg-neutral-bg text-muted-foreground",
} as const;
/** A status chip; the tone is exposed as data-tone for tests and the dot. */
export function StatusChip({ tone, children, ...props }: { tone: keyof typeof chipTone; children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <Badge variant="secondary" data-tone={tone} {...props} className={cn("h-7 gap-1.5 rounded-full border-0 px-2.5 text-2xs font-semibold tabular-nums", chipTone[tone])}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full bg-current", tone === "saving" && "motion-safe:animate-pulse")} />
      {children}
    </Badge>
  );
}

/** The phone-width section picker that mirrors the sidebar (the sidebar itself is a sheet there). */
export function SectionPicker<T extends string>({ groups, current, disabled, onSelect }: { groups: NavGroup<T>[]; current: T; disabled: (name: T) => boolean; onSelect: (name: T) => void }) {
  return (
    <label className="min-w-0 md:hidden">
      <span className="sr-only">Admin section</span>
      <NativeSelect aria-label="Admin section" size="sm" className="max-w-[46vw] bg-card font-medium" value={current} onChange={(event) => onSelect(event.target.value as T)}>
        {groups.map((group) => group.label === null
          ? group.items.map((name) => <NativeSelectOption key={name} value={name} disabled={disabled(name)}>{name}</NativeSelectOption>)
          : (
            <NativeSelectOptGroup key={group.label} label={group.label}>
              {group.items.map((name) => <NativeSelectOption key={name} value={name} disabled={disabled(name)}>{name}</NativeSelectOption>)}
            </NativeSelectOptGroup>
          ))}
      </NativeSelect>
    </label>
  );
}

/** The signed-in staff member and their menu (open the storefront, sign out). */
export function StaffMenu({ email, role, busy, onSignOut }: { email: string; role: string; busy: boolean; onSignOut: () => void }) {
  return (
    // Non-modal: a modal menu marks the rest of the page aria-hidden while it stays focusable.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-staff-account className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 text-left focus-visible:outline-none transition-colors duration-150 ease-admin hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 data-[state=open]:bg-accent">
          <span data-avatar aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral text-2xs font-bold tracking-[0.04em] text-white ring-2 ring-card">{initials(email)}</span>
          <span className="hidden min-w-0 gap-px leading-tight 2xl:grid">
            <strong className="max-w-[22ch] truncate text-xs font-semibold text-foreground">{email}</strong>
            <span className="text-2xs text-faint">{role}</span>
          </span>
          <span className="sr-only 2xl:hidden">{email}, {role}</span>
          <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate text-xs font-semibold">{email}</span>
          <span className="text-2xs font-normal text-muted-foreground">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" strokeWidth={1.5} />Open storefront</a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={onSignOut}><LogOut aria-hidden="true" strokeWidth={1.5} />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Jump to any screen (and a few actions) by typing; opens with Cmd/Ctrl+K. */
export function CommandPalette<T extends string>({ groups, icons, disabled, onSelect, afterSelect, actions }: {
  groups: NavGroup<T>[];
  icons: Record<T, LucideIcon>;
  disabled: (name: T) => boolean;
  onSelect: (name: T) => void;
  /** Runs once the palette has closed after a screen was chosen (moves focus to that screen). */
  afterSelect?: () => void;
  actions: { label: string; run: () => void; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const navigated = useRef(false);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setOpen((value) => !value); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const run = (callback: () => void) => { setOpen(false); callback(); };
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="hidden w-48 justify-start gap-2 px-2.5 font-normal text-muted-foreground xl:inline-flex" onClick={() => setOpen(true)}>
        <Search aria-hidden="true" strokeWidth={1.5} />
        <span className="flex-1 text-left">Jump to</span>
        <kbd className="rounded-sm border border-border bg-surface px-1.5 font-sans text-2xs font-semibold text-faint">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Jump to" description="Go to an admin screen or run an action."
        onCloseAutoFocus={(event) => { if (!navigated.current) return; navigated.current = false; event.preventDefault(); afterSelect?.(); }}>
        <CommandInput placeholder="Jump to a screen or action" />
        <CommandList>
          <CommandEmpty>Nothing matches. Try a screen name such as Homepage or Media.</CommandEmpty>
          {groups.map((group) => {
            const items = group.items.filter((name) => !disabled(name));
            if (items.length === 0) return null;
            return (
              <CommandGroup key={group.label ?? "top"} heading={group.label ?? "Start"}>
                {items.map((name) => {
                  const Icon: LucideIcon = icons[name];
                  return <CommandItem key={name} value={name} onSelect={() => run(() => { navigated.current = true; onSelect(name); })}><Icon aria-hidden="true" strokeWidth={1.5} />{name}</CommandItem>;
                })}
              </CommandGroup>
            );
          })}
          <CommandGroup heading="Actions">
            {actions.filter((action) => !action.disabled).map((action) => (
              <CommandItem key={action.label} value={action.label} onSelect={() => run(action.run)}>{action.label}<CommandShortcut /></CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

export { SidebarTrigger };
