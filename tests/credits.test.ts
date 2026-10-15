import { describe, expect, it } from "vitest";
import { billingCycle } from "@/lib/credits";

const iso = (c: { start: Date; end: Date }) => [c.start.toISOString().slice(0, 10), c.end.toISOString().slice(0, 10)];

describe("billingCycle", () => {
  it("runs from this month's renewal day when it has passed", () => {
    expect(iso(billingCycle(3, new Date("2026-10-15T12:00:00Z")))).toEqual(["2026-10-03", "2026-11-03"]);
  });
  it("runs from last month's renewal day when it has not come yet", () => {
    expect(iso(billingCycle(20, new Date("2026-10-15T12:00:00Z")))).toEqual(["2026-09-20", "2026-10-20"]);
  });
  it("starts a new cycle on the renewal day itself", () => {
    expect(iso(billingCycle(15, new Date("2026-10-15T00:00:00Z")))).toEqual(["2026-10-15", "2026-11-15"]);
  });
  it("crosses the year boundary", () => {
    expect(iso(billingCycle(10, new Date("2027-01-05T00:00:00Z")))).toEqual(["2026-12-10", "2027-01-10"]);
  });
  it("renews on the last day of short months", () => {
    expect(iso(billingCycle(31, new Date("2027-02-15T00:00:00Z")))).toEqual(["2027-01-31", "2027-02-28"]);
    expect(iso(billingCycle(31, new Date("2027-03-01T00:00:00Z")))).toEqual(["2027-02-28", "2027-03-31"]);
  });
  it("treats a missing or invalid day as the 1st", () => {
    expect(iso(billingCycle(0, new Date("2026-10-15T00:00:00Z")))).toEqual(["2026-10-01", "2026-11-01"]);
  });
});
