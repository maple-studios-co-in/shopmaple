import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "@shopmaple/contracts";

const campaign = {
  key: "sofas-sale", label: "Autumn", headline: ["Autumn sofas"],
  supporting: "", offer: [], eligibility: "", cta: "Explore",
  href: "/pages/sofas", artwork: null,
};
const start = "2026-10-26T10:00:00Z";
const end = "2026-10-27T10:00:00Z";

test("legacy campaigns remain valid without a schedule", () => {
  assert.deepEqual(contracts.campaignContentSchema.parse(campaign), campaign);
});

test("campaigns preserve explicit, open-ended and cleared schedule windows", () => {
  for (const schedule of [
    null,
    { startsAt: start, endsAt: end },
    { startsAt: "2026-10-26T15:30:00+05:30", endsAt: end },
    { startsAt: start, endsAt: null },
    { startsAt: null, endsAt: end },
    { startsAt: null, endsAt: null },
  ]) {
    const result = contracts.campaignContentSchema.safeParse({ ...campaign, schedule });
    assert.equal(result.success, true, `schedule must be accepted: ${JSON.stringify(schedule)}`);
    if (result.success) assert.deepEqual(result.data.schedule, schedule);
  }
});

test("campaign windows reject ambiguous dates, impossible dates, reversed instants and extra fields", () => {
  for (const schedule of [
    { startsAt: "2026-10-26T10:00:00", endsAt: end },
    { startsAt: "2026-02-30T10:00:00Z", endsAt: end },
    { startsAt: "not-a-date", endsAt: end },
    { startsAt: "2026-10-26", endsAt: end },
    { startsAt: start, endsAt: start },
    { startsAt: end, endsAt: start },
    { startsAt: "2026-10-26T15:30:00+05:30", endsAt: start },
    { startsAt: start, endsAt: "2026-10-26T10:00:00+05:30" },
    { startsAt: start, endsAt: end, enabled: true },
    { startsAt: start },
    { startsAt: 1793008800000, endsAt: end },
  ]) assert.equal(contracts.campaignContentSchema.safeParse({ ...campaign, schedule }).success, false, JSON.stringify(schedule));
});

test("campaign activity includes its start and excludes its end", () => {
  const window = { startsAt: start, endsAt: end };
  for (const [now, expected] of [
    [1793008799999, false],
    [1793008800000, true],
    [1793052000000, true],
    [1793095199999, true],
    [1793095200000, false],
    [1793095200001, false],
  ] as const) assert.equal(contracts.isCampaignActive(window, now), expected, `clock ${now}`);
});

test("campaign activity respects timezone offsets, open boundaries and legacy schedules", () => {
  for (const [window, now, expected] of [
    [{ startsAt: "2026-10-26T15:30:00+05:30", endsAt: end }, 1793008800000, true],
    [{ startsAt: start, endsAt: null }, 1793095200000, true],
    [{ startsAt: start, endsAt: null }, 1793008799999, false],
    [{ startsAt: null, endsAt: end }, 0, true],
    [{ startsAt: null, endsAt: end }, 1793095200000, false],
    [{ startsAt: null, endsAt: null }, 0, true],
    [null, 0, true],
    [undefined, 0, true],
  ] as const) assert.equal(contracts.isCampaignActive(window, now), expected);
});

test("campaign activity fails closed for an invalid clock or malformed persisted window", () => {
  for (const now of [NaN, Infinity, -Infinity]) {
    assert.equal(contracts.isCampaignActive({ startsAt: start, endsAt: end }, now), false);
    assert.equal(contracts.isCampaignActive(null, now), false);
  }
  for (const window of [
    { startsAt: "invalid", endsAt: end },
    { startsAt: start, endsAt: "invalid" },
    { startsAt: end, endsAt: start },
    { startsAt: "2026-02-30T00:00:00Z", endsAt: end },
    { startsAt: "2026-10-26T09:00:00", endsAt: end },
  ]) assert.equal(contracts.isCampaignActive(window, 1793008800000), false);
});
