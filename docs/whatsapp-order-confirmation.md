# WhatsApp order confirmation

The message a customer gets on WhatsApp when Maple confirms their order (owner, 11 Nov 2026). Designed in Figma file
`GJsFInfhys0crdNpQsbUUU`: node 394:1456 is the message on a phone, 404:1410 its 1200 × 630 header image, and 394:1477
lists what changes per order.

**Status: built, switched off.** Nothing sends WhatsApp messages yet. Sending needs three things that don't exist yet:
the owner's WhatsApp Business account on Meta's Cloud API, the approved template below, and each customer's opt-in.

| Part | Where |
| --- | --- |
| The template as submitted, and the builder that fills it for one order (`orderConfirmationWhatsApp`) | `packages/contracts/src/whatsapp.ts` (`@shopmaple/contracts/whatsapp`) |
| Settings (`loadWhatsAppConfig`) and the Cloud API sender (`sendOrderConfirmationWhatsApp`), not wired in | `apps/api/src/orders/whatsapp.ts` |
| The header image for a product: `/whatsapp/order-media/<product handle>` | `apps/web/app/whatsapp/order-media/[handle]/route.tsx` |
| Development preview: phone, WhatsApp Desktop/Web, and the template as submitted | `/previews/whatsapp` (`apps/web/app/previews/whatsapp/page.tsx`) |

## The template to submit

In WhatsApp Manager, open **Message templates → Create template**:

| Field | Value |
| --- | --- |
| Category | **Utility** |
| Name | `order_confirmation` |
| Language | English (`en`) |
| Header | **Media → Image.** For the sample, save `https://store.maplefurnishers.com/whatsapp/order-media/nola` (or `http://127.0.0.1:3100/whatsapp/order-media/nola` from the local site) and upload it. |
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

1. **View order**, URL type **Dynamic**: `https://store.maplefurnishers.com/account/orders/{{1}}`. Sample:
   `https://store.maplefurnishers.com/account/orders/MF-10482`. The variable is the Maple order number.
2. **Contact Maple**, URL type **Static**: `https://store.maplefurnishers.com/contact`.

To submit through the Graph API instead, `orderConfirmationTemplate("https://store.maplefurnishers.com")` gives the body
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

## Settings

On the API host, privately (the shared `store.env`), never in the repository:

| Variable | Value |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | A permanent System User access token with the `whatsapp_business_messaging` permission (Meta Business Settings → Users → System users). Secret. |
| `WHATSAPP_PHONE_NUMBER_ID` | The phone number's **ID** from WhatsApp Manager → API setup, not the phone number itself. |
| `WHATSAPP_API_VERSION` | The Graph API version to call, as Meta's app dashboard shows it, e.g. `v23.0`. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Optional. The approved template's language code: `en` unless it was approved under another, e.g. `en_US`. |

With none of the first three set, WhatsApp is off (`loadWhatsAppConfig` returns null). With only some set, or one
malformed, it throws an error naming the setting; errors and logs never show a value.

## The customer's opt-in (not built: the owner's decision)

WhatsApp only allows a business to message a customer who has agreed to hear from it on WhatsApp, order updates
included. Checkout asks for a phone number but has no WhatsApp consent yet. It needs either a tick box beside the phone
number ("Send my order updates on WhatsApp", unticked by default) or a consent line, stored with the checkout so the order
worker can see it. The wording, the default and where it sits are the owner's choice. Without a recorded opt-in, nothing
may be sent.

## Switching it on

1. Set up the WhatsApp Business account on the Cloud API: a verified Meta business, a registered phone number and an
   approved display name.
2. Submit the template above and wait for it to show as **Active**.
3. Build the checkout opt-in the owner chooses, stored with each checkout.
4. Set the `WHATSAPP_*` settings on the API host.
5. Wire the sender into the order worker (`apps/api/src/orders/notifications.ts`):
   - a notification kind such as `customer_whatsapp_confirmed`, recorded once per confirmed order that has the opt-in, as
     the email kinds are, so each order is sent at most once;
   - the message from `orderConfirmationWhatsApp`, filled from the order's quote snapshot: the first word of the
     customer's name, the pieces, the amount paid, the delivery estimate, the shipping city and PIN code, the checkout id,
     and the first piece's handle for the image;
   - outcomes: `accepted` is sent (keep Meta's message id), `retryable` is tried again later, `failed` is failed, and
     `uncertain` (a timeout or a broken answer) is **not** resent automatically: the Cloud API has no idempotency key, so
     the message may already have gone. Mark it for a person.
6. Try a test number first. Until the number is live, Meta delivers only to numbers added under API setup (error
   131030 otherwise).
7. Optionally, subscribe to Meta's webhook for delivery statuses (sent, delivered, read, failed). An accepted send
   only means Meta took the message.

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
