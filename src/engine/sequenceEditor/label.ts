import { CANVAS_FONT, CANVAS_SCALE, RINK_COLOR } from "../constants.js";
import type { CanvasRenderingContext2DSized } from "../rinkCanvas.js";
import { Vector } from "../vector.js";

export const LABEL_FONT_SIZE = 12; // px
export const LABEL_FONT_SIZE_SMALL = 10; // px
export const LABEL_OFFSET = 12; // px, screen distance from the anchor along the direction

// Default pill background, #fafafb at 80% opacity, so foot traces stay readable
// underneath.
const PILL_COLOR = "#fafafb";
const PILL_OPACITY = 0.8;

// Text color of every label.
const LABEL_TEXT_COLOR = "#444";
// Screen padding between the text and a pill background.
const PILL_PADDING = 5; // px
// Pill backdrops grow the pill by this on each side, in the rink color.
const PILL_BACKDROP_PADDING = 1; // px
// Base length of the triangle connector between the anchor and the pill.
const PILL_CONNECTOR_BASE = 8; // px
// Pill backgrounds are 20% larger than the text.
const PILL_SIZE_FACTOR = 1.2;
// Screen padding between the text and a circle background.
const CIRCLE_LABEL_PADDING = 2; // px
// Minimum background radius of a circle label.
const CIRCLE_LABEL_MIN_RADIUS = 10; // px
// Extra collision radius beyond the background, screen px, so labels keep a
// small gap when resolved.
export const LABEL_COLLISION_PADDING = 5; // px
// Rendering of the pill background: path fill or a thick round-cap segment
// stroke, measured in headless Chrome, 4000 pills per repaint: fill 31.8 ms,
// stroke 24.3 ms.
export type PillRenderMode = "fill" | "stroke";
export const PILL_RENDER_MODE: PillRenderMode = "stroke";
// Fraction of the overlap removed per collision iteration: 0 pushes nothing,
// 1 fully resolves every overlap in a single iteration, but might jitter.
const LABEL_PUSH_FACTOR = 0.75;
// At most one collision iteration per frame.
const LABEL_COLLISION_ITERATIONS = 1;
// Collision resolution may not move a label further from its home position
// than this multiple of its background radius, so it stays near its anchor.
export const LABEL_ANCHOR_LIMIT = 2;

// Screen radius of an action button disc.
export const ACTION_BUTTON_RADIUS = 7; // px
// Outline and symbol stroke width.
export const ACTION_BUTTON_LINE_WIDTH = 1.5; // px
// Full length of the plus and minus symbols.
export const ACTION_BUTTON_SYMBOL_LENGTH = 7; // px
// Slightly above the drawn radius.
export const ACTION_BUTTON_HIT_RADIUS = 9; // px
// Collision weight: a button moves this much less than a weight 1 label.
export const ACTION_BUTTON_WEIGHT = 10;
// Fraction of the pill white in the plus and minus disc fill, the rest is the button color.
export const BUTTON_DISC_WHITE_FRACTION = 0.96;
// Teeth of the cog symbol.
export const COG_TEETH_COUNT = 8;
// Inner circle radius as a fraction of the outer.
export const COG_INNER_RADIUS_FACTOR = 0.62;
// Thick circle and teeth, thicker than the short teeth are long.
export const ACTION_BUTTON_COG_LINE_WIDTH = 3.5; // px

export type LabelOptions = {
  fontSizePx?: number;
  // Screen distance from the anchor along the direction.
  offsetPx?: number;
  // Extra offset in editor coordinates (metres and zoom-scaled px), e.g. the
  // annotation highlight band clearance.
  extraOffset?: number;
  // Multiplier on the frame alpha for the background only.
  alpha?: number;
  // Multiplier on the frame alpha for the text only.
  textAlpha?: number;
  // Pill background color and opacity, defaulting to #fafafb at 80%.
  background?: string;
  backgroundAlpha?: number;
  // Text color, defaulting to the label text color.
  textColor?: string;
  // Line from the anchor to the pill center, drawn above the pill backdrop
  // and under the pill foreground.
  connector?: boolean;
  // Canvas-space counter-rotation about the label position: the pill and text
  // stay upright while the canvas rotates around the rink.
  rotation?: number;
};

// Collision shape: a pill approximated as a capsule, circles degenerate to discs.
type Capsule = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radius: number;
};

export abstract class CanvasLabel {
  readonly text: string;
  readonly fontSizePx: number;
  readonly alpha: number;
  readonly textAlpha: number;
  readonly textColor: string;
  // Anchor in canvas units and unit direction away from it: the home position
  // sits at the anchor offset along the direction right past the label edge.
  protected readonly anchorX: number;
  protected readonly anchorY: number;
  private readonly directionX: number;
  private readonly directionY: number;
  private readonly offsetCanvas: number;
  protected readonly zoom: number;
  protected textWidth = 0;
  protected textHeight = 0;
  // Half extents of the background, canvas units.
  protected halfA = 0;
  protected halfB = 0;
  protected backgroundColor = PILL_COLOR;
  protected backgroundAlpha = PILL_OPACITY;
  // Line from the anchor to the pill center, drawn above the pill backdrop
  // and under the pill foreground.
  protected readonly connector: boolean;
  protected readonly rotation: number;
  // Home position (supposed location) and resolved position, canvas units.
  protected homeX = 0;
  protected homeY = 0;
  protected x = 0;
  protected y = 0;
  protected empty = true;

  constructor(text: string, point: Vector<2>, direction: Vector<2> | null, zoom: number, options: LabelOptions = {}) {
    this.text = text;
    this.fontSizePx = options.fontSizePx ?? LABEL_FONT_SIZE;
    this.alpha = options.alpha ?? 1;
    this.textAlpha = options.textAlpha ?? 1;
    this.textColor = options.textColor ?? LABEL_TEXT_COLOR;
    this.backgroundColor = options.background ?? PILL_COLOR;
    this.connector = options.connector ?? false;
    this.rotation = options.rotation ?? 0;
    this.backgroundAlpha = options.backgroundAlpha ?? PILL_OPACITY;
    this.zoom = zoom;
    this.anchorX = point.x * CANVAS_SCALE;
    this.anchorY = -point.y * CANVAS_SCALE;
    this.directionX = direction ? direction.x : 0;
    this.directionY = direction ? -direction.y : 0;
    // extraOffset comes from the editor in canvas units (metres and zoom-scaled px),
    // so it gets the same CANVAS_SCALE conversion as the px offset.
    this.offsetCanvas =
      ((options.offsetPx ?? LABEL_OFFSET) * CANVAS_SCALE) / zoom + (options.extraOffset ?? 0) * CANVAS_SCALE;
  }

  measure(ctx: CanvasRenderingContext2DSized): void {
    ctx.font = this.font();
    const metrics = ctx.measureText(this.text);
    this.textWidth = metrics.width;
    this.textHeight = (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0);
    this.empty = this.textWidth === 0 && this.textHeight === 0;
    const { a, b } = this.computeExtents();
    this.halfA = a;
    this.halfB = b;
    if (this.directionX === 0 && this.directionY === 0) {
      this.homeX = this.anchorX;
      this.homeY = this.anchorY;
    } else {
      const total = this.offsetCanvas + envelopeSupport(this.directionX, this.directionY, a, b);
      this.homeX = this.anchorX + this.directionX * total;
      this.homeY = this.anchorY + this.directionY * total;
    }
    this.x = this.homeX;
    this.y = this.homeY;
  }

  // Half extents of the background in canvas units, for positioning and collision.
  protected abstract computeExtents(): { a: number; b: number };

  // Half extents of a pill background, 20% larger than the text plus padding.
  protected pillExtents(): { a: number; b: number } {
    const pad = backgroundPadding(this.zoom, PILL_PADDING);
    return {
      a: (this.textWidth / 2) * PILL_SIZE_FACTOR + pad,
      b: (this.textHeight / 2) * PILL_SIZE_FACTOR + pad,
    };
  }

  protected abstract drawBackground(ctx: CanvasRenderingContext2DSized): void;

  private font(): string {
    return `${(this.fontSizePx * CANVAS_SCALE) / this.zoom}px ${CANVAS_FONT}`;
  }

  draw(ctx: CanvasRenderingContext2DSized): void {
    if (this.empty) return;
    ctx.font = this.font();
    const previousAlpha = ctx.globalAlpha;
    ctx.save();
    // The pill and text counter-rotate about the label position, so they stay
    // upright while the canvas rotates around the rink.
    if (this.rotation !== 0) {
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.translate(-this.x, -this.y);
    }
    ctx.globalAlpha = previousAlpha * this.alpha;
    this.drawBackground(ctx);
    ctx.fillStyle = this.textColor;
    // The text opacity stays independent of the background opacity.
    ctx.globalAlpha = previousAlpha * this.textAlpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = previousAlpha;
    ctx.restore();
  }

  isVisible(): boolean {
    return !this.empty;
  }

  // Resolved position in canvas units, for hit testing after collision resolution.
  getResolvedCanvasPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  getCollisionCapsule(): Capsule {
    // The collision radius grows past the background, so resolved pills keep a gap.
    const radius = this.halfB + (LABEL_COLLISION_PADDING * CANVAS_SCALE) / this.zoom;
    const straight = Math.max(0, this.halfA - this.halfB);
    return {
      x0: this.x - straight,
      y0: this.y,
      x1: this.x + straight,
      y1: this.y,
      radius,
    };
  }

  // Relative collision weight: a heavier label moves less when resolving.
  getCollisionWeight(): number {
    return 1;
  }

  moveBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    const limit = LABEL_ANCHOR_LIMIT * this.halfB;
    const offX = this.x - this.homeX;
    const offY = this.y - this.homeY;
    const dist = Math.hypot(offX, offY);
    if (dist > limit) {
      const scale = limit / dist;
      this.x = this.homeX + offX * scale;
      this.y = this.homeY + offY * scale;
    }
  }
}

function envelopeSupport(ux: number, uy: number, a: number, b: number): number {
  return 1 / Math.hypot(ux / a, uy / b);
}

// Padding between the text and a background shaped by the label, screen px to canvas units.
function backgroundPadding(zoom: number, screenPadding: number): number {
  return (screenPadding * CANVAS_SCALE) / zoom;
}

// Disc color of a plus or minus button: the pill white with a slight tint of the button color.
export function buttonDiscColor(color: string): string {
  const [tintR, tintG, tintB] = parseHexColor(color);
  const [whiteR, whiteG, whiteB] = parseHexColor(PILL_COLOR);
  const w = BUTTON_DISC_WHITE_FRACTION;
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${toHex(whiteR * w + tintR * (1 - w))}${toHex(whiteG * w + tintG * (1 - w))}${toHex(whiteB * w + tintB * (1 - w))}`;
}

// Channels of a hex color, with 3-digit and 6-digit forms supported.
function parseHexColor(color: string): [number, number, number] {
  const digits = color.slice(1);
  if (digits.length === 3) {
    return digits.split("").map((digit) => parseInt(digit + digit, 16)) as [number, number, number];
  }
  return [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16)) as [number, number, number];
}

// Rounded pill via path plus fill.
function fillPill(ctx: CanvasRenderingContext2DSized, x: number, y: number, a: number, b: number): void {
  const r = b;
  const left = x - a;
  const right = x + a;
  const top = y - b;
  const bottom = y + b;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(right - r, top);
  ctx.arc(right - r, y, r, -Math.PI / 2, 0);
  ctx.lineTo(right, bottom - r);
  ctx.arc(right - r, y, r, 0, Math.PI / 2);
  ctx.lineTo(left + r, bottom);
  ctx.arc(left + r, y, r, Math.PI / 2, Math.PI);
  ctx.lineTo(left, top + r);
  ctx.arc(left + r, y, r, Math.PI, (3 * Math.PI) / 2);
  ctx.fill();
}

export function drawPillBackground(
  ctx: CanvasRenderingContext2DSized,
  x: number,
  y: number,
  a: number,
  b: number,
  color: string = PILL_COLOR,
  opacity: number = PILL_OPACITY,
  backdropPad: number = 0,
): void {
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * opacity;
  if (backdropPad > 0) {
    // The backdrop is the pill 1px larger in radius, drawn in the rink color
    // at the same configured opacity as the pill background.
    if (PILL_RENDER_MODE === "stroke") {
      ctx.strokeStyle = RINK_COLOR;
      ctx.lineWidth = 2 * (b + backdropPad);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - (a - b), y);
      ctx.lineTo(x + (a - b), y);
      ctx.stroke();
    } else {
      ctx.fillStyle = RINK_COLOR;
      fillPill(ctx, x, y, a + backdropPad, b + backdropPad);
    }
  }
  if (PILL_RENDER_MODE === "stroke") {
    ctx.strokeStyle = color;
    // Thick stroked line with round caps: the caps form the rounded ends.
    ctx.lineWidth = 2 * b;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - (a - b), y);
    ctx.lineTo(x + (a - b), y);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    fillPill(ctx, x, y, a, b);
  }
  ctx.globalAlpha = previousAlpha;
}

// Pill background. A null direction keeps the label centered on the anchor.
export class PillLabel extends CanvasLabel {
  protected computeExtents(): { a: number; b: number } {
    return this.pillExtents();
  }

  // Isosceles triangle connector: pointed at the anchor, base at the pill center.
  // A first rink-stroked triangle, then the solid pill-colored one above it, at
  // the label alpha only.
  private drawConnector(ctx: CanvasRenderingContext2DSized): void {
    const baseHalf = backgroundPadding(this.zoom, PILL_CONNECTOR_BASE / 2);
    const dx = this.x - this.anchorX;
    const dy = this.y - this.anchorY;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy * baseHalf;
    const py = ux * baseHalf;
    const apexX = this.anchorX;
    const apexY = this.anchorY;
    const base1X = this.x + px;
    const base1Y = this.y + py;
    const base2X = this.x - px;
    const base2Y = this.y - py;
    ctx.strokeStyle = RINK_COLOR;
    ctx.lineWidth = backgroundPadding(this.zoom, 1);
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(base1X, base1Y);
    ctx.lineTo(base2X, base2Y);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = this.backgroundColor;
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(base1X, base1Y);
    ctx.lineTo(base2X, base2Y);
    ctx.closePath();
    ctx.fill();
  }

  protected drawBackground(ctx: CanvasRenderingContext2DSized): void {
    const backdrop = backgroundPadding(this.zoom, PILL_BACKDROP_PADDING);
    if (!this.connector) {
      drawPillBackground(
        ctx,
        this.x,
        this.y,
        this.halfA,
        this.halfB,
        this.backgroundColor,
        this.backgroundAlpha,
        backdrop,
      );
      return;
    }
    drawPillBackground(
      ctx,
      this.x,
      this.y,
      this.halfA,
      this.halfB,
      this.backgroundColor,
      this.backgroundAlpha,
      backdrop,
    );
    // The triangle stays glued to the anchor: drawn without the upright
    // counter-rotation, its endpoints rotate with the canvas together.
    if (this.rotation !== 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(-this.rotation);
      ctx.translate(-this.x, -this.y);
    }
    this.drawConnector(ctx);
    if (this.rotation !== 0) ctx.restore();
    // The pill foreground renders above the triangle stroke, so the rink
    // outline never crosses the pill surface.
    drawPillBackground(ctx, this.x, this.y, this.halfA, this.halfB, this.backgroundColor, this.backgroundAlpha, 0);
  }
}

// White pill background, as used by timing time labels.
export class WhitePillLabel extends CanvasLabel {
  protected computeExtents(): { a: number; b: number } {
    return this.pillExtents();
  }

  protected drawBackground(ctx: CanvasRenderingContext2DSized): void {
    drawPillBackground(
      ctx,
      this.x,
      this.y,
      this.halfA,
      this.halfB,
      "white",
      1,
      backgroundPadding(this.zoom, PILL_BACKDROP_PADDING),
    );
  }
}

// White circle background, as used by timing beat labels.
export class WhiteCircleLabel extends CanvasLabel {
  protected computeExtents(): { a: number; b: number } {
    const pad = backgroundPadding(this.zoom, CIRCLE_LABEL_PADDING);
    const radius = Math.max(
      Math.hypot(this.textWidth, this.textHeight) / 2 + pad,
      (CIRCLE_LABEL_MIN_RADIUS * CANVAS_SCALE) / this.zoom,
    );
    return { a: radius, b: radius };
  }

  protected drawBackground(ctx: CanvasRenderingContext2DSized): void {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.halfA, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// An action button drawn as a label: a disc with a light tint of the symbol
// color, a saturated outline and symbol, and no triangle pointer. The anchor is
// the home position, so collision keeps the button near its anchor and moves it
// much less than other labels.
export abstract class ActionButtonLabel extends CanvasLabel {
  protected readonly color: string;
  protected drawsDisc = true;

  constructor(point: Vector<2>, zoom: number, color: string) {
    super("", point, null, zoom);
    this.color = color;
  }

  // A button has no text: the extents are the drawn disc radius.
  measure(_ctx: CanvasRenderingContext2DSized): void {
    this.textWidth = 0;
    this.textHeight = 0;
    this.empty = false;
    const radius = (ACTION_BUTTON_RADIUS * CANVAS_SCALE) / this.zoom;
    this.halfA = radius;
    this.halfB = radius;
    this.homeX = this.anchorX;
    this.homeY = this.anchorY;
    this.x = this.homeX;
    this.y = this.homeY;
  }

  getCollisionWeight(): number {
    return ACTION_BUTTON_WEIGHT;
  }

  // These two stay abstract on CanvasLabel for the text sized labels; a button
  // replaces the whole pipeline with measure and draw.
  protected computeExtents(): { a: number; b: number } {
    return { a: this.halfA, b: this.halfB };
  }

  protected drawBackground(_ctx: CanvasRenderingContext2DSized): void {
    // Not used, because draw paints the disc and the symbol directly.
  }

  draw(ctx: CanvasRenderingContext2DSized): void {
    const previousAlpha = ctx.globalAlpha;
    ctx.save();
    if (this.drawsDisc) {
      // The opaque disc keeps the symbol readable over any drawing.
      ctx.globalAlpha = previousAlpha * this.alpha;
      ctx.fillStyle = buttonDiscColor(this.color);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.halfA, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = previousAlpha * this.alpha;
    this.drawGlyph(ctx);
    ctx.restore();
  }

  // The saturated circle outline of the plus and minus buttons.
  protected strokeGlyphFrame(ctx: CanvasRenderingContext2DSized): void {
    ctx.strokeStyle = this.color;
    ctx.lineWidth = (ACTION_BUTTON_LINE_WIDTH * CANVAS_SCALE) / this.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.halfA, 0, 2 * Math.PI);
    ctx.stroke();
  }

  protected abstract drawGlyph(ctx: CanvasRenderingContext2DSized): void;
}

// Plus-in-circle button.
export class PlusButtonLabel extends ActionButtonLabel {
  protected drawGlyph(ctx: CanvasRenderingContext2DSized): void {
    this.strokeGlyphFrame(ctx);
    const half = ((ACTION_BUTTON_SYMBOL_LENGTH / 2) * CANVAS_SCALE) / this.zoom;
    ctx.beginPath();
    ctx.moveTo(this.x - half, this.y);
    ctx.lineTo(this.x + half, this.y);
    ctx.moveTo(this.x, this.y - half);
    ctx.lineTo(this.x, this.y + half);
    ctx.stroke();
  }
}

// Minus-in-circle button.
export class MinusButtonLabel extends ActionButtonLabel {
  protected drawGlyph(ctx: CanvasRenderingContext2DSized): void {
    this.strokeGlyphFrame(ctx);
    const half = ((ACTION_BUTTON_SYMBOL_LENGTH / 2) * CANVAS_SCALE) / this.zoom;
    ctx.beginPath();
    ctx.moveTo(this.x - half, this.y);
    ctx.lineTo(this.x + half, this.y);
    ctx.stroke();
  }
}

// Cog button. The thick inner circle and the teeth form the saturated outline;
// no disc background and no extra outer ring, since that looked cluttered.
export class CogButtonLabel extends ActionButtonLabel {
  constructor(point: Vector<2>, zoom: number, color: string) {
    super(point, zoom, color);
    this.drawsDisc = false;
  }

  protected drawGlyph(ctx: CanvasRenderingContext2DSized): void {
    ctx.strokeStyle = this.color;
    ctx.lineWidth = (ACTION_BUTTON_COG_LINE_WIDTH * CANVAS_SCALE) / this.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const inner = this.halfA * COG_INNER_RADIUS_FACTOR;
    ctx.beginPath();
    ctx.arc(this.x, this.y, inner, 0, 2 * Math.PI);
    ctx.stroke();
    for (let i = 0; i < COG_TEETH_COUNT; i++) {
      const angle = (i / COG_TEETH_COUNT) * 2 * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(this.x + cos * inner, this.y + sin * inner);
      ctx.lineTo(this.x + cos * this.halfA, this.y + sin * this.halfA);
      ctx.stroke();
    }
  }
}

// Collector for the labels of one frame: measure all, resolve collisions once, draw all.
export class LabelLayer {
  private labels: CanvasLabel[] = [];

  add(label: CanvasLabel): void {
    this.labels.push(label);
  }

  resolveAndDraw(ctx: CanvasRenderingContext2DSized): void {
    const labels = this.labels;
    this.labels = [];
    if (labels.length === 0) return;
    for (const label of labels) label.measure(ctx);
    this.resolveCollisions(labels);
    for (const label of labels) label.draw(ctx);
  }

  private resolveCollisions(labels: CanvasLabel[]): void {
    if (LABEL_PUSH_FACTOR <= 0) return;
    for (let iteration = 0; iteration < LABEL_COLLISION_ITERATIONS; iteration++) {
      for (let i = 0; i < labels.length - 1; i++) {
        const a = labels[i]!;
        if (!a.isVisible()) continue;
        for (let j = i + 1; j < labels.length; j++) {
          const b = labels[j]!;
          if (!b.isVisible()) continue;
          const ca = a.getCollisionCapsule();
          const cb = b.getCollisionCapsule();
          const separation = capsuleSeparation(ca, cb);
          if (!separation) continue;
          // Heavier labels move less: the split is inverse to the weights.
          const total = separation.overlap * LABEL_PUSH_FACTOR;
          const weightA = a.getCollisionWeight();
          const weightB = b.getCollisionWeight();
          const shareA = weightB / (weightA + weightB);
          a.moveBy(-separation.dx * total * shareA, -separation.dy * total * shareA);
          b.moveBy(separation.dx * total * (1 - shareA), separation.dy * total * (1 - shareA));
        }
      }
    }
  }
}

const SEGMENT_EPSILON = 1e-9;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Closest points between the two capsule segments, standard clamped solve.
function closestSegmentDistance(a: Capsule, b: Capsule): { dx: number; dy: number; distance: number } {
  const d1x = a.x1 - a.x0;
  const d1y = a.y1 - a.y0;
  const d2x = b.x1 - b.x0;
  const d2y = b.y1 - b.y0;
  const rx = a.x0 - b.x0;
  const ry = a.y0 - b.y0;
  const a1 = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s: number;
  let t: number;
  if (a1 <= SEGMENT_EPSILON && e <= SEGMENT_EPSILON) {
    s = 0;
    t = 0;
  } else if (a1 <= SEGMENT_EPSILON) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= SEGMENT_EPSILON) {
      t = 0;
      s = clamp01(-c / a1);
    } else {
      const bDim = d1x * d2x + d1y * d2y;
      const denom = a1 * e - bDim * bDim;
      s = denom > SEGMENT_EPSILON ? clamp01((bDim * f - c * e) / denom) : 0;
      t = (bDim * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a1);
      } else if (t > 1) {
        t = 1;
        s = clamp01((bDim - c) / a1);
      }
    }
  }
  const dx = b.x0 + d2x * t - (a.x0 + d1x * s);
  const dy = b.y0 + d2y * t - (a.y0 + d1y * s);
  return { dx, dy, distance: Math.hypot(dx, dy) };
}

export function capsuleSeparation(a: Capsule, b: Capsule): { dx: number; dy: number; overlap: number } | null {
  const closest = closestSegmentDistance(a, b);
  const overlap = a.radius + b.radius - closest.distance;
  if (overlap <= 0) return null;
  if (closest.distance <= SEGMENT_EPSILON) {
    // Degenerate overlap: push apart along the x axis deterministically.
    return { dx: 1, dy: 0, overlap };
  }
  return { dx: closest.dx / closest.distance, dy: closest.dy / closest.distance, overlap };
}
