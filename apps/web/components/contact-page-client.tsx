"use client";
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { EnquiryContext } from "@/lib/enquiry-context";
import { useEnquiry } from "@/components/use-enquiry";

const otherTopic = "Something else";
// The topic and order number lead the message, so the whole stays within the enquiry's 5,000 characters.
const messageLimit = 4700;

function Field({ id, label, required = false, wide = false, children }: { id: string; label: string; required?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "contact-field contact-field-wide" : "contact-field"}>
      <label className="contact-label" htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {children}
    </div>
  );
}

/**
 * "Send us a message" (Figma 298:582): the store's own enquiry, as every contact form sends it. The design's topic and
 * order number have no place of their own in an enquiry, so they open its message. A sent form starts afresh.
 */
export function ContactEnquiryForm({ heading, note, topics, context }: {
  heading: string; note: string; topics: readonly string[]; context: EnquiryContext;
}) {
  const id = useId();
  const enquiry = useEnquiry();
  const form = useRef<HTMLFormElement>(null);
  const [topic, setTopic] = useState("");
  const sent = Boolean(enquiry.message) && !enquiry.failed;
  useEffect(() => {
    if (!sent) return;
    form.current?.reset();
    setTopic("");
  }, [sent, enquiry.message]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const lead = [value("topic") && `I need help with: ${value("topic")}`, value("order") && `Order number: ${value("order")}`].filter(Boolean).join("\n");
    void enquiry.submit({
      kind: "contact", name: value("name"), email: value("email"), phone: value("phone"),
      message: lead ? `${lead}\n\n${value("message")}` : value("message"), context,
    });
  }
  const at = (name: string) => `${id}-${name}`;
  return (
    <form ref={form} className="contact-form" onSubmit={submit} onChange={enquiry.clear} aria-labelledby={at("title")}>
      <h3 className="contact-form-title" id={at("title")}>{heading}</h3>
      {(context.product || context.pincode) && (
        <div className="contact-form-context">
          {context.product && <p>Your enquiry is about <strong>{context.product}</strong>{context.variant && <> · <span>{context.variant}</span></>}</p>}
          {context.pincode && <p>Delivery pincode: {context.pincode}</p>}
        </div>
      )}
      <div className="contact-fields">
        <Field id={at("name")} label="Full name" required>
          <input id={at("name")} name="name" autoComplete="name" placeholder="Your full name" required maxLength={100} />
        </Field>
        <Field id={at("email")} label="Email address" required>
          <input id={at("email")} name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false}
            placeholder="you@example.com" required maxLength={254} />
        </Field>
        <Field id={at("phone")} label="Phone number">
          <input id={at("phone")} name="phone" type="tel" autoComplete="tel" placeholder="+91" maxLength={30} />
        </Field>
        <Field id={at("topic")} label="I need help with">
          {/* The design writes the choice with a small arrow just after it; the native list, unseen over it, does the choosing. */}
          <div className="contact-select">
            <span className="contact-select-value" data-empty={topic ? undefined : ""} aria-hidden="true">
              {topic || "Select a topic"}<ChevronDown className="contact-select-arrow" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <select id={at("topic")} name="topic" value={topic} onChange={event => setTopic(event.target.value)}>
              <option value="">Select a topic</option>
              {[...new Set([...topics, otherTopic])].map(title => <option key={title} value={title}>{title}</option>)}
            </select>
          </div>
        </Field>
        <Field id={at("order")} label="Order number (optional)" wide>
          <input id={at("order")} name="order" autoComplete="off" placeholder="For an existing order" maxLength={40} />
        </Field>
        <Field id={at("message")} label="Your message" required wide>
          <textarea id={at("message")} name="message" placeholder="Tell us about your space, product or question…" required maxLength={messageLimit} />
        </Field>
      </div>
      <p className="contact-form-note">{note}</p>
      <button className="contact-button contact-submit" type="submit" disabled={enquiry.pending} data-fill-button="">
        {enquiry.pending ? "Sending…" : <>Send message<span className="contact-button-arrow" aria-hidden="true">→</span></>}
      </button>
      {enquiry.message && <p role={enquiry.failed ? "alert" : "status"} className="contact-form-status">{enquiry.message}</p>}
    </form>
  );
}

export type ContactHelpTopic = { key: string; title: string; icon: string; questions: readonly { key: string; question: string; answer: string }[] };

/**
 * The help centre (Figma 298:613): five topics as tabs, then the chosen topic's questions, its first answer open. A
 * question shows a plus while closed and a minus while open, as the design draws them; one answer opens at a time.
 */
export function ContactHelpCentre({ topics }: { topics: readonly ContactHelpTopic[] }) {
  const id = useId();
  const [active, setActive] = useState(topics[0]?.key ?? "");
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const index = Math.max(0, topics.findIndex(topic => topic.key === active));
  const topic = topics[index];
  if (!topic) return null;
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: topics.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = topics[(moves[event.key]! + topics.length) % topics.length]!;
    setActive(next.key);
    tabs.current.get(next.key)?.focus();
  }
  return (
    <div className="contact-topics">
      <div className="contact-topic-list" role="tablist" aria-label="Help topics" onKeyDown={onKeyDown}>
        {topics.map(item => {
          const selected = item.key === topic.key;
          return (
            <button key={item.key} type="button" role="tab" id={`${id}-tab-${item.key}`} className="contact-topic"
              aria-selected={selected} aria-controls={`${id}-panel`} tabIndex={selected ? 0 : -1} onClick={() => setActive(item.key)}
              ref={node => { if (node) tabs.current.set(item.key, node); else tabs.current.delete(item.key); }}>
              <span className="contact-topic-icon" style={{ "--contact-icon": `url("${item.icon}")` } as CSSProperties} aria-hidden="true" />
              <span className="contact-topic-label">{item.title}</span>
            </button>
          );
        })}
      </div>
      <div key={topic.key} className="contact-faqs" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${topic.key}`}>
        {topic.questions.map((item, order) => (
          <details key={item.key} className="contact-faq" name={`${id}-faq`} open={order === 0}>
            <summary className="contact-faq-question">
              <span className="contact-faq-text">{item.question}</span>
              <span className="contact-faq-sign" aria-hidden="true" />
            </summary>
            <div className="contact-faq-answer"><p>{item.answer}</p></div>
          </details>
        ))}
      </div>
    </div>
  );
}
