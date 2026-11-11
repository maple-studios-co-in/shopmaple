import { maxAddresses, type AccountAddress, type AccountCustomer, type AccountOverview, type OrderDetail, type OrderSummary } from "@shopmaple/contracts/account";

/**
 * Local development only: `?preview=design` shows the account pages with the frames' sample customer and no API, so the
 * layout can be reviewed without a database (as checkout's `?preview=design` does). `empty` is a new account, `sign-in`
 * the sign-in screen and `unavailable` today's page for accounts switched off. Production builds never take this path.
 */
export type AccountPreview = "design" | "empty" | "sign-in" | "unavailable";
const previews: readonly string[] = ["design", "empty", "sign-in", "unavailable"];
export function accountPreview(searchParams: Record<string, string | string[] | undefined> | undefined): AccountPreview | null {
  if (process.env.NODE_ENV === "production") return null;
  const value = searchParams?.preview;
  return typeof value === "string" && previews.includes(value) ? (value as AccountPreview) : null;
}
/** A link within the preview keeps the preview. */
export const previewHref = (path: string, preview: boolean) => (preview ? `${path}?preview=design` : path);

// The frames' customer (Figma 392:1255): Aditi in Bengaluru, a chair, three orders. The photo is the site's own.
const photo = "/media/previews/nola-accent-chair.webp";
const customer: AccountCustomer = { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" };
// Her two addresses as the saved-address frame shows them (Figma 392:1527): Home, the default, and her Studio.
export const sampleAddresses: AccountAddress[] = [
  { id: "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b", label: "Home", name: "Aditi Sharma", line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru",
    state: "29", pin: "560001", phone: "+919876543210", isDefault: true },
  { id: "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d", label: "Studio", name: "Aditi Sharma", line1: "22 Lakeview Road", line2: "Floor 2", city: "Bengaluru",
    state: "29", pin: "560038", phone: "+919876543210", isDefault: false },
];
const item = { title: "Nola Accent Chair", variant: "Natural cane · Oak finish", imageUrl: photo };
export const sampleOrders: OrderSummary[] = [
  { number: "MF-10482", placedAt: "2026-11-10T06:30:00.000Z", status: "confirmed", statusLabel: "Confirmed", itemCount: 1, totalPaise: 2640000, firstItem: item },
  { number: "MF-10316", placedAt: "2026-09-21T06:30:00.000Z", status: "delivered", statusLabel: "Delivered", itemCount: 1, totalPaise: 2640000, firstItem: item },
  { number: "MF-10207", placedAt: "2026-08-14T06:30:00.000Z", status: "cancelled", statusLabel: "Cancelled", itemCount: 1, totalPaise: 2640000, firstItem: item },
];
export const sampleOverview: AccountOverview = {
  customer,
  counts: { orders: sampleOrders.length, addresses: sampleAddresses.length },
  latestOrder: sampleOrders[0]!,
  defaultAddress: sampleAddresses[0]!,
};
export const emptyOverview: AccountOverview = {
  customer: { name: null, email: "new.customer@example.com", phone: null },
  counts: { orders: 0, addresses: 0 },
  latestOrder: null,
  defaultAddress: null,
};
export function sampleOrderDetail(number: string): OrderDetail {
  const summary = sampleOrders.find((order) => order.number === number) ?? { ...sampleOrders[0]!, number };
  return {
    ...summary,
    items: [{ title: item.title, variant: item.variant, quantity: 1, linePaise: 2490000, imageUrl: photo }],
    delivery: { name: "Aditi Sharma", line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", state: "29", pin: "560001", phone: "+91 ••••• •3210" },
    totals: { subtotalPaise: 2490000, deliveryPaise: 150000, taxPaise: 379831, totalPaise: 2640000, taxIncluded: true },
    payment: { label: "Paid online", reference: "pay_PreviewQX1a2b" },
    estimate: { from: "2026-11-24", to: "2026-11-28" },
    journey: [
      { key: "confirmed", label: "Confirmed", state: "done", at: "2026-11-10T06:35:00.000Z" },
      { key: "preparing", label: "Preparing", state: "upcoming", at: null },
      { key: "dispatched", label: "Dispatched", state: "upcoming", at: null },
      { key: "delivered", label: "Delivered", state: "upcoming", at: null },
    ],
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
/**
 * The account API's writes, answered in memory for the preview, so its forms can be tried: any code signs in except
 * 000000 (wrong), 111111 (expired) and 222222 (too many tries); any password signs in except "wrongpass1" (no match) and
 * "toomany1" (locked for now); addresses and details change until the page reloads.
 */
export function createPreviewTransport(): typeof fetch {
  let addresses = structuredClone(sampleAddresses);
  let profile = structuredClone(customer);
  return async (input, init) => {
    const path = new URL(String(input), "https://preview.invalid").pathname.replace(/^\/api\/account/, "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (path === "/sign-in/start") return json({ ok: true }, 202);
    if (path === "/sign-in/verify") {
      const refused = ({ "000000": "CODE_INVALID", "111111": "CODE_EXPIRED", "222222": "TOO_MANY_ATTEMPTS" } as Record<string, string>)[String(body.code)];
      return refused ? json({ code: refused, message: "Preview." }, 400) : json({ customer: profile });
    }
    if (path === "/sign-in/password") {
      const refused = ({ wrongpass1: "CREDENTIALS_INVALID", toomany1: "TOO_MANY_ATTEMPTS" } as Record<string, string>)[String(body.password)];
      return refused ? json({ code: refused, message: "Preview." }, 400) : json({ customer: profile });
    }
    if (path === "/sign-out") return new Response(null, { status: 204 });
    if (path === "" && method === "PATCH") {
      profile = { ...profile, ...(body as Partial<AccountCustomer>) };
      return json({ customer: profile });
    }
    const id = /^\/addresses\/([^/]+)$/.exec(path)?.[1];
    const defaultFirst = () => [...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    if (path === "/addresses" && method === "POST") {
      if (addresses.length >= maxAddresses) return json({ code: "ADDRESS_LIMIT", message: "Preview." }, 409);
      const { isDefault, ...fields } = body as Omit<AccountAddress, "id" | "isDefault"> & { isDefault?: boolean };
      const address: AccountAddress = { ...fields, id: crypto.randomUUID(), isDefault: Boolean(isDefault) || addresses.length === 0 };
      addresses = [...addresses.map((a) => (address.isDefault ? { ...a, isDefault: false } : a)), address];
      return json({ address, addresses: defaultFirst() }, 201);
    }
    if (id && method === "PATCH") {
      const found = addresses.find((a) => a.id === id);
      if (!found) return json({ code: "ADDRESS_NOT_FOUND", message: "Preview." }, 404);
      const address = { ...found, ...(body as Partial<AccountAddress>) };
      addresses = addresses.map((a) => (a.id === id ? address : body.isDefault ? { ...a, isDefault: false } : a));
      return json({ address, addresses: defaultFirst() });
    }
    if (id && method === "DELETE") {
      const removed = addresses.find((a) => a.id === id);
      addresses = addresses.filter((a) => a.id !== id);
      if (removed?.isDefault && addresses[0]) addresses[0] = { ...addresses[0], isDefault: true };
      return json({ addresses: defaultFirst() });
    }
    return json({ code: "NOT_FOUND", message: "Preview." }, 404);
  };
}
