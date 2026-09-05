import { expect, test } from "vitest";
import * as oneFootTurns from "../src/engine/sequences/turns/oneFootTurns.js";
import { Pattern } from "../src/engine/pattern.js";
import { Sequence } from "../src/engine/sequence.js";

test("Pattern round-trips through JSON", () => {
  const pattern = new Pattern("Mohawk", [oneFootTurns.LFI_3, oneFootTurns.RBO_Loop], "https://example.com/video.mp4");

  const json = pattern.toJSON();
  const restored = Pattern.fromJSON(JSON.parse(JSON.stringify(json)));

  // The reconstructed pattern serializes back to the same plain JSON object.
  expect(restored.toJSON()).toEqual(json);
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
