import { describe, it, expect } from "vitest";
import { autoMatchQuery, isConfidentMatch } from "./automatch.server";

describe("automatch", () => {
  it("strips series tags", () => {
    const q = autoMatchQuery("Mirzapur S01 E01-08 Combined 720p Hindi");
    expect(q.query).toBe("Mirzapur");
    expect(q.series).toBe(true);
  });
  it("rejects wrong year", () => {
    expect(isConfidentMatch("War", 2019, { title: "War", year: "2007" })).toBe(false);
    expect(isConfidentMatch("War", 2019, { title: "War", year: "2019" })).toBe(true);
  });
});
