import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  base64UrlToBytes,
  buildSharePathUrl,
  buildShareUrl,
  bytesToBase64Url,
  decodeShareParam,
  decodeSharePath,
  DIAGRAMS_PREFIX,
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

const PATH_EXAMPLE = "diagrams/Moves in the field/04. Juvenile/06. Forward Double Three-Turns.json";

test("buildSharePathUrl returns a fragment URL with the p payload and the stripped prefix", () => {
  const share = buildSharePathUrl(PATH_EXAMPLE);
  expect(share).not.toBeNull();
  const { url, chars } = share!;
  expect(url.startsWith(`${window.location.origin}${import.meta.env.BASE_URL}`)).toBe(true);
  expect(url).toContain("#/?p=");
  expect(url).not.toContain("#/?d=");
  expect(chars).toBe(url.length);
  const payload = url.split("#/?p=")[1];
  expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(payload).not.toContain("=");
  const bare = new TextDecoder().decode(base64UrlToBytes(payload));
  expect(bare.startsWith("diagrams/")).toBe(false);
  expect(decodeSharePath(payload)).toBe(PATH_EXAMPLE);
});

test("buildSharePathUrl round-trips a non-ASCII path with spaces", () => {
  const path = "diagrams/Test/Éléments/Porté é.json";
  const { url } = buildSharePathUrl(path)!;
  expect(decodeSharePath(url.split("#/?p=")[1])).toBe(path);
});

test("decodeSharePath rejects a payload that points outside the diagram tree", () => {
  const encoded = (raw: string) => bytesToBase64Url(new TextEncoder().encode(raw));
  expect(decodeSharePath(encoded(""))).toBeNull();
  expect(decodeSharePath(encoded("/etc/passwd"))).toBeNull();
  expect(decodeSharePath(encoded("https://evil.example/x.json"))).toBeNull();
  expect(decodeSharePath(encoded("../../index.html"))).toBeNull();
  expect(decodeSharePath(encoded("a\\b.json"))).toBeNull();
  expect(decodeSharePath("!!!corrupt!!!")).toBeNull();
});

// The URL parser strips raw tabs and newlines before it normalizes dot
// segments, and a file server can trim dots, spaces and path parameters from a
// decoded segment, so every one of those forms is rejected in both directions.
test("both directions reject a bare path that a parser or a file server would rewrite", () => {
  const encoded = (raw: string) => bytesToBase64Url(new TextEncoder().encode(raw));
  const rejected = [
    ".\t./index.html",
    ".\r./index.html",
    ".\n./index.html",
    "..\u0000/index.html",
    ".. /index.html",
    " x.json",
    "..;/x.json",
    "a%09b.json",
    "%00x.json",
    ".../x.json",
  ];
  for (const bare of rejected) {
    expect(decodeSharePath(encoded(bare)), `decodeSharePath(${JSON.stringify(bare)})`).toBeNull();
    expect(buildSharePathUrl(`${DIAGRAMS_PREFIX}${bare}`), `buildSharePathUrl(${JSON.stringify(bare)})`).toBeNull();
  }
});

// Both directions must agree, or a sender would emit a link the receiver refuses.
test("both directions reject a bare path that repeats the diagrams prefix", () => {
  const encoded = (raw: string) => bytesToBase64Url(new TextEncoder().encode(raw));
  expect(decodeSharePath(encoded(DIAGRAMS_PREFIX + "x.json"))).toBeNull();
  expect(buildSharePathUrl(DIAGRAMS_PREFIX + DIAGRAMS_PREFIX + "x.json")).toBeNull();
});

// The browser and the server normalize these before the file is read, so both
// directions must reject them instead of sharing a path the receiver refuses.
test("both directions reject a bare path with separators, dot segments or markers", () => {
  const encoded = (raw: string) => bytesToBase64Url(new TextEncoder().encode(raw));
  const rejected = ["%2e%2e/%2e%2e/index.html", "a%2fb.json", "x.json?y=1", "x.json#frag"];
  for (const bare of rejected) {
    expect(decodeSharePath(encoded(bare)), `decodeSharePath(${bare})`).toBeNull();
    expect(buildSharePathUrl(`${DIAGRAMS_PREFIX}${bare}`), `buildSharePathUrl(${bare})`).toBeNull();
  }
});

test("buildSharePathUrl returns null without the diagrams prefix", () => {
  expect(buildSharePathUrl("/etc/passwd")).toBeNull();
  expect(buildSharePathUrl("Moves in the field/x.json")).toBeNull();
  expect(buildSharePathUrl(DIAGRAMS_PREFIX)).toBeNull();
});
