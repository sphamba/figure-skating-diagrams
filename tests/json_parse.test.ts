import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import * as oneFootTurns from "../src/engine/sequences/turns/oneFootTurns.js";
import { Pattern } from "../src/engine/pattern.js";
import type { PatternJSON } from "../src/engine/pattern.js";
import { Sequence } from "../src/engine/sequence.js";

test("Pattern loads from the public JSON asset", () => {
  const json = JSON.parse(
    readFileSync(resolve(process.cwd(), "tests/test-pattern.json"), "utf-8"),
  ) as PatternJSON;

  const restored = Pattern.fromJSON(json);

  const canonical = restored.toJSON();
  expect(JSON.parse(JSON.stringify(canonical))).toEqual(canonical);

  const restoredAgain = Pattern.fromJSON(canonical);
  expect(restoredAgain.toJSON()).toEqual(canonical);

  expect(restored.name).toBe(json.name);
  expect(restored.videoUrl).toBe(json.videoUrl);
  expect(restored.sequences).toHaveLength(json.sequences.length);
});

test("Empty pattern round-trips through JSON", () => {
  const pattern = new Pattern("Empty");
  const json = pattern.toJSON();
  const restored = Pattern.fromJSON(JSON.parse(JSON.stringify(json)));

  expect(restored.name).toBe("Empty");
  expect(restored.videoUrl).toBeUndefined();
  expect(restored.sequences).toEqual([]);
  expect(restored.toJSON()).toEqual(json);
});

test("Reconstructed Sequence restores elements and keyframes", () => {
  const json = oneFootTurns.LFI_3.toJSON();
  const restored = Sequence.fromJSON(JSON.parse(JSON.stringify(json)));

  expect(restored.elements).toHaveLength(1);
  expect(restored.keyframes.footL.length).toBeGreaterThan(0);
  expect(restored.keyframes.footR.length).toBeGreaterThan(0);
  expect(restored.path.length).toBeCloseTo(oneFootTurns.LFI_3.path.length);
  expect(restored.toJSON()).toEqual(json);
});
