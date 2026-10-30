import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useState } from "react";
import { installUiDom, press } from "./support/ui-dom";

// One smoke test per primitive family in components/ui: each proves the primitive renders
// in this jsdom harness, that its overlays portal into the admin root (where the tokens
// live) rather than document.body, and that focus moves and returns the way Radix promises.
const dom = installUiDom();
const { createRoot } = await import("react-dom/client");
const { AdminRoot } = await import("../components/admin/admin-root");
const ui = {
  ...(await import("../components/ui/dialog")),
  ...(await import("../components/ui/sheet")),
  ...(await import("../components/ui/dropdown-menu")),
  ...(await import("../components/ui/tooltip")),
  ...(await import("../components/ui/native-select")),
  ...(await import("../components/ui/native-checkbox")),
  ...(await import("../components/ui/button")),
  ...(await import("../components/ui/input")),
  ...(await import("../components/ui/textarea")),
  ...(await import("../components/ui/tabs")),
  ...(await import("../components/ui/command")),
  ...(await import("../components/ui/card")),
  ...(await import("../components/ui/badge")),
  ...(await import("../components/ui/skeleton")),
  ...(await import("../components/ui/separator")),
  ...(await import("../components/ui/table")),
  ...(await import("../components/ui/collapsible")),
  ...(await import("../components/ui/sidebar")),
};
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

test("overlays: a sheet opens as a labelled dialog inside the admin root and closes on Escape", async () => {
  const app = await mount(
    <ui.Sheet>
      <ui.SheetTrigger asChild><ui.Button>Edit section</ui.Button></ui.SheetTrigger>
      <ui.SheetContent>
        <ui.SheetTitle>Hero section</ui.SheetTitle>
        <ui.SheetDescription>Edit the hero.</ui.SheetDescription>
      </ui.SheetContent>
    </ui.Sheet>,
  );
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

test("floating: a tooltip opens on focus inside the admin root", async () => {
  const app = await mount(
    <ui.Tooltip>
      <ui.TooltipTrigger asChild><ui.Button aria-label="Dismiss">x</ui.Button></ui.TooltipTrigger>
      <ui.TooltipContent>Dismiss message</ui.TooltipContent>
    </ui.Tooltip>,
  );
  try {
    const tip = app.admin.querySelector<HTMLElement>('button[aria-label="Dismiss"]')!;
    await act(async () => { tip.focus(); tip.dispatchEvent(new dom.window.FocusEvent("focus", { bubbles: false })); });
    await settle();
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    assert.ok(tooltip, "Focus shows the tooltip");
    assert.equal(tooltip.textContent, "Dismiss message");
    assert.ok(tooltip.closest(".shop-admin") === app.admin, "The tooltip renders inside the admin root");
  } finally { await app.close(); }
});
test("controls: the native select, checkbox, input and textarea keep real form semantics", async () => {
  function Controls() {
    const [page, setPage] = useState("story");
    const [shown, setShown] = useState(true);
    const [title, setTitle] = useState("");
    return (
      <>
        <ui.NativeSelect aria-label="Existing page" value={page} onChange={(event) => setPage(event.target.value)}>
          <ui.NativeSelectOption value="story">Our Story</ui.NativeSelectOption>
          <ui.NativeSelectOption value="contact">Contact</ui.NativeSelectOption>
        </ui.NativeSelect>
        <label><ui.NativeCheckbox checked={shown} onChange={(event) => setShown(event.target.checked)} />Show hero</label>
        <ui.Input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <ui.Textarea aria-label="Body" defaultValue="Keep dry." />
        <p data-state-out>{`${page}|${shown}|${title}`}</p>
      </>
    );
  }
  const app = await mount(<Controls />);
  try {
    const native = app.admin.querySelector<HTMLSelectElement>('select[aria-label="Existing page"]')!;
    await act(async () => { native.value = "contact"; native.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    const box = app.admin.querySelector<HTMLInputElement>('label input[type="checkbox"]')!;
    assert.equal(box.checked, true);
    await act(async () => box.click());
    const input = app.admin.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "Sofas"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    assert.equal(app.admin.querySelector("[data-state-out]")?.textContent, "contact|false|Sofas");
    assert.equal(app.admin.querySelector("textarea")?.value, "Keep dry.");
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

test("display: card, badge, skeleton, separator and table render their roles", async () => {
  const app = await mount(
    <>
      <ui.Card><ui.CardHeader><ui.CardTitle>Homepage sections</ui.CardTitle><ui.CardDescription>visible of 12</ui.CardDescription></ui.CardHeader><ui.CardContent>9</ui.CardContent></ui.Card>
      <ui.Badge variant="secondary">Draft</ui.Badge>
      <ui.Skeleton className="h-4 w-20" />
      <ui.Separator decorative={false} />
      <ui.Table><ui.TableHeader><ui.TableRow><ui.TableHead>Name</ui.TableHead></ui.TableRow></ui.TableHeader><ui.TableBody><ui.TableRow><ui.TableCell>Asha</ui.TableCell></ui.TableRow></ui.TableBody></ui.Table>
    </>,
  );
  try {
    assert.equal(app.admin.querySelector('[data-slot="card-title"]')?.textContent, "Homepage sections");
    assert.equal(app.admin.querySelector('[data-slot="badge"]')?.textContent, "Draft");
    assert.ok(app.admin.querySelector('[data-slot="skeleton"]'));
    assert.equal(app.admin.querySelector('[data-slot="separator"]')?.getAttribute("role"), "separator");
    assert.equal(app.admin.querySelector("table th")?.textContent, "Name");
    assert.equal(app.admin.querySelector("table td")?.textContent, "Asha");
  } finally { await app.close(); }
});
