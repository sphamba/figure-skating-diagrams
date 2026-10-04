import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  base64UrlToBytes,
  buildShareUrl,
  bytesToBase64Url,
  decodeShareParam,
  SHARE_URL_MAX_CHARS,
} from "@/utils/shareUrl";

const testPattern = JSON.parse(readFileSync(resolve(process.cwd(), "tests/test-pattern.json"), "utf-8"));

test("bytesToBase64Url uses the URL-safe alphabet without padding", () => {
  const bytes = new TextEncoder().encode("json with accents é and symbols {\"a\": 1}");
  const encoded = bytesToBase64Url(bytes);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
  expect(encoded).not.toContain("=");
  expect(encoded).not.toContain("+");
  expect(encoded).not.toContain("/");
});

test("base64UrlToBytes round-trips bytesToBase64Url", () => {
  const bytes = new TextEncoder().encode("arbitrary payload bytes");
  expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes));
});

test("buildShareUrl returns a fragment URL with the editor route and a d payload", async () => {
  const text = JSON.stringify(testPattern);
  const { url, chars } = await buildShareUrl(text);
  expect(url.startsWith(`${window.location.origin}${import.meta.env.BASE_URL}`)).toBe(true);
  expect(url).toContain("#/?d=");
  expect(chars).toBe(url.length);
});

test("buildShareUrl and decodeShareParam round-trip a diagram", async () => {
  const text = JSON.stringify(testPattern);
  const { url } = await buildShareUrl(text);
  const payload = url.split("#/?d=")[1];
  const json = await decodeShareParam(payload);
  expect(json).toEqual(testPattern);
});

test("decodeShareParam rejects on a corrupt payload", async () => {
  await expect(decodeShareParam("!!!corrupt!!!")).rejects.toThrow();
});

test("shareUrl still round-trips when CompressionStream is missing", async () => {
  const original = globalThis.CompressionStream;
  (globalThis as { CompressionStream?: unknown }).CompressionStream = undefined;
  try {
    const text = JSON.stringify(testPattern);
    const { url } = await buildShareUrl(text);
    const payload = url.split("#/?d=")[1];
    expect(await decodeShareParam(payload)).toEqual(testPattern);
  } finally {
    globalThis.CompressionStream = original;
  }
});

test("the share URL limit is exported", () => {
  expect(SHARE_URL_MAX_CHARS).toBe(8000);
});
