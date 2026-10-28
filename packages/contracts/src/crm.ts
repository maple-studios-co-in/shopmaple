import { z } from "zod";
import { contactIdSchema, enquiryAdminIdSchema, enquiryStaffIdSchema, enquiryStageSchema, isoDateSchema } from "./enquiry-admin";

const plainText = (max: number) =>
  z.string().max(max).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]*$/).trim();
const versionSchema = z.number().int().min(0).max(2147483646);
export const followUpTaskIdSchema = z.string().regex(/^c[a-z0-9]{24}$/);

export const enquiryStageInputSchema = z.object({
  expectedVersion: versionSchema,
  stage: enquiryStageSchema,
  /** Required when moving to `lost`; rejected for every other stage. */
  reason: plainText(500).min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.stage === "lost" && !value.reason) ctx.addIssue({ code: "custom", message: "A lost enquiry needs a short reason" });
  if (value.stage !== "lost" && value.reason !== undefined) ctx.addIssue({ code: "custom", message: "Only a lost enquiry records a reason" });
});

export const enquiryReplyInputSchema = z.object({
  expectedVersion: versionSchema,
  subject: plainText(150).min(1),
  body: z.string().max(5000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]*$/).trim().min(1),
}).strict();

export const contactSchema = z.object({
  id: contactIdSchema,
  name: z.string().max(100),
  email: z.string().max(254),
  phone: z.string().max(30),
  city: z.string().max(100),
  tags: z.array(z.string().max(40)).max(20),
  notes: z.string().max(5000),
  version: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();
export type Contact = z.infer<typeof contactSchema>;
export const contactUpdateInputSchema = z.object({
  expectedVersion: versionSchema,
  name: plainText(100),
  phone: plainText(30),
  city: plainText(100),
  tags: z.array(plainText(40).min(1)).max(20),
  notes: z.string().max(5000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]*$/).trim(),
}).strict();
export const contactQuerySchema = z.object({
  q: plainText(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export const contactListSchema = z.object({ items: z.array(contactSchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();

export const followUpTaskSchema = z.object({
  id: followUpTaskIdSchema,
  enquiryId: enquiryAdminIdSchema.nullable(),
  contactId: contactIdSchema.nullable(),
  title: z.string().max(200),
  dueOn: isoDateSchema,
  assigneeId: enquiryStaffIdSchema.nullable(),
  note: z.string().max(2000),
  done: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  version: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
}).strict();
export type FollowUpTask = z.infer<typeof followUpTaskSchema>;
export const followUpTaskCreateInputSchema = z.object({
  enquiryId: enquiryAdminIdSchema.optional(),
  contactId: contactIdSchema.optional(),
  title: plainText(200).min(1),
  dueOn: isoDateSchema,
  assigneeId: enquiryStaffIdSchema.nullable().default(null),
  note: z.string().max(2000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]*$/).trim().default(""),
}).strict().refine(value => (value.enquiryId ? 1 : 0) + (value.contactId ? 1 : 0) === 1, { message: "A task belongs to exactly one enquiry or contact" });
export const followUpTaskCompleteInputSchema = z.object({ expectedVersion: versionSchema, done: z.boolean() }).strict();
export const followUpTaskQuerySchema = z.object({
  view: z.enum(["open", "overdue", "today", "done"]).default("open"),
  /** The viewer's local calendar date; the server never guesses a timezone. */
  today: isoDateSchema,
  assignment: z.enum(["mine"]).optional(),
  enquiryId: enquiryAdminIdSchema.optional(),
  contactId: contactIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export const followUpTaskListSchema = z.object({ items: z.array(followUpTaskSchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();

export const crmSummaryQuerySchema = z.object({ today: isoDateSchema }).strict();
export const crmSummarySchema = z.object({
  stages: z.object({ new: z.number().int().nonnegative(), contacted: z.number().int().nonnegative(), quoted: z.number().int().nonnegative(), won: z.number().int().nonnegative(), lost: z.number().int().nonnegative() }).strict(),
  overdueTasks: z.number().int().nonnegative(),
  dueTodayTasks: z.number().int().nonnegative(),
  newLastSevenDays: z.number().int().nonnegative(),
}).strict();
export type CrmSummary = z.infer<typeof crmSummarySchema>;

/** One contact timeline entry: enquiry activity across every enquiry plus contact-level events. */
export const contactTimelineEntrySchema = z.object({
  id: z.string().max(100),
  source: z.enum(["enquiry", "contact"]),
  enquiryId: enquiryAdminIdSchema.nullable(),
  action: z.enum(["assigned", "unassigned", "note", "status_changed", "task_created", "task_completed", "task_reopened", "email_sent", "email_failed", "updated", "enquiry_received"]),
  actorId: enquiryStaffIdSchema.nullable(),
  stage: enquiryStageSchema.nullable(),
  subject: z.string().max(150).nullable(),
  body: z.string().max(5000).nullable(),
  createdAt: z.iso.datetime(),
}).strict();
export type ContactTimelineEntry = z.infer<typeof contactTimelineEntrySchema>;
export const contactTimelineSchema = z.object({ items: z.array(contactTimelineEntrySchema).max(50), nextCursor: z.string().max(300).nullable() }).strict();
