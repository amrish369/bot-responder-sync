import { test, expect } from "vitest";
import { withSeriesTag } from "/dev-server/src/lib/telegram/smart-parse.server";
test("x", () => {
  console.log(withSeriesTag("Dupahiya", "Dupahiya S01E01 720p"));
  console.log(withSeriesTag("Mirzapur", "Mirzapur S01 E01-08 Combined Hindi"));
  console.log(withSeriesTag("Panchayat", "Panchayat Season 3 Complete"));
  console.log(withSeriesTag("Dangal", "Dangal 2016 Hindi"));
  expect(withSeriesTag("Dupahiya", "Dupahiya S01E01")).toBe("Dupahiya S01E01");
  expect(withSeriesTag("Mirzapur", "Mirzapur S01 E01-08 Combined")).toBe("Mirzapur S01E01-E08 Combined");
});
