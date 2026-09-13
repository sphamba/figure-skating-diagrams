import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import * as oneFootTurns from "../src/engine/sequences/turns/oneFootTurns.js";
import { Pattern } from "../src/engine/pattern.js";
import type { PatternJSON } from "../src/engine/pattern.js";
import { Sequence } from "../src/engine/sequence.js";
import { Diagram } from "../src/engine/diagram.js";
import { Annotation } from "../src/engine/annotation.js";
import { Curve } from "../src/engine/curve.js";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { Path } from "../src/engine/path.js";
import { Vector } from "../src/engine/vector.js";

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

test("Sequence annotations round-trip through the diagram JSON", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  const sequence = new Sequence(path);
  sequence.addAnnotation(new Annotation(0.25 as PathCoordinate, 0.75 as PathCoordinate, "Spiral", "hold", "#00ff00"));
  const diagram = new Diagram("Diagram", [sequence]);
  const json = diagram.toJSON();

  const loaded = Diagram.fromJSON(JSON.parse(JSON.stringify(json)));
  expect(loaded.sequences).toHaveLength(1);
  expect(loaded.sequences[0]!.annotations).toHaveLength(1);
  const annotation = loaded.sequences[0]!.annotations[0]!;
  expect(annotation.start as number).toBeCloseTo(0.25);
  expect(annotation.end as number).toBeCloseTo(0.75);
  expect(annotation.title).toBe("Spiral");
  expect(annotation.description).toBe("hold");
  expect(annotation.color).toBe("#00ff00");
  expect(loaded.toJSON()).toEqual(json);
});

test("A diagram without sequence annotations loads when the list is absent", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  const json = new Diagram("Diagram", [new Sequence(path)]).toJSON();
  delete json.sequences[0]!.annotations;

  const loaded = Diagram.fromJSON(JSON.parse(JSON.stringify(json)));
  expect(loaded.sequences[0]!.annotations).toEqual([]);
});
