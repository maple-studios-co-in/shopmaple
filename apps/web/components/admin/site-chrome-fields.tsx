"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ChromeLink, ChromeNavigationItem, FooterContent, SiteChrome } from "@shopmaple/contracts";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Field } from "./field";
import {
  ActionButton, CheckField, DisclosureSummary, EditableList, FieldGrid, PanelHeader, Prose, SectionHeading, SelectField, TextFields, ToggleRows,
  focusRing, stackCard, textFields, usePendingFocus, type EditableListProps,
} from "./kit";

const newId = () => `chrome-${crypto.randomUUID()}`;
const newLink = (): ChromeLink => ({ id: newId(), label: "New link", href: "/collections/all", enabled: true });
const lower = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const nestedCard = cn(stackCard, "border-line-soft bg-surface shadow-none");
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <CheckField label={label} aria-label={label} checked={checked} onChange={event => onChange(event.currentTarget.checked)} />;
}

/** A titled editable list; rows take focus themselves so moves and removals leave keyboard users on a surviving row. */
function Rows<T>({ title, nested = false, ...props }: EditableListProps<T> & { title: string; nested?: boolean }) {
  const { items, create, min = 0, max = 99, identity } = props;
  const count = create ? `${items.length} of ${max}. ${min > 0 ? `Keep at least ${min}.` : "All entries may be removed or hidden."}` : undefined;
  return <section aria-label={title} className="grid min-w-0 gap-3">
    <SectionHeading as={nested ? "h4" : "h3"} className="mt-0 mb-0" description={count}>{title}</SectionHeading>
    <EditableList {...props} rowClassName={nested ? nestedCard : stackCard} rowProps={item => ({ "data-chrome-row": identity(item), tabIndex: -1 })} />
  </section>;
}
function LinkFields<T extends ChromeLink>({ link, name, onChange }: { link: T; name: string; onChange: (value: T) => void }) {
  return <FieldGrid>
    {textFields<ChromeLink>(link, [["label", `${name} label`, 120], ["href", `${name} destination`, 300]], next => onChange(next as T))}
    <Field label={`${name} enquiry subject`} value={link.enquirySubject ?? ""} maxLength={160}
      onChange={subject => { const { enquirySubject: _, ...rest } = link; onChange((subject ? { ...link, enquirySubject: subject } : rest) as T); }} />
    {"cta" in link && <Field label={`${name} call to action`} value={String(link.cta)} maxLength={80} onChange={cta => onChange({ ...link, cta })} />}
    <Toggle label={`Show ${lower(name)}`} checked={link.enabled} onChange={enabled => onChange({ ...link, enabled })} />
    {"parent" in link && <Toggle label={`${name} parent style`} checked={Boolean(link.parent)} onChange={parent => onChange({ ...link, parent })} />}
  </FieldGrid>;
}
type LinksProps<T> = { title: string; name: string; items: T[]; onChange: (items: T[]) => void; max: number; min?: number; create: () => T; nested?: boolean };
function Links<T extends ChromeLink>({ name, ...props }: LinksProps<T>) {
  return <Rows {...props} name={name} identity={item => item.id}
    render={(link, index, update) => <LinkFields link={link} name={`${name} ${index + 1}`} onChange={update} />} />;
}
function Submenu({ name, item, onChange }: { name: string; item: ChromeNavigationItem; onChange: (value: ChromeNavigationItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  return <details open={expanded} className="min-w-0 rounded-md border border-line-soft bg-surface">
    <DisclosureSummary className="rounded-md px-3 py-2.5" onClick={event => { event.preventDefault(); setExpanded(!expanded); }}>
      {name} submenu ({item.columns.length} columns)
    </DisclosureSummary>
    {expanded && <div className="border-t border-line-soft p-3 sm:p-4">
      <Rows nested title={`${name} columns`} name={`${name} column`} items={item.columns} max={4} identity={column => column.id}
        onChange={columns => onChange({ ...item, columns })} create={() => ({ id: newId(), links: [{ ...newLink(), parent: false }] })}
        render={(column, columnIndex, updateColumn) => {
          const label = `${name} column ${columnIndex + 1}`;
          return <>
            <Toggle label={`Show ${lower(label)}`} checked={column.links.some(link => link.enabled)}
              onChange={enabled => updateColumn({ ...column, links: column.links.map(link => ({ ...link, enabled })) })} />
            <Prose className="-mt-2 text-xs">Showing or hiding a column changes all its links.</Prose>
            <Links nested title={`${label} links`} name={`${label} link`} items={column.links} max={12} min={1}
              create={() => ({ ...newLink(), parent: false })} onChange={links => updateColumn({ ...column, links })} />
          </>;
        }} />
    </div>}
  </details>;
}
function NavigationFields({ items, onChange }: { items: ChromeNavigationItem[]; onChange: (items: ChromeNavigationItem[]) => void }) {
  return <Rows title="Main navigation" name="Navigation item" items={items} onChange={onChange} min={1} max={8} identity={item => item.id}
    create={() => ({ id: newId(), label: "New navigation", href: "/collections/all", enabled: true, feature: "none" as const, columns: [] })}
    render={(item, index, update) => {
      const name = `Navigation item ${index + 1}`;
      return <>
        <FieldGrid>
          {textFields(item, [["label", `${name} label`, 120], ["href", `${name} destination`, 300]], update)}
          <SelectField label={`${name} feature preset`} value={item.feature}
            onChange={event => update({ ...item, feature: event.target.value as ChromeNavigationItem["feature"] })}>
            <NativeSelectOption value="none">No featured artwork</NativeSelectOption>
            <NativeSelectOption value="living">Living room artwork</NativeSelectOption>
            <NativeSelectOption value="bedroom">Bedroom artwork</NativeSelectOption>
          </SelectField>
          <Toggle label={`Show ${lower(name)}`} checked={item.enabled} onChange={enabled => update({ ...item, enabled })} />
        </FieldGrid>
        <Submenu name={name} item={item} onChange={update} />
      </>;
    }} />;
}
function FooterLayout<K extends string>({ title, name, items, onChange }: {
  title: string; name: string; items: { key: K; enabled: boolean }[]; onChange: (items: { key: K; enabled: boolean }[]) => void;
}) {
  const rows = usePendingFocus<K>(items);
  return <section aria-label={title} className="grid min-w-0 content-start gap-3">
    <SectionHeading className="mt-0 mb-0">{title}</SectionHeading>
    <ToggleRows items={items} name={item => `${name} ${item.key}`} label={item => titleCase(item.key)} onChange={onChange}
      onMove={(next, moved) => { rows.focusAfter(moved.key); onChange(next); }}
      rowProps={item => ({ tabIndex: -1, "aria-label": `${name} ${item.key}`, ref: rows.track(item.key) })} />
  </section>;
}
const footerTextFields = [
  ["shopHeading", "Shop heading", 160], ["helpHeading", "Help heading", 160], ["careHeading", "Customer care heading", 160],
  ["contactHeading", "Contact heading", 160], ["bulkHeading", "Bulk contact heading", 160], ["serviceHeading", "Service contact heading", 160],
  ["findUsHeading", "Find us heading", 160], ["customerPhone", "Customer phone", 16], ["customerPhoneLabel", "Customer phone label", 60],
  ["customerEmail", "Customer email", 254], ["bulkPhone", "Bulk phone", 16], ["bulkPhoneLabel", "Bulk phone label", 60],
  ["bulkEmail", "Bulk email", 254], ["copyrightName", "Copyright name", 160],
] as const;
function FooterFields({ value, onChange }: { value: FooterContent; onChange: (value: FooterContent) => void }) {
  const set = (patch: Partial<FooterContent>) => onChange({ ...value, ...patch });
  return <div className="grid gap-8">
    <div className="grid gap-6 lg:grid-cols-2">
      <FooterLayout title="Footer columns" name="footer" items={value.columns} onChange={columns => set({ columns })} />
      <FooterLayout title="Footer contact columns" name="footer contact" items={value.contactColumns} onChange={contactColumns => set({ contactColumns })} />
    </div>
    <div>
      <SectionHeading className="mt-0"
        description="Phone numbers use + and 8 to 15 digits. Address: 1 to 4 nonblank lines, up to 160 characters per line. Leave a social profile blank to hide it.">
        Headings and contact details
      </SectionHeading>
      <FieldGrid>
        {textFields(value, footerTextFields, onChange)}
        <Field label="Instagram profile" value={value.instagram ?? ""} maxLength={300} onChange={text => set({ instagram: text || null })} />
        <Field label="LinkedIn company profile" value={value.linkedin ?? ""} maxLength={300} onChange={text => set({ linkedin: text || null })} />
        <Field label="Address lines" value={value.addressLines.join("\n")} multiline maxLength={643} onChange={text => set({ addressLines: text.split("\n") })} />
      </FieldGrid>
    </div>
    <Links title="Footer shop links" name="Footer shop link" items={value.shopLinks} max={12} create={newLink} onChange={shopLinks => set({ shopLinks })} />
    <Links title="Footer help links" name="Footer help link" items={value.helpLinks} max={12} create={newLink} onChange={helpLinks => set({ helpLinks })} />
    <Links title="Footer policy links" name="Footer policy link" items={value.policyLinks} max={8} create={newLink} onChange={policyLinks => set({ policyLinks })} />
  </div>;
}
const sections = [["announcement", "Announcement & WhatsApp"], ["header", "Header links"], ["navigation", "Main navigation"], ["footer", "Footer"]] as const;
type Section = (typeof sections)[number][0];
export function SiteChromeFields({ value, onChange }: { value?: SiteChrome; onChange: (value: SiteChrome | undefined) => void }) {
  const current = value ?? resolveSiteChrome(), focus = usePendingFocus(value);
  const [section, setSection] = useState<Section>("announcement");
  function update(patch: Partial<SiteChrome>) { onChange({ ...current, ...patch }); }
  const { announcement, whatsapp } = current;
  return <section aria-label="Navigation and footer controls">
    <PanelHeader
      // The title is focusable so restoring the original moves focus back to the top of the screen.
      title={<span ref={focus.track("heading")} tabIndex={-1} className={cn("rounded-sm", focusRing)}>Navigation &amp; footer</span>}
      description="Edit storefront links and contact information. Save a draft, then publish when ready. Product availability and prices remain managed by Keeri."
      actions={<ActionButton icon={RotateCcw} disabled={value === undefined}
        onClick={() => { focus.focusAfter("heading"); onChange(undefined); }}>Restore original navigation &amp; footer</ActionButton>}
    />
    <Prose className="-mt-3 mb-6 text-xs">
      Destinations must be local storefront paths (for example /collections/all or /pages/contact). Enquiry subjects are optional and only work with
      /pages/contact. Labels: up to 120 characters; enquiry subjects: up to 160.
    </Prose>
    <Tabs value={section} onValueChange={next => setSection(next as Section)} className="gap-6">
      <TabsList aria-label="Navigation & footer section" className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
        {/* Radix activates tabs on mousedown and focus; a plain click selects too. */}
        {sections.map(([key, label]) => <TabsTrigger key={key} value={key} className="flex-none px-3" onClick={() => setSection(key)}>{label}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="announcement" className="grid gap-8">
        <div>
          <SectionHeading className="mt-0">Announcement</SectionHeading>
          <TextFields value={announcement} onChange={announcement => update({ announcement })} fields={[
            ["text", "Announcement text", 200], ["href", "Announcement destination", 300],
            <Toggle key="show" label="Show announcement" checked={announcement.enabled} onChange={enabled => update({ announcement: { ...announcement, enabled } })} />,
          ]} />
        </div>
        <div>
          <SectionHeading className="mt-0" description="Phone numbers use + and 8 to 15 digits.">WhatsApp</SectionHeading>
          <TextFields value={whatsapp} onChange={whatsapp => update({ whatsapp })} fields={[
            ["phone", "WhatsApp phone", 16], ["label", "WhatsApp label", 120],
            <Toggle key="show" label="Show WhatsApp" checked={whatsapp.enabled} onChange={enabled => update({ whatsapp: { ...whatsapp, enabled } })} />,
          ]} />
        </div>
      </TabsContent>
      <TabsContent value="header" className="grid gap-8">
        <Links title="Utility links" name="Utility link" items={current.utilityLinks} max={6} create={newLink} onChange={utilityLinks => update({ utilityLinks })} />
        <Links title="Desktop discovery" name="Desktop discovery link" items={current.desktopDiscovery} max={6}
          create={() => ({ ...newLink(), cta: "View all" })} onChange={desktopDiscovery => update({ desktopDiscovery })} />
        <Links title="Mobile quick links" name="Mobile quick link" items={current.mobileQuickLinks} max={8} create={newLink}
          onChange={mobileQuickLinks => update({ mobileQuickLinks })} />
      </TabsContent>
      <TabsContent value="navigation"><NavigationFields items={current.navigation} onChange={navigation => update({ navigation })} /></TabsContent>
      <TabsContent value="footer"><FooterFields value={current.footer} onChange={footer => update({ footer })} /></TabsContent>
    </Tabs>
  </section>;
}
