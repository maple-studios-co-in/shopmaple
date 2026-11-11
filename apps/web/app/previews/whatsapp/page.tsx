import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import {
  orderConfirmationBody,
  orderConfirmationButtons,
  orderConfirmationCategory,
  orderConfirmationLanguage,
  orderConfirmationMediaPath,
  orderConfirmationSample,
  orderConfirmationTemplate,
  orderConfirmationTemplateName,
  orderConfirmationVariables,
  orderConfirmationWhatsApp,
  type OrderConfirmationPreview,
} from "@shopmaple/contracts/whatsapp";
import { getProduct } from "@/lib/catalog";
import { previewSampleHandle } from "@/lib/whatsapp-media";
import { seoSettings } from "@/lib/seo";

/**
 * The WhatsApp order confirmation before it can be sent (owner, 11 Nov 2026): the message from the template builder with
 * the Figma sample order, on a phone as Figma 394:1456 draws it and in WhatsApp Desktop/Web, then the template exactly
 * as it is submitted to Meta. Development only: a production server answers 404, and the page is never indexed.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "WhatsApp order confirmation (preview)", robots: { index: false, follow: false } };

/** The sample's piece, the Nola chair. When the local catalogue lacks it (or cannot be reached), the header image is still
 * drawn by the media route, with the Figma frames' own Nola photograph (lib/whatsapp-media.ts). */
const sampleHandle = "nola";
const standInMedia = orderConfirmationMediaPath(previewSampleHandle);
const mediaAlt = "Maple Furnishers. A beautiful choice. Made for your everyday.";
/** `?order=long`: a long name, five pieces and a window across the new year, to see the message wrap. */
const longOrder = {
  ...orderConfirmationSample,
  firstName: "Ananthapadmanabhan",
  orderNumber: "MF-2004817",
  pieces: [
    { title: "Nola Accent Chair", quantity: 2 },
    { title: "Terra Three Seater Sofa in Sage Bouclé", quantity: 1 },
    { title: "Oak Side Table", quantity: 1 },
    { title: "Nimbus Cloud Lounge Chair", quantity: 1 },
    { title: "Maple Walnut Dining Table for Six", quantity: 1 },
  ],
  amountPaidPaise: 18_450_050,
  delivery: { from: "2026-12-29", to: "2027-01-04" },
  city: "Thiruvananthapuram",
  pincode: "695001",
};

export default async function WhatsAppPreviewPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  if (process.env.NODE_ENV === "production") notFound();
  const long = (await searchParams)?.order === "long";
  const store = new URL(seoSettings(process.env).siteUrl).origin;
  const mediaPath = orderConfirmationMediaPath(sampleHandle);
  const { template, preview } = orderConfirmationWhatsApp({ ...(long ? longOrder : orderConfirmationSample), origin: store, mediaUrl: store + mediaPath });
  const sampleListed = await getProduct(sampleHandle).then(Boolean, () => false);
  const media = sampleListed ? mediaPath : standInMedia;
  // The store's links, followed on this server.
  const here = (url: string) => (url.startsWith(store + "/") ? url.slice(store.length) : url);
  const [view, contact] = orderConfirmationButtons;
  return (
    <main id="main" className="wa-preview">
      <div className="wa-preview-inner">
        <header className="wa-preview-head">
          <p className="wa-preview-eyebrow">Development preview · not served in production</p>
          <h1>WhatsApp order confirmation</h1>
          <p>
            The message a customer receives when Maple confirms their order, built by the template builder with the Figma sample
            order. Sending stays off until the WhatsApp Business account, the approved template and the customer&apos;s opt-in exist
            (docs/whatsapp-order-confirmation.md).
          </p>
          <nav className="wa-preview-orders" aria-label="Sample order">
            <a href="/previews/whatsapp" aria-current={long ? undefined : "page"}>
              The Figma order
            </a>
            <a href="/previews/whatsapp?order=long" aria-current={long ? "page" : undefined}>
              A long name and five pieces
            </a>
          </nav>
        </header>

        <div className="wa-renditions">
          <section className="wa-rendition" aria-labelledby="wa-phone-title">
            <div className="wa-rendition-head">
              <h2 id="wa-phone-title">On a phone</h2>
              <p>Figma 394:1456</p>
            </div>
            <PhoneMessage preview={preview} media={media} here={here} />
          </section>
          <section className="wa-rendition" aria-labelledby="wa-desktop-title">
            <div className="wa-rendition-head">
              <h2 id="wa-desktop-title">On WhatsApp Desktop and Web</h2>
              <p>The same message, as WhatsApp draws it on a computer</p>
            </div>
            <DesktopMessage preview={preview} media={media} here={here} />
          </section>
        </div>

        <section className="wa-submission" aria-labelledby="wa-submission-title">
          <h2 id="wa-submission-title">As submitted to Meta</h2>
          <dl className="wa-facts">
            <div>
              <dt>Category</dt>
              <dd>{orderConfirmationCategory}</dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd>
                <code>{orderConfirmationTemplateName}</code>
              </dd>
            </div>
            <div>
              <dt>Language</dt>
              <dd>
                <code>{orderConfirmationLanguage}</code> (English)
              </dd>
            </div>
            <div>
              <dt>Header</dt>
              <dd>
                Image, 1200 × 630, per piece: <a href={media}>{store + mediaPath}</a>
              </dd>
            </div>
          </dl>
          <h3>Body</h3>
          <pre className="wa-code">{orderConfirmationBody}</pre>
          <h3>Variables, with this order&apos;s values</h3>
          <ol className="wa-rows">
            {orderConfirmationVariables.map((variable, index) => (
              <li key={variable.placeholder}>
                <code>{variable.placeholder}</code>
                <span>
                  {variable.label}, up to {variable.maxLength} characters
                </span>
                <span className="wa-value">{template.components[1].parameters[index]?.text}</span>
              </li>
            ))}
          </ol>
          <h3>Buttons</h3>
          <ol className="wa-rows">
            <li>
              <code>URL</code>
              <span>
                {view.text}: {store + view.path}
              </span>
              <span className="wa-value">
                {"{{1}}"} = the Maple order number, here {template.components[2].parameters[0].text}
              </span>
            </li>
            <li>
              <code>URL</code>
              <span>
                {contact.text}: {store + contact.path}
              </span>
              <span className="wa-value">No variable</span>
            </li>
          </ol>
          <h3>This order as the Cloud API sends it</h3>
          <pre className="wa-code">{JSON.stringify(template, null, 2)}</pre>
          <details className="wa-definition">
            <summary>The template definition for Meta&apos;s Graph API</summary>
            <pre className="wa-code">{JSON.stringify(orderConfirmationTemplate(store), null, 2)}</pre>
          </details>
        </section>
      </div>
    </main>
  );
}

type MessageProps = { preview: OrderConfirmationPreview; media: string; here: (url: string) => string };

/** Lines of one paragraph, broken where the message breaks them. */
function lines(text: readonly string[]): ReactNode {
  return text.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}

/** Figma 394:1456: the chat's day and time around a white bubble of the header image, the body and two ruled buttons. */
function PhoneMessage({ preview, media, here }: MessageProps) {
  const [view, contact] = preview.buttons;
  return (
    <div className="wa-phone">
      <p className="wa-phone-meta">TODAY</p>
      <article className="wa-phone-bubble" aria-label="The message on a phone">
        <img className="wa-media" src={media} alt={mediaAlt} width={1200} height={630} />
        <div className="wa-phone-body">
          <p className="wa-phone-title">{preview.title}</p>
          {preview.paragraphs.map((paragraph, index) => (
            <p key={index} className={paragraph.muted ? "wa-phone-text is-muted" : "wa-phone-text"}>
              {lines(paragraph.lines)}
            </p>
          ))}
          {view && (
            <>
              <span className="wa-phone-rule" aria-hidden="true" />
              <a className="wa-phone-button is-primary" href={here(view.url)}>
                {view.text}
                <span className="wa-phone-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </>
          )}
          {contact && (
            <>
              <span className="wa-phone-rule" aria-hidden="true" />
              <a className="wa-phone-button" href={here(contact.url)}>
                {contact.text}
              </a>
            </>
          )}
        </div>
      </article>
      <p className="wa-phone-meta">10:42</p>
    </div>
  );
}

/** WhatsApp's own formatting: `*bold*`. */
function formatted(text: string): ReactNode {
  return text.split(/(\*[^*\n]+\*)/).map((part, index) =>
    /^\*[^*\n]+\*$/.test(part) ? <strong key={index}>{part.slice(1, -1)}</strong> : <Fragment key={index}>{part}</Fragment>,
  );
}

const icon = { width: 20, height: 20, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false } as const;

/** A chat in WhatsApp Desktop and Web (light theme): the contact's bar, the wallpaper, the bubble with its time and its
 * buttons below a rule, and the message field. */
function DesktopMessage({ preview, media, here }: MessageProps) {
  return (
    <div className="wa-desktop">
      <div className="wa-desktop-titlebar" aria-hidden="true">
        <span>WhatsApp</span>
        <span className="wa-desktop-controls">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="wa-desktop-header">
        <span className="wa-avatar" aria-hidden="true">
          M
        </span>
        <div className="wa-contact">
          <p className="wa-contact-name">Maple Furnishers</p>
          <p className="wa-contact-sub">Business account</p>
        </div>
        <span className="wa-header-icons" aria-hidden="true">
          <svg {...icon}>
            <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.47 6.47 0 0 0 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z" />
          </svg>
          <svg {...icon}>
            <path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
          </svg>
        </span>
      </div>
      <div className="wa-desktop-chat">
        <p className="wa-day-chip">Today</p>
        <article className="wa-bubble" aria-label="The message in WhatsApp Desktop">
          <img className="wa-bubble-media" src={media} alt={mediaAlt} width={1200} height={630} />
          <p className="wa-bubble-text">
            {formatted(preview.text)}
            <span className="wa-bubble-spacer" aria-hidden="true" />
            <span className="wa-bubble-time">10:42</span>
          </p>
          <div className="wa-bubble-buttons">
            {preview.buttons.map((button) => (
              <a key={button.text} className="wa-bubble-button" href={here(button.url)}>
                <svg {...icon} width={18} height={18}>
                  <path
                    fill="currentColor"
                    d="M14 3h7v7h-2V6.41l-8.29 8.3-1.42-1.42L17.59 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                  />
                </svg>
                {button.text}
              </a>
            ))}
          </div>
        </article>
      </div>
      <div className="wa-desktop-composer" aria-hidden="true">
        <svg {...icon}>
          <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" />
        </svg>
        <span className="wa-composer-field">Type a message</span>
        <svg {...icon}>
          <path
            fill="currentColor"
            d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5.3-3a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-1.7Z"
          />
        </svg>
      </div>
    </div>
  );
}
