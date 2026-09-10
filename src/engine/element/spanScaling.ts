import { Element } from "./element.js";

const keyframeBoundaryGap = 0.001;
export const MIN_SCALE_GAP = 2 * keyframeBoundaryGap;

type SpanEntry = {
  element: Element;
  scalable: boolean;
  middle: number;
  leftReach: number;
  rightReach: number;
  scale: number;
};

export function computeSpanScales(elements: Element[], targetScale: number, pathLength: number): Map<Element, number> {
  const scales = new Map<Element, number>();
  const target = Math.max(1, targetScale);
  if (target === 1) {
    for (const element of elements) scales.set(element, 1);
    return scales;
  }

  const entries: SpanEntry[] = [...elements]
    .sort((a, b) => (a.start as number) - (b.start as number))
    .map((element) => {
      const start = element.start as number;
      const end = element.end as number;

      const scalable = element.scalable && start !== end;
      return {
        element,
        scalable,
        middle: (start + end) / 2,
        leftReach: Math.abs((end - start) / 2),
        rightReach: Math.abs((end - start) / 2),
        scale: 1,
      };
    });

  for (const entry of entries) {
    let scale = entry.scalable ? target : 1;
    if (entry.scalable) {
      if (entry.leftReach > 0) scale = Math.min(scale, entry.middle / entry.leftReach);
      if (entry.rightReach > 0) scale = Math.min(scale, (pathLength - entry.middle) / entry.rightReach);
    }
    entry.scale = Math.max(1, scale);
  }

  for (let index = 0; index < entries.length - 1; index++) {
    const leftEntry = entries[index]!;
    const rightEntry = entries[index + 1]!;
    const rightEdge = leftEntry.middle + leftEntry.rightReach * leftEntry.scale;
    const leftEdge = rightEntry.middle - rightEntry.leftReach * rightEntry.scale;
    const deficit = MIN_SCALE_GAP - (leftEdge - rightEdge);
    if (deficit <= 0) continue;

    const availableLeft = leftEntry.scalable ? leftEntry.rightReach * (leftEntry.scale - 1) : 0;
    const availableRight = rightEntry.scalable ? rightEntry.leftReach * (rightEntry.scale - 1) : 0;
    const total = availableLeft + availableRight;
    if (total <= 0) continue;

    const shrink = Math.min(deficit, total);
    const ratio = 1 - shrink / total;
    if (leftEntry.scalable) leftEntry.scale = Math.max(1, 1 + (leftEntry.scale - 1) * ratio);
    if (rightEntry.scalable) rightEntry.scale = Math.max(1, 1 + (rightEntry.scale - 1) * ratio);
  }

  for (const entry of entries) scales.set(entry.element, entry.scale);
  return scales;
}
