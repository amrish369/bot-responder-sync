import { test, expect } from "vitest";
import { withSeriesTag } from "./smart-parse.server";
test("x", () => {
  
  
  
  
  expect(withSeriesTag("Dupahiya", "Dupahiya S01E01")).toBe("Dupahiya S01E01");
  expect(withSeriesTag("Mirzapur", "Mirzapur S01 E01-08 Combined")).toBe("Mirzapur S01E01-E08 Combined");
});
