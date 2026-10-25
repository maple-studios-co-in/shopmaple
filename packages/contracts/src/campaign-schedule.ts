import { z } from "zod";

const instantSchema = z.iso.datetime({ offset: true }).refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Use a valid date and time with a timezone",
);

export const campaignScheduleSchema = z
  .object({ startsAt: instantSchema.nullable(), endsAt: instantSchema.nullable() })
  .strict()
  .refine(
    ({ startsAt, endsAt }) => startsAt === null || endsAt === null || Date.parse(startsAt) < Date.parse(endsAt),
    { message: "End must be after start", path: ["endsAt"] },
  );

export type CampaignSchedule = z.infer<typeof campaignScheduleSchema>;

/** Evaluate published campaign timing with an explicit, shared clock. */
export function isCampaignActive(schedule: CampaignSchedule | null | undefined, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  if (schedule == null) return true;
  const parsed = campaignScheduleSchema.safeParse(schedule);
  if (!parsed.success) return false;
  const { startsAt, endsAt } = parsed.data;
  return (startsAt === null || now >= Date.parse(startsAt)) &&
    (endsAt === null || now < Date.parse(endsAt));
}
