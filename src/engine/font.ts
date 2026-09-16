import { CANVAS_FONT } from "./constants.js";

const FONT_SPEC = `16px ${CANVAS_FONT}`;

// Resolves even if loading fails offline.
export async function canvasFontReady(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return;
  try {
    await fonts.load(FONT_SPEC);
  } catch {
    return;
  }
  await fonts.ready;
}
