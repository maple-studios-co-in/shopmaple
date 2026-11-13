# WhatsApp order messages

What a customer gets on WhatsApp about a store order: confirmed, dispatched, delivered and cancelled. The confirmation
was designed in Figma file `GJsFInfhys0crdNpQsbUUU` (owner, 11 Nov 2026): node 394:1456 is the message on a phone,
404:1410 its 1200 × 630 header image, and 394:1477 lists what changes per order.

**Keeri sends every one of these messages; the store only collects the buyer's consent** (owner, 13 Nov 2026). Keeri
already runs Maple's WhatsApp number through Meta's Cloud API, so the messages land in the same conversation staff
reply in. The store never calls WhatsApp.

| Part | Where |
| --- | --- |
| The tick box at checkout, "Send my order updates on WhatsApp" | `apps/web/components/store/checkout-details.tsx` |
| The consent kept with the checkout (`CheckoutAttempt.whatsappOptInAt`) and sent to Keeri with the paid order | `apps/api/src/orders/service.ts`, `workers.ts`; the field is `orderWhatsappUpdatesSchema` in `packages/contracts/src/checkout-consent.ts` |
| The switch, `WHATSAPP_ORDER_UPDATES` | `apps/api/src/commerce-composition.ts` |
| The header image for a product: `/whatsapp/order-media/<product handle>`. **Keeri links it in every confirmation, so it must stay.** | `apps/web/app/whatsapp/order-media/[handle]/route.tsx` |
| The confirmation template as submitted, and a builder that fills it for one order (`orderConfirmationWhatsApp`). The preview page uses them; Keeri has its own builder for all four templates. | `packages/contracts/src/whatsapp.ts` (`@shopmaple/contracts/whatsapp`) |
| Development preview: phone, WhatsApp Desktop/Web, and the template as submitted | `/previews/whatsapp` (`apps/web/app/previews/whatsapp/page.tsx`) |
| A Cloud API sender written before the decision (`sendOrderConfirmationWhatsApp`). **Not connected, and not to be:** Keeri sends. | `apps/api/src/orders/whatsapp.ts` |

## The buyer's consent

WhatsApp only allows a business to message a customer who agreed to hear from it there, order updates included.

- **The tick box.** With `WHATSAPP_ORDER_UPDATES=true` the checkout form shows "Send my order updates on WhatsApp" under
  the mobile number, unticked. The buyer ticks it or not; nothing else gives consent. It locks with the other details
  once the quote is in, and "Edit details" unlocks it.
- **What is kept.** `POST /api/checkout` takes `whatsappOrderUpdates: true` beside the quote's input
  (`checkoutRequestSchema`). When the quote freezes, the attempt's `whatsappOptInAt` records the moment. It is never
  part of the quote Keeri prices, so the quote request and the frozen snapshot are unchanged. The same idempotency key
  with a different tick is a changed checkout (409), as any other changed detail is.
- **What Keeri is told.** When the payment is captured, the order handed to Keeri (outbox `keeri.order.captured.v2`)
  gains one key, `whatsappUpdates`, only for a buyer who ticked:

  ```json
  "whatsappUpdates": {
    "consentedAt": "2026-11-13T09:12:00.000Z",
    "orderNumber": "MF-10482",
    "headerHandle": "nola-accent-chair",
    "estimatedDelivery": { "from": "2026-11-24", "to": "2026-11-28" }
  }
  ```

  `consentedAt` is when they ticked. `orderNumber` is Maple's number, which Keeri does not otherwise have.
  `headerHandle` is the first piece's product handle, for the confirmation's image (null if the product has none
  usable). `estimatedDelivery` is the window the buyer's order email and account show, or null when the store has no
  estimate. The key's presence is the consent: without it Keeri sends nothing. The order worker refuses to deliver a row
  whose consent or order number is not the attempt's own.
- **Without the tick, or with the switch off,** the order Keeri receives is byte for byte what it was before.

## Switching it on

`WHATSAPP_ORDER_UPDATES` is `true`, `false` or unset (off) in the API's private environment; any other value stops the
API at start-up. It needs `CHECKOUT_ENABLED=true`. `/api/checkout/options` reports it as `whatsappOrderUpdates`.

**Keeri first.** A Keeri release from before this work refuses an order that carries `whatsappUpdates` (it checks the
order's keys exactly), and a refused order waits for staff. So:

1. Release Keeri with WhatsApp order messages (Keeri's `docs/shopmaple-whatsapp-order-messages.md`). From then on it
   accepts orders with or without the key.
2. In Keeri, switch the messages on, one template at a time as Meta approves each.
3. Then set `WHATSAPP_ORDER_UPDATES=true` on the store and restart `shopmaple-api`. The tick box appears.

Either side can be released first, because the store sends nothing new until step 3. To stop collecting consent, unset
the flag and restart: the tick box goes, and orders paid from then on carry no `whatsappUpdates`, even where the buyer
had ticked before. Messages for orders Keeri already has are switched off in Keeri.

The "View order" button opens `/account/orders/<number>`, so customer accounts (`CUSTOMER_ACCOUNTS_ENABLED`) must be on.
With private order links (`ORDER_LINK_SECRET` and `WHATSAPP_ORDER_LINKS=true`, docs/store-deployment.md) the button's
variable is the order's private reference instead: `/account/orders/MF-<n>-<ref>` redirects to the order page and
`/account/orders/MF-<n>-<ref>-tracking` (the dispatched message) to its tracking page, with no sign-in. The header
picture link then carries `?variant=<slug>`, the variant bought. The approved templates need no change.

## The confirmation template

All four templates (`order_confirmation`, `order_dispatched`, `order_delivered`, `order_cancelled`), with their exact
bodies, variables and buttons, are in Keeri's `docs/shopmaple-whatsapp-order-messages.md`. The confirmation is repeated
here because the store draws its header image and previews it.

In WhatsApp Manager, open **Message templates → Create template**:

| Field | Value |
| --- | --- |
| Category | **Utility** |
| Name | `order_confirmation` |
| Language | English (`en`) |
| Header | **Media → Image.** For the sample, save `https://shop.maplefurnishers.com/whatsapp/order-media/nola` (or `http://127.0.0.1:3100/whatsapp/order-media/nola` from the local site) and upload it. |
| Body | The text below, exactly. |
| Footer | None |
| Buttons | Two **Visit website** buttons, below. |

Body (the asterisks make the first line bold in WhatsApp):

```text
*Order confirmed*

Hi {{1}}, thank you for choosing Maple.

#{{2}}
{{3}}
Amount paid: {{4}}

Estimated delivery: {{5}}
{{6}}

We’ll send tracking once dispatched.
```

Sample values for Meta's review, which are also the Figma order:

| Variable | Holds | Sample | Longest |
| --- | --- | --- | --- |
| `{{1}}` | The customer's first name | `Aditi` | 40 characters |
| `{{2}}` | Maple's order number (the template writes the `#`) | `MF-10482` | 20 |
| `{{3}}` | The pieces and quantities, on one line | `Nola Accent Chair × 1` | 120 |
| `{{4}}` | The amount paid | `₹26,400` | 24 |
| `{{5}}` | The estimated delivery window | `24–28 Nov 2026` | 32 |
| `{{6}}` | The delivery city and PIN code | `Bengaluru · 560001` | 60 |

Buttons:

1. **View order**, URL type **Dynamic**: `https://shop.maplefurnishers.com/account/orders/{{1}}`. Sample:
   `https://shop.maplefurnishers.com/account/orders/MF-10482`. The variable is the Maple order number.
2. **Contact Maple**, URL type **Static**: `https://shop.maplefurnishers.com/contact`.

To submit through the Graph API instead, `orderConfirmationTemplate("https://shop.maplefurnishers.com")` gives the body
of `POST /{whatsapp-business-account-id}/message_templates`; add the header's sample image as `example.header_handle`
from Meta's resumable upload. The preview page prints that JSON too.

Keep the body and the image free of offers. Meta files a utility template that reads as promotion under Marketing,
which is priced differently and needs marketing consent.

## What changes per order

`orderConfirmationWhatsApp(order)` fills the template. Every value is one trimmed line (WhatsApp refuses a variable with
a line break, a tab or a run of spaces) and is cut to the length above with "…":

- `{{1}}`: the first name; "there" when there is none ("Hi there, …").
- `{{3}}`: several pieces share one line, "Nola Accent Chair × 1, Oak Side Table × 2". A list too long for 120 characters
  ends with a count of the rest: "Nola Accent Chair × 1, Oak Side Table × 2 and 3 more pieces".
- `{{4}}`: rupees with Indian grouping, and paise only when there are some: "₹26,400", "₹1,23,456.50".
- `{{5}}`: "24–28 Nov 2026"; across a month "28 Nov – 2 Dec 2026"; across a year "30 Dec 2026 – 2 Jan 2027".
- `{{6}}`: "Bengaluru · 560001". A long city name is shortened, never the PIN code.
- The **View order** button's variable is the Maple order number; it opens `/account/orders/<number>`.
- The header image is `/whatsapp/order-media/<handle of the first piece>`.

The header image is a 1200 × 630 PNG drawn like Figma 404:1410: the sage panel with "MAPLE FURNISHERS", "A beautiful
choice." and "Made for your everyday." beside the product's first photo. A product without a photo keeps the sage panel
across the whole image. It holds no customer data, so it is cached for a week; an unknown product answers 404. Meta
downloads it each time a message is sent, so the store must answer at its public address.

## The store's own sender (not used)

`apps/api/src/orders/whatsapp.ts` holds `loadWhatsAppConfig` and `sendOrderConfirmationWhatsApp`, written on 11 Nov 2026
when the store was going to send the confirmation itself. Nothing calls them and no `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID` or `WHATSAPP_API_VERSION` should be set on the store: Keeri holds the WhatsApp connection.
They can be deleted once Keeri's messages have run in production.

## Known limits

- **View order** opens `/account/orders/<number>`: the order in the customer's account, after signing in (or creating
  an account) with the order's email, which works on any phone or computer. It needs customer accounts switched on. The
  guest order page (`/orders/<checkout id>`) would find the order only in the browser that paid; a link that opens the
  order without signing in would need a signed order link: the owner's call.
- The Figma phone frame sets the title and body in Maple's fonts, with the delivery lines smaller and grey. WhatsApp
  shows every body line in its own font at one size, with the title bold; the preview's WhatsApp Desktop rendition shows
  that. The desktop rendition is drawn to look like WhatsApp's light theme, not captured from it.
- The content guide (394:1477) sketches a different body ("Hi {{1}}, your Maple order {{2}} is confirmed. … With care,
  Maple Furnishers") and a "Contact support" button. The build follows the phone frame (394:1456).

## Local preview

With the local site running: `http://127.0.0.1:3100/previews/whatsapp` (development only; a production server answers
404). The header image alone: `http://127.0.0.1:3100/whatsapp/order-media/nola`.
