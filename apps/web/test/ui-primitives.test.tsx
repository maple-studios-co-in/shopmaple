import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { installUiDom, pointerDown, press } from "./support/ui-dom";

// One smoke test per primitive family in components/ui: each proves the primitive renders
// in this jsdom harness, that its overlays portal into the admin root (where the tokens
// live) rather than document.body, and that focus moves and returns the way Radix promises.
const dom = installUiDom();
const { createRoot } = await import("react-dom/client");
const { AdminRoot } = await import("../components/admin/admin-root");
const ui = {
  ...(await import("../components/ui/dialog")),
  ...(await import("../components/ui/sheet")),
  ...(await import("../components/ui/drawer")),
  ...(await import("../components/ui/dropdown-menu")),
  ...(await import("../components/ui/popover")),
  ...(await import("../components/ui/tooltip")),
  ...(await import("../components/ui/select")),
  ...(await import("../components/ui/native-select")),
  ...(await import("../components/ui/button")),
  ...(await import("../components/ui/input")),
  ...(await import("../components/ui/textarea")),
  ...(await import("../components/ui/label")),
  ...(await import("../components/ui/checkbox")),
  ...(await import("../components/ui/switch")),
  ...(await import("../components/ui/radio-group")),
  ...(await import("../components/ui/form")),
  ...(await import("../components/ui/tabs")),
  ...(await import("../components/ui/command")),
  ...(await import("../components/ui/card")),
  ...(await import("../components/ui/badge")),
  ...(await import("../components/ui/alert")),
  ...(await import("../components/ui/skeleton")),
  ...(await import("../components/ui/separator")),
  ...(await import("../components/ui/table")),
  ...(await import("../components/ui/breadcrumb")),
  ...(await import("../components/ui/scroll-area")),
  ...(await import("../components/ui/collapsible")),
  ...(await import("../components/ui/sidebar")),
};
const { toast } = await import("sonner");
const container = document.getElementById("root")!;

async function mount(node: React.ReactNode) {
  const root = createRoot(container);
  await act(async () => root.render(<AdminRoot aria-label="Store administration">{node}</AdminRoot>));
  const admin = container.querySelector<HTMLElement>(".shop-admin");
  assert.ok(admin, "The admin root renders");
  return { admin, close: async () => act(async () => root.unmount()) };
}
const byText = (root: ParentNode, selector: string, text: string) =>
  [...root.querySelectorAll<HTMLElement>(selector)].find((node) => node.textContent?.trim() === text);
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

test("overlays: a dialog opens inside the admin root, traps focus and returns it on Escape", async () => {
  const app = await mount(
    <ui.Dialog>
      <ui.DialogTrigger asChild><ui.Button>Reply</ui.Button></ui.DialogTrigger>
      <ui.DialogContent>
        <ui.DialogTitle>Reply to the enquiry</ui.DialogTitle>
        <ui.DialogDescription>Send a reply by email.</ui.DialogDescription>
        <ui.Input aria-label="Subject" />
      </ui.DialogContent>
    </ui.Dialog>,
  );
  try {
    const trigger = byText(app.admin, "button", "Reply")!;
    trigger.focus();
    await act(async () => trigger.click());
    await settle();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(dialog, "The dialog opens");
    assert.ok(dialog.closest(".shop-admin") === app.admin, "The dialog renders inside the admin root, where the tokens apply");
    assert.equal(dialog.getAttribute("aria-labelledby") && document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent, "Reply to the enquiry");
    assert.ok(dialog.contains(document.activeElement), "Focus moves into the dialog");
    await act(async () => press(document.activeElement!, "Escape"));
    await settle();
    assert.equal(document.querySelector('[role="dialog"]'), null, "Escape closes the dialog");
    assert.ok(document.activeElement === trigger, "Focus returns to the trigger");
  } finally { await app.close(); }
});

test("overlays: a sheet and a drawer open as labelled dialogs inside the admin root", async () => {
  function Overlays() {
    const [drawer, setDrawer] = useState(false);
    return (
      <>
        <ui.Sheet>
          <ui.SheetTrigger asChild><ui.Button>Edit section</ui.Button></ui.SheetTrigger>
          <ui.SheetContent>
            <ui.SheetTitle>Hero section</ui.SheetTitle>
            <ui.SheetDescription>Edit the hero.</ui.SheetDescription>
          </ui.SheetContent>
        </ui.Sheet>
        <ui.Button onClick={() => setDrawer(true)}>Filters</ui.Button>
        <ui.Drawer open={drawer} onOpenChange={setDrawer}>
          <ui.DrawerContent>
            <ui.DrawerTitle>Filters</ui.DrawerTitle>
            <ui.DrawerDescription>Narrow the list.</ui.DrawerDescription>
          </ui.DrawerContent>
        </ui.Drawer>
      </>
    );
  }
  const app = await mount(<Overlays />);
  try {
    await act(async () => byText(app.admin, "button", "Edit section")!.click());
    await settle();
    const sheet = document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
    assert.ok(sheet, "The sheet opens");
    assert.equal(sheet.getAttribute("role"), "dialog");
    assert.ok(sheet.closest(".shop-admin") === app.admin, "The sheet renders inside the admin root");
    await act(async () => press(document.activeElement!, "Escape"));
    await settle();
    assert.equal(document.querySelector('[data-slot="sheet-content"]'), null, "Escape closes the sheet");
    await act(async () => byText(app.admin, "button", "Filters")!.click());
    await settle();
    const drawer = document.querySelector<HTMLElement>('[data-slot="drawer-content"]');
    assert.ok(drawer, "The drawer opens");
    assert.equal(drawer.getAttribute("role"), "dialog");
    assert.ok(drawer.closest(".shop-admin") === app.admin, "The drawer renders inside the admin root");
  } finally { await app.close(); }
});

test("menus: a dropdown menu opens from the keyboard, moves focus to its items and runs the chosen one", async () => {
  let chosen = "";
  const app = await mount(
    <ui.DropdownMenu>
      <ui.DropdownMenuTrigger asChild><ui.Button>Account</ui.Button></ui.DropdownMenuTrigger>
      <ui.DropdownMenuContent>
        <ui.DropdownMenuLabel>priya.menon@example.test</ui.DropdownMenuLabel>
        <ui.DropdownMenuItem onSelect={() => { chosen = "store"; }}>Open storefront</ui.DropdownMenuItem>
        <ui.DropdownMenuItem onSelect={() => { chosen = "out"; }}>Sign out</ui.DropdownMenuItem>
      </ui.DropdownMenuContent>
    </ui.DropdownMenu>,
  );
  try {
    const trigger = byText(app.admin, "button", "Account")!;
    trigger.focus();
    await act(async () => press(trigger, "Enter"));
    await settle();
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    assert.ok(menu, "The menu opens on Enter");
    assert.ok(menu.closest(".shop-admin") === app.admin, "The menu renders inside the admin root");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    assert.deepEqual(items.map((item) => item.textContent), ["Open storefront", "Sign out"]);
    assert.ok(menu.contains(document.activeElement), "Focus moves into the menu");
    await act(async () => items[1]!.click());
    await settle();
    assert.equal(chosen, "out");
    assert.equal(document.querySelector('[role="menu"]'), null, "Choosing an item closes the menu");
    assert.ok(document.activeElement === trigger, "Focus returns to the trigger");
  } finally { await app.close(); }
});

test("floating: a popover opens on click and a tooltip on focus, both inside the admin root", async () => {
  const app = await mount(
    <>
      <ui.Popover>
        <ui.PopoverTrigger asChild><ui.Button>Columns</ui.Button></ui.PopoverTrigger>
        <ui.PopoverContent><ui.Label htmlFor="col-stage">Stage</ui.Label><input id="col-stage" type="checkbox" /></ui.PopoverContent>
      </ui.Popover>
      <ui.Tooltip>
        <ui.TooltipTrigger asChild><ui.Button aria-label="Dismiss">x</ui.Button></ui.TooltipTrigger>
        <ui.TooltipContent>Dismiss message</ui.TooltipContent>
      </ui.Tooltip>
    </>,
  );
  try {
    const trigger = byText(app.admin, "button", "Columns")!;
    await act(async () => trigger.click());
    await settle();
    const popover = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
    assert.ok(popover, "The popover opens");
    assert.ok(popover.closest(".shop-admin") === app.admin, "The popover renders inside the admin root");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    await act(async () => press(document.activeElement!, "Escape"));
    await settle();
    assert.equal(document.querySelector('[data-slot="popover-content"]'), null, "Escape closes the popover");
    const tip = app.admin.querySelector<HTMLElement>('button[aria-label="Dismiss"]')!;
    await act(async () => { tip.focus(); tip.dispatchEvent(new dom.window.FocusEvent("focus", { bubbles: false })); });
    await settle();
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    assert.ok(tooltip, "Focus shows the tooltip");
    assert.equal(tooltip.textContent, "Dismiss message");
    assert.ok(tooltip.closest(".shop-admin") === app.admin, "The tooltip renders inside the admin root");
  } finally { await app.close(); }
});

test("selects: the Radix select opens from the keyboard and picks a value; the native select stays a real select", async () => {
  function Selects() {
    const [stage, setStage] = useState("new");
    const [page, setPage] = useState("story");
    return (
      <>
        <ui.Select value={stage} onValueChange={setStage}>
          <ui.SelectTrigger aria-label="Stage"><ui.SelectValue /></ui.SelectTrigger>
          <ui.SelectContent>
            <ui.SelectItem value="new">New</ui.SelectItem>
            <ui.SelectItem value="quoted">Quoted</ui.SelectItem>
          </ui.SelectContent>
        </ui.Select>
        <p data-stage>{stage}</p>
        <ui.NativeSelect aria-label="Existing page" value={page} onChange={(event) => setPage(event.target.value)}>
          <ui.NativeSelectOption value="story">Our Story</ui.NativeSelectOption>
          <ui.NativeSelectOption value="contact">Contact</ui.NativeSelectOption>
        </ui.NativeSelect>
        <p data-page>{page}</p>
      </>
    );
  }
  const app = await mount(<Selects />);
  try {
    const trigger = app.admin.querySelector<HTMLElement>('[role="combobox"][aria-label="Stage"]')!;
    assert.equal(trigger.textContent, "New");
    trigger.focus();
    await act(async () => press(trigger, "Enter"));
    await settle();
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    assert.ok(listbox, "The listbox opens on Enter");
    assert.ok(listbox.closest(".shop-admin") === app.admin, "The listbox renders inside the admin root");
    await act(async () => byText(listbox, '[role="option"]', "Quoted")!.click());
    await settle();
    assert.equal(app.admin.querySelector("[data-stage]")?.textContent, "quoted");
    assert.ok(document.activeElement === trigger, "Focus returns to the trigger");
    const native = app.admin.querySelector<HTMLSelectElement>('select[aria-label="Existing page"]')!;
    await act(async () => { native.value = "contact"; native.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(app.admin.querySelector("[data-page]")?.textContent, "contact");
  } finally { await app.close(); }
});

test("forms: a zod-validated form labels its controls and reports errors on the field", async () => {
  const schema = z.object({ title: z.string().min(1, "Enter a title"), body: z.string().max(10, "Keep it under 10 characters"), visible: z.boolean(), featured: z.boolean(), layout: z.enum(["grid", "rail"]) });
  let saved: z.infer<typeof schema> | null = null;
  function Editor() {
    const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { title: "", body: "", visible: true, featured: false, layout: "grid" } });
    return (
      <ui.Form {...form}>
        <form onSubmit={form.handleSubmit((values) => { saved = values; })}>
          <ui.FormField control={form.control} name="title" render={({ field }) => (
            <ui.FormItem><ui.FormLabel>Title</ui.FormLabel><ui.FormControl><ui.Input {...field} /></ui.FormControl><ui.FormMessage /></ui.FormItem>
          )} />
          <ui.FormField control={form.control} name="body" render={({ field }) => (
            <ui.FormItem><ui.FormLabel>Body</ui.FormLabel><ui.FormControl><ui.Textarea {...field} /></ui.FormControl><ui.FormMessage /></ui.FormItem>
          )} />
          <ui.FormField control={form.control} name="visible" render={({ field }) => (
            <ui.FormItem><ui.FormControl><ui.Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} /></ui.FormControl><ui.FormLabel>Visible</ui.FormLabel></ui.FormItem>
          )} />
          <ui.FormField control={form.control} name="featured" render={({ field }) => (
            <ui.FormItem><ui.FormControl><ui.Switch checked={field.value} onCheckedChange={field.onChange} /></ui.FormControl><ui.FormLabel>Featured</ui.FormLabel></ui.FormItem>
          )} />
          <ui.FormField control={form.control} name="layout" render={({ field }) => (
            <ui.FormItem><ui.FormLabel>Layout</ui.FormLabel><ui.FormControl>
              <ui.RadioGroup value={field.value} onValueChange={field.onChange}>
                <ui.RadioGroupItem value="grid" aria-label="Grid" />
                <ui.RadioGroupItem value="rail" aria-label="Rail" />
              </ui.RadioGroup>
            </ui.FormControl></ui.FormItem>
          )} />
          <ui.Button type="submit">Save</ui.Button>
        </form>
      </ui.Form>
    );
  }
  const app = await mount(<Editor />);
  try {
    const labelled = (text: string) => {
      const label = byText(app.admin, "label", text)!;
      return document.getElementById(label.getAttribute("for")!)!;
    };
    const title = labelled("Title") as HTMLInputElement;
    assert.equal(title.tagName, "INPUT", "The Title label points at its input");
    await act(async () => byText(app.admin, "button", "Save")!.click());
    await settle();
    assert.equal(saved, null, "An invalid form is not submitted");
    assert.equal(title.getAttribute("aria-invalid"), "true");
    const message = document.getElementById(title.getAttribute("aria-describedby")!.split(" ").at(-1)!);
    assert.equal(message?.textContent, "Enter a title", "The error is announced through the field's description");
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(title, "Sofas"); title.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    const visible = labelled("Visible");
    assert.equal(visible.getAttribute("role"), "checkbox");
    await act(async () => visible.click());
    assert.equal(visible.getAttribute("aria-checked"), "false");
    const featured = labelled("Featured");
    assert.equal(featured.getAttribute("role"), "switch");
    await act(async () => featured.click());
    assert.equal(featured.getAttribute("aria-checked"), "true");
    const rail = app.admin.querySelector<HTMLElement>('[role="radio"][aria-label="Rail"]')!;
    await act(async () => rail.click());
    assert.equal(rail.getAttribute("aria-checked"), "true");
    await act(async () => byText(app.admin, "button", "Save")!.click());
    await settle();
    assert.deepEqual(saved, { title: "Sofas", body: "", visible: false, featured: true, layout: "rail" });
  } finally { await app.close(); }
});

test("navigation: tabs move with the arrow keys and the command palette filters and runs a match", async () => {
  let ran = "";
  const app = await mount(
    <>
      <ui.Tabs defaultValue="board">
        <ui.TabsList aria-label="Enquiry views">
          <ui.TabsTrigger value="board">Board</ui.TabsTrigger>
          <ui.TabsTrigger value="list">List</ui.TabsTrigger>
        </ui.TabsList>
        <ui.TabsContent value="board">Board view</ui.TabsContent>
        <ui.TabsContent value="list">List view</ui.TabsContent>
      </ui.Tabs>
      <ui.Command label="Jump to">
        <ui.CommandInput placeholder="Jump to a screen" />
        <ui.CommandList>
          <ui.CommandEmpty>No screen found.</ui.CommandEmpty>
          <ui.CommandGroup heading="Screens">
            <ui.CommandItem onSelect={() => { ran = "Homepage"; }}>Homepage</ui.CommandItem>
            <ui.CommandItem onSelect={() => { ran = "Media"; }}>Media</ui.CommandItem>
          </ui.CommandGroup>
        </ui.CommandList>
      </ui.Command>
    </>,
  );
  try {
    const board = byText(app.admin, '[role="tab"]', "Board")!;
    board.focus();
    await act(async () => press(board, "ArrowRight"));
    await settle();
    const list = byText(app.admin, '[role="tab"]', "List")!;
    assert.ok(document.activeElement === list, "ArrowRight moves focus to the next tab");
    assert.equal(list.getAttribute("aria-selected"), "true", "Focusing a tab selects it");
    assert.equal(app.admin.querySelector('[role="tabpanel"][data-state="active"]')?.textContent, "List view");
    const input = app.admin.querySelector<HTMLInputElement>('input[placeholder="Jump to a screen"]')!;
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "med"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    await settle();
    const visible = [...app.admin.querySelectorAll<HTMLElement>('[role="option"]')].map((item) => item.textContent);
    assert.deepEqual(visible, ["Media"], "Typing filters the screens");
    await act(async () => press(input, "Enter"));
    assert.equal(ran, "Media", "Enter runs the highlighted match");
  } finally { await app.close(); }
});

test("layout: the sidebar collapses from its trigger and the keyboard shortcut, and a collapsible group toggles", async () => {
  const app = await mount(
    <ui.SidebarProvider>
      <ui.Sidebar collapsible="icon">
        <ui.SidebarContent>
          <ui.Collapsible defaultOpen>
            <ui.SidebarGroup>
              <ui.CollapsibleTrigger asChild><ui.SidebarGroupLabel asChild><button type="button">Storefront</button></ui.SidebarGroupLabel></ui.CollapsibleTrigger>
              <ui.CollapsibleContent>
                <ui.SidebarMenu><ui.SidebarMenuItem><ui.SidebarMenuButton isActive>Homepage</ui.SidebarMenuButton></ui.SidebarMenuItem></ui.SidebarMenu>
              </ui.CollapsibleContent>
            </ui.SidebarGroup>
          </ui.Collapsible>
        </ui.SidebarContent>
      </ui.Sidebar>
      <ui.SidebarInset><ui.SidebarTrigger /></ui.SidebarInset>
    </ui.SidebarProvider>,
  );
  try {
    const sidebar = () => app.admin.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    assert.equal(sidebar().dataset.state, "expanded");
    const trigger = app.admin.querySelector<HTMLButtonElement>('[data-slot="sidebar-trigger"]')!;
    assert.equal(trigger.textContent, "Toggle Sidebar", "The trigger has a spoken name");
    await act(async () => trigger.click());
    assert.equal(sidebar().dataset.state, "collapsed");
    await act(async () => press(document.body, "b", { ctrlKey: true }));
    assert.equal(sidebar().dataset.state, "expanded", "Ctrl+B toggles the sidebar");
    const group = byText(app.admin, "button", "Storefront")!;
    assert.equal(group.getAttribute("aria-expanded"), "true");
    await act(async () => group.click());
    assert.equal(group.getAttribute("aria-expanded"), "false");
    assert.equal(byText(app.admin, "button", "Homepage"), undefined, "A closed group hides its items");
  } finally { await app.close(); }
});

test("display: card, badge, alert, skeleton, separator, table, breadcrumb and scroll area render their roles", async () => {
  const app = await mount(
    <>
      <ui.Breadcrumb><ui.BreadcrumbList><ui.BreadcrumbItem><ui.BreadcrumbLink href="/admin">Admin</ui.BreadcrumbLink></ui.BreadcrumbItem><ui.BreadcrumbSeparator /><ui.BreadcrumbItem><ui.BreadcrumbPage>Media</ui.BreadcrumbPage></ui.BreadcrumbItem></ui.BreadcrumbList></ui.Breadcrumb>
      <ui.Card><ui.CardHeader><ui.CardTitle>Homepage sections</ui.CardTitle><ui.CardDescription>visible of 12</ui.CardDescription></ui.CardHeader><ui.CardContent>9</ui.CardContent></ui.Card>
      <ui.Badge variant="secondary">Draft</ui.Badge>
      <ui.Alert variant="destructive"><ui.AlertTitle>Save failed</ui.AlertTitle><ui.AlertDescription>Try again.</ui.AlertDescription></ui.Alert>
      <ui.Skeleton className="h-4 w-20" />
      <ui.Separator decorative={false} />
      <ui.ScrollArea className="h-20"><p>Long list</p></ui.ScrollArea>
      <ui.Table><ui.TableHeader><ui.TableRow><ui.TableHead>Name</ui.TableHead></ui.TableRow></ui.TableHeader><ui.TableBody><ui.TableRow><ui.TableCell>Asha</ui.TableCell></ui.TableRow></ui.TableBody></ui.Table>
    </>,
  );
  try {
    assert.equal(app.admin.querySelector('nav[aria-label="breadcrumb"] [aria-current="page"]')?.textContent, "Media");
    assert.equal(app.admin.querySelector('[data-slot="card-title"]')?.textContent, "Homepage sections");
    assert.equal(app.admin.querySelector('[data-slot="badge"]')?.textContent, "Draft");
    assert.match(app.admin.querySelector('[role="alert"]')?.textContent ?? "", /Save failed/);
    assert.ok(app.admin.querySelector('[data-slot="skeleton"]'));
    assert.equal(app.admin.querySelector('[data-slot="separator"]')?.getAttribute("role"), "separator");
    assert.match(app.admin.querySelector('[data-slot="scroll-area"]')?.textContent ?? "", /Long list/);
    assert.equal(app.admin.querySelector("table th")?.textContent, "Name");
    assert.equal(app.admin.querySelector("table td")?.textContent, "Asha");
  } finally { await app.close(); }
});

test("feedback: a toast renders in the admin root's toaster", async () => {
  const app = await mount(<p>Editor</p>);
  try {
    await act(async () => { toast.success("Draft saved"); });
    await settle();
    const toasts = app.admin.querySelector<HTMLElement>("section[aria-label^='Notifications']");
    assert.ok(toasts, "The toaster renders inside the admin root");
    assert.match(toasts.textContent ?? "", /Draft saved/);
  } finally { await app.close(); }
});
