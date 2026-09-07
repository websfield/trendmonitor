// addMonthsUtc — the clamping rule every money deadline in this package
// depends on (billing review finding 4). Each case below returns the WRONG
// answer under the `setUTCMonth(getUTCMonth() + n)` the four call sites used
// before: that form overflows "31 February" into 3 March instead of clamping.
import { describe, expect, it } from "vitest";
import { addMonthsUtc } from "../src/months";

const iso = (d: Date) => d.toISOString();

describe("addMonthsUtc (calendar arithmetic, clamped never overflowed)", () => {
  it.each([
    // [from, months, expected, what it is]
    ["2027-01-31T00:00:00.000Z", 1, "2027-02-28T00:00:00.000Z", "31 Jan +1 → 28 Feb, NOT 3 Mar (the REQ-G02 rollover case)"],
    ["2028-01-31T00:00:00.000Z", 1, "2028-02-29T00:00:00.000Z", "leap year clamps to the 29th"],
    ["2027-01-29T00:00:00.000Z", 1, "2027-02-28T00:00:00.000Z", "29 Jan +1 in a NON-leap year still clamps"],
    ["2027-03-31T00:00:00.000Z", 1, "2027-04-30T00:00:00.000Z", "31 Mar +1 → 30 Apr (30-day month)"],
    ["2027-08-31T00:00:00.000Z", 6, "2028-02-29T00:00:00.000Z", "multi-month hop lands on a clamped leap day"],
    ["2027-01-31T00:00:00.000Z", 12, "2028-01-31T00:00:00.000Z", "pack validity: a whole year keeps the 31st"],
    ["2028-02-29T00:00:00.000Z", 12, "2029-02-28T00:00:00.000Z", "leap day +12 clamps the following year"],
    ["2027-12-31T00:00:00.000Z", 1, "2028-01-31T00:00:00.000Z", "December rolls the YEAR over correctly"],
    ["2027-11-30T00:00:00.000Z", 3, "2028-02-29T00:00:00.000Z", "30 Nov +3 → 29 Feb"],
    ["2027-01-15T00:00:00.000Z", 1, "2027-02-15T00:00:00.000Z", "an ordinary mid-month date is untouched"],
    ["2027-01-31T13:45:12.000Z", 1, "2027-02-28T13:45:12.000Z", "TIME OF DAY survives the clamp"],
  ])("%s + %i months = %s (%s)", (from, months, expected) => {
    expect(iso(addMonthsUtc(new Date(from), months))).toBe(expected);
  });

  it("is the fix, not a coincidence: the naive setUTCMonth form disagrees on the month-end cases", () => {
    const naive = (from: Date, months: number) => {
      const d = new Date(from.getTime());
      d.setUTCMonth(d.getUTCMonth() + months);
      return d;
    };
    const from = new Date("2027-01-31T00:00:00.000Z");
    // Proves this suite would have caught the shipped defect rather than
    // passing against both implementations (the vacuous-test failure mode this
    // project has hit before).
    expect(iso(naive(from, 1))).toBe("2027-03-03T00:00:00.000Z");
    expect(iso(addMonthsUtc(from, 1))).toBe("2027-02-28T00:00:00.000Z");
  });

  it("never returns a date in a later month than asked for (the property, over a full year of month-ends)", () => {
    for (let month = 0; month < 12; month += 1) {
      const start = new Date(Date.UTC(2027, month, 1));
      const lastDay = new Date(Date.UTC(2027, month + 1, 0)).getUTCDate();
      const from = new Date(Date.UTC(2027, month, lastDay));
      const got = addMonthsUtc(from, 1);
      const expectedMonth = (month + 1) % 12;
      expect(got.getUTCMonth(), `${from.toISOString()} +1`).toBe(expectedMonth);
      expect(got.getTime()).toBeGreaterThan(start.getTime());
    }
  });
});
