import { expect, test } from "vitest";
import { Annotation } from "../../src/engine/annotation";
import { annotationNeighbourBounds, clampAnnotationSpan } from "../../src/engine/sequenceEditor/editor";

function makeAnnotations(): Annotation[] {
  return [
    new Annotation(0.2, 0.5),
    new Annotation(0.8, 1.2),
    new Annotation(2.5, 3.0),
  ];
}

test("Neighbour bounds split around the annotation span", () => {
  const annotations = makeAnnotations();
  expect(annotationNeighbourBounds(annotations, 0.5, 0.8)).toEqual({ left: 0.5, right: 0.8 });
  expect(annotationNeighbourBounds(annotations, 1.2, 2.5)).toEqual({ left: 1.2, right: 2.5 });
  expect(annotationNeighbourBounds(annotations, 0, 0.2)).toEqual({ left: 0, right: 0.2 });
  expect(annotationNeighbourBounds(annotations, 3.0, 4)).toEqual({ left: 3, right: Infinity });
});

test("Neighbour bounds skip the excluded annotation and its selected set", () => {
  const annotations = makeAnnotations();
  const middle = annotations[1]!;
  expect(annotationNeighbourBounds(annotations, 0.8, 1.2, middle)).toEqual({ left: 0.5, right: 2.5 });
  expect(annotationNeighbourBounds(annotations, 0.8, 1.2, new Set([middle]))).toEqual({ left: 0.5, right: 2.5 });
});

test("Neighbour bounds use only other annotations", () => {
  const annotations = [new Annotation(0.2, 0.5)];
  expect(annotationNeighbourBounds(annotations, 0.6, 4)).toEqual({ left: 0.5, right: Infinity });
});

test("Dragging an end into a neighbour clamps flush without overlap", () => {
  const annotations = makeAnnotations();
  const moved = new Annotation(0.55, 0.75);
  const bounds = annotationNeighbourBounds(annotations, moved.start, moved.end, moved);

  const [draggedStart, draggedEnd] = clampAnnotationSpan(moved.start, 1.0, bounds.left, bounds.right);
  expect(draggedStart).toBeCloseTo(0.55);
  expect(draggedEnd).toBeCloseTo(0.8); // flush with the next annotation start, touching is not overlap
  expect(draggedEnd).toBeLessThanOrEqual(annotations[2]!.start);

  const [startBefore, endBefore] = clampAnnotationSpan(moved.start, 0.1, bounds.left, bounds.right);
  expect(endBefore).toBeCloseTo(0.5); // flush with the previous annotation end
  expect(startBefore).toBeGreaterThanOrEqual(annotations[0]!.end);
});

test("Dragging a span over a neighbour never overlaps it", () => {
  const annotations = makeAnnotations();
  const moved = new Annotation(0.55, 0.75);
  const bounds = annotationNeighbourBounds(annotations, moved.start, moved.end, moved);

  for (const dragged of [
    [0.1, 0.9],
    [0.3, 1.5],
    [0.9, 1.6],
    [2.0, 2.8],
  ]) {
    const [start, end] = clampAnnotationSpan(dragged[0]!, dragged[1]!, bounds.left, bounds.right);
    expect(end - start).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThanOrEqual(0);
    for (const other of annotations) {
      const os = Math.min(other.start, other.end);
      const oe = Math.max(other.start, other.end);
      const overlaps = start < oe && end > os && (end - start > 0 || oe - os > 0);
      expect(overlaps).toBe(false);
    }
  }
});
