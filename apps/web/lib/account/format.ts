import { indiaStates } from "@/app/checkout/india-states";

// How the account pages and the checkout write dates, places and phone numbers (Figma 392:1255, 392:1338, 392:1432).
// Months are spelt here rather than by Intl, whose British short form for September is "Sept"; the frames write "Sep".
const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type Day = { year: number; month: number; day: number };
const indiaOffsetMs = (5 * 60 + 30) * 60_000;

/** The calendar day in India (UTC+5:30 all year, as the API counts) for an instant. */
function indiaDay(iso: string): Day | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time + indiaOffsetMs);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}
/** A day the API already gives in India's calendar ("2026-11-24"). */
function calendarDay(value: string): Day | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

/** "Karnataka" for its GST state code "29"; an unknown code is shown as it is. */
export function stateName(code: string) {
  return indiaStates.find(([value]) => value === code)?.[1] ?? code;
}

/** "10 Nov 2026", on India's calendar. */
export function formatDate(iso: string) {
  const day = indiaDay(iso);
  return day ? `${day.day} ${shortMonths[day.month - 1]} ${day.year}` : "";
}

/** "24–28 Nov 2026", "29 November – 2 December 2026" or "30 Dec 2026 – 2 Jan 2027"; `year: false` drops a shared year. */
export function formatDayRange(from: string, to: string, { month, year = true }: { month: "short" | "long"; year?: boolean }) {
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (!start || !end) return "";
  const names = month === "short" ? shortMonths : longMonths;
  const name = (day: Day) => names[day.month - 1];
  if (start.year !== end.year) return `${start.day} ${name(start)} ${start.year} – ${end.day} ${name(end)} ${end.year}`;
  const tail = year ? ` ${end.year}` : "";
  if (start.month !== end.month) return `${start.day} ${name(start)} – ${end.day} ${name(end)}${tail}`;
  if (start.day === end.day) return `${start.day} ${name(start)}${tail}`;
  return `${start.day}–${end.day} ${name(start)}${tail}`;
}

const tenDigits = (phone: string) => /^\+91([6-9][0-9]{9})$/.exec(phone)?.[1] ?? null;
/** "+91 98765 43210", where the customer edits or checks their own number. */
export function displayPhone(phone: string) {
  const digits = tenDigits(phone);
  return digits ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}
/** "+91 98••• ••210": a saved address's number at a glance (Figma 392:1527), whole again when the address is edited. */
export function maskedPhone(phone: string) {
  const digits = tenDigits(phone);
  return digits ? `+91 ${digits.slice(0, 2)}••• ••${digits.slice(7)}` : phone;
}

/** "1 item", "3 items": pieces, as the API counts them. */
export function itemCount(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
/** "03 orders", "01 address" (the overview's two-digit counts, Figma 392:1255). */
export function paddedCount(count: number, noun: string, plural = `${noun}s`) {
  return `${String(count).padStart(2, "0")} ${count === 1 ? noun : plural}`;
}
/** "Aditi" from "Aditi Sharma"; null when there is no name yet. */
export function firstName(name: string | null) {
  return name?.trim().split(/\s+/)[0] || null;
}
