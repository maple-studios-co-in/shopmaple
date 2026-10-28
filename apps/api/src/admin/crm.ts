import { Prisma, type PrismaClient } from "@prisma/client";
import type { Express } from "express";
import { z } from "zod";
import { contactIdSchema, contactQuerySchema, contactUpdateInputSchema, crmSummaryQuerySchema, enquiryStages, followUpTaskCompleteInputSchema, followUpTaskCreateInputSchema, followUpTaskIdSchema, followUpTaskQuerySchema, type EnquiryStage } from "@shopmaple/contracts";
import { HttpError } from "../cart.js";
import { phoneKey } from "../contacts.js";
import { decodePageCursor, encodeCursor, requireEnquiryAccess, serializeEnquirySummary } from "./enquiries.js";

const contactMissing = () => new HttpError(404, "CONTACT_NOT_FOUND", "This contact could not be found.");
const contactConflict = () => new HttpError(409, "CONTACT_VERSION_CONFLICT", "This contact changed. Reload the contact before trying again.");
const taskMissing = () => new HttpError(404, "TASK_NOT_FOUND", "This follow-up could not be found.");
const taskConflict = () => new HttpError(409, "TASK_VERSION_CONFLICT", "This follow-up changed. Reload before trying again.");
const timeCursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.string().min(1).max(100) }).strict();
const taskCursorSchema = z.object({ dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), id: followUpTaskIdSchema }).strict();
const contactSelect = { id: true, name: true, email: true, phone: true, city: true, tags: true, notes: true, version: true, createdAt: true, updatedAt: true } as const;
const taskSelect = { id: true, enquiryId: true, contactId: true, title: true, dueOn: true, assigneeId: true, note: true, done: true, completedAt: true, version: true, createdAt: true } as const;
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const utcDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const serializeTask = (row: Prisma.FollowUpTaskGetPayload<{ select: typeof taskSelect }>) => ({ ...row, dueOn: dateOnly(row.dueOn) });
const likePattern = (term: string) => "%" + term.replace(/[\\%_]/g, (match) => "\\" + match) + "%";

/** Append one activity row to the parent of a task, advancing the parent's version under its row lock. */
async function logTaskActivity(tx: Prisma.TransactionClient, task: { enquiryId: string | null; contactId: string | null; id: string; title: string }, actorId: string, action: "task_created" | "task_completed" | "task_reopened") {
  if (task.enquiryId) {
    await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id"=${task.enquiryId} FOR UPDATE`;
    const current = await tx.enquiry.findUniqueOrThrow({ where: { id: task.enquiryId }, select: { version: true } });
    await tx.enquiry.update({ where: { id: task.enquiryId }, data: { version: { increment: 1 } } });
    await tx.enquiryActivity.create({ data: { enquiryId: task.enquiryId, actorId, version: current.version + 1, action, taskId: task.id, body: task.title } });
  } else if (task.contactId) {
    await tx.$queryRaw`SELECT "id" FROM "Contact" WHERE "id"=${task.contactId} FOR UPDATE`;
    const current = await tx.contact.findUniqueOrThrow({ where: { id: task.contactId }, select: { version: true } });
    await tx.contact.update({ where: { id: task.contactId }, data: { version: { increment: 1 } } });
    await tx.contactActivity.create({ data: { contactId: task.contactId, actorId, version: current.version + 1, action, taskId: task.id, body: task.title } });
  }
}

export function registerCrmRoutes(app: Express, db: PrismaClient, secure: boolean) {
  app.get("/api/admin/crm/contacts", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      await requireEnquiryAccess(tx, req, secure);
      const query = contactQuerySchema.parse(req.query);
      const cursor = query.cursor ? decodePageCursor(query.cursor, timeCursorSchema) : null;
      const rows = await tx.contact.findMany({
        where: {
          ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }, { phone: { contains: query.q, mode: "insensitive" } }, { city: { contains: query.q, mode: "insensitive" } }] } : {}),
          ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}),
        },
        select: contactSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1,
      });
      const items = rows.slice(0, query.limit), last = items.at(-1);
      return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null };
    });
    res.json(result);
  });
  app.get("/api/admin/crm/contacts/:id", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      await requireEnquiryAccess(tx, req, secure);
      const id = contactIdSchema.parse(req.params.id);
      const contact = await tx.contact.findUnique({ where: { id }, select: contactSelect });
      if (!contact) throw contactMissing();
      const enquiries = await tx.enquiry.findMany({ where: { contactId: id }, select: { id: true, kind: true, status: true, version: true, assignedToId: true, contactId: true, name: true, context: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
      return { contact, enquiries: enquiries.map(serializeEnquirySummary) };
    });
    res.json(result);
  });
  app.get("/api/admin/crm/contacts/:id/timeline", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      await requireEnquiryAccess(tx, req, secure);
      const id = contactIdSchema.parse(req.params.id);
      const query = contactQuerySchema.pick({ limit: true, cursor: true }).strict().parse(req.query);
      const cursor = query.cursor ? decodePageCursor(query.cursor, timeCursorSchema) : null;
      if (!await tx.contact.findUnique({ where: { id }, select: { id: true } })) throw contactMissing();
      const page = cursor ? Prisma.sql`WHERE ("createdAt" < ${cursor.createdAt}::timestamp OR ("createdAt" = ${cursor.createdAt}::timestamp AND "id" < ${cursor.id}))` : Prisma.empty;
      const rows = await tx.$queryRaw<Array<{ id: string; source: "enquiry" | "contact"; enquiryId: string | null; action: string; actorId: string | null; stage: string | null; subject: string | null; body: string | null; createdAt: Date }>>`
        SELECT * FROM (
          SELECT a."id", 'enquiry' AS "source", a."enquiryId", a."action", a."actorId", a."stage", a."subject", a."body", a."createdAt"
            FROM "EnquiryActivity" a JOIN "Enquiry" e ON e."id" = a."enquiryId" WHERE e."contactId" = ${id}
          UNION ALL
          SELECT c."id", 'contact', NULL, c."action", c."actorId", NULL, NULL, c."body", c."createdAt" FROM "ContactActivity" c WHERE c."contactId" = ${id}
          UNION ALL
          SELECT e."id", 'enquiry', e."id", 'enquiry_received', NULL, NULL, NULL, NULL, e."createdAt" FROM "Enquiry" e WHERE e."contactId" = ${id}
        ) AS timeline ${page} ORDER BY "createdAt" DESC, "id" DESC LIMIT ${query.limit + 1}`;
      const items = rows.slice(0, query.limit), last = items.at(-1);
      return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null };
    });
    res.json(result);
  });
  app.post("/api/admin/crm/contacts/:id", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      const actor = await requireEnquiryAccess(tx, req, secure, true);
      const id = contactIdSchema.parse(req.params.id);
      const { expectedVersion, ...input } = contactUpdateInputSchema.parse(req.body);
      await tx.$queryRaw`SELECT "id" FROM "Contact" WHERE "id"=${id} FOR UPDATE`;
      const current = await tx.contact.findUnique({ where: { id }, select: { version: true, phoneKey: true } });
      if (!current) throw contactMissing();
      if (current.version !== expectedVersion) throw contactConflict();
      const nextPhoneKey = phoneKey(input.phone);
      if (nextPhoneKey && nextPhoneKey !== current.phoneKey) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"contact:phone:" + nextPhoneKey}))::text`;
        const holder = await tx.contact.findUnique({ where: { phoneKey: nextPhoneKey }, select: { id: true } });
        if (holder && holder.id !== id) throw new HttpError(409, "CONTACT_PHONE_IN_USE", "Another contact already uses this phone number.");
      }
      await tx.contact.update({ where: { id }, data: { ...input, phoneKey: nextPhoneKey, version: { increment: 1 } } });
      await tx.contactActivity.create({ data: { contactId: id, actorId: actor.id, version: expectedVersion + 1, action: "updated" } });
      return tx.contact.findUniqueOrThrow({ where: { id }, select: contactSelect });
    });
    res.json(result);
  });

  app.get("/api/admin/crm/tasks", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      const actor = await requireEnquiryAccess(tx, req, secure);
      const query = followUpTaskQuerySchema.parse(req.query);
      const cursor = query.cursor ? decodePageCursor(query.cursor, taskCursorSchema) : null;
      const today = utcDate(query.today);
      const rows = await tx.followUpTask.findMany({
        where: {
          done: query.view === "done",
          ...(query.view === "overdue" ? { dueOn: { lt: today } } : query.view === "today" ? { dueOn: today } : {}),
          ...(query.assignment === "mine" ? { assigneeId: actor.id } : {}),
          ...(query.enquiryId ? { enquiryId: query.enquiryId } : {}),
          ...(query.contactId ? { contactId: query.contactId } : {}),
          ...(cursor ? { OR: [{ dueOn: { gt: utcDate(cursor.dueOn) } }, { dueOn: utcDate(cursor.dueOn), id: { gt: cursor.id } }] } : {}),
        },
        select: taskSelect, orderBy: [{ dueOn: "asc" }, { id: "asc" }], take: query.limit + 1,
      });
      const items = rows.slice(0, query.limit).map(serializeTask), last = items.at(-1);
      return { items, nextCursor: rows.length > query.limit && last ? encodeCursor({ dueOn: last.dueOn, id: last.id }) : null };
    });
    res.json(result);
  });
  app.post("/api/admin/crm/tasks", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      const actor = await requireEnquiryAccess(tx, req, secure, true);
      const input = followUpTaskCreateInputSchema.parse(req.body);
      if (input.assigneeId) {
        await tx.$queryRaw`SELECT "id" FROM "ShopAdmin" WHERE "id"=${input.assigneeId} FOR SHARE`;
        const target = await tx.shopAdmin.findUnique({ where: { id: input.assigneeId }, select: { active: true, canManageEnquiries: true } });
        if (!target?.active || !target.canManageEnquiries) throw new HttpError(400, "ENQUIRY_ASSIGNEE_UNAVAILABLE", "Choose an active staff member with enquiry access.");
      }
      if (input.enquiryId && !await tx.enquiry.findUnique({ where: { id: input.enquiryId }, select: { id: true } })) throw new HttpError(404, "ENQUIRY_NOT_FOUND", "This enquiry could not be found.");
      if (input.contactId && !await tx.contact.findUnique({ where: { id: input.contactId }, select: { id: true } })) throw contactMissing();
      const task = await tx.followUpTask.create({ data: { enquiryId: input.enquiryId ?? null, contactId: input.contactId ?? null, title: input.title, dueOn: utcDate(input.dueOn), assigneeId: input.assigneeId, note: input.note, createdById: actor.id }, select: taskSelect });
      await logTaskActivity(tx, task, actor.id, "task_created");
      return serializeTask(task);
    });
    res.status(201).json(result);
  });
  app.post("/api/admin/crm/tasks/:id/complete", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      const actor = await requireEnquiryAccess(tx, req, secure, true);
      const id = followUpTaskIdSchema.parse(req.params.id);
      const { expectedVersion, done } = followUpTaskCompleteInputSchema.parse(req.body);
      await tx.$queryRaw`SELECT "id" FROM "FollowUpTask" WHERE "id"=${id} FOR UPDATE`;
      const current = await tx.followUpTask.findUnique({ where: { id }, select: taskSelect });
      if (!current) throw taskMissing();
      if (current.version !== expectedVersion) throw taskConflict();
      if (current.done === done) return serializeTask(current);
      const task = await tx.followUpTask.update({ where: { id }, data: { done, completedAt: done ? new Date() : null, version: { increment: 1 } }, select: taskSelect });
      await logTaskActivity(tx, task, actor.id, done ? "task_completed" : "task_reopened");
      return serializeTask(task);
    });
    res.json(result);
  });

  app.get("/api/admin/crm/summary", async (req, res) => {
    const result = await db.$transaction(async (tx) => {
      await requireEnquiryAccess(tx, req, secure);
      const { today } = crmSummaryQuerySchema.parse(req.query);
      const start = utcDate(today), end = new Date(start.getTime() + 86_400_000), weekStart = new Date(start.getTime() - 6 * 86_400_000);
      const grouped = await tx.enquiry.groupBy({ by: ["status"], _count: { _all: true } });
      const stages = Object.fromEntries(enquiryStages.map(stage => [stage, 0])) as Record<EnquiryStage, number>;
      for (const group of grouped) if (group.status in stages) stages[group.status as EnquiryStage] = group._count._all;
      const overdueTasks = await tx.followUpTask.count({ where: { done: false, dueOn: { lt: start } } });
      const dueTodayTasks = await tx.followUpTask.count({ where: { done: false, dueOn: start } });
      const newLastSevenDays = await tx.enquiry.count({ where: { createdAt: { gte: weekStart, lt: end } } });
      return { stages, overdueTasks, dueTodayTasks, newLastSevenDays };
    });
    res.json(result);
  });
}
