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

// vue-router hands the view the query value decoded once, which is the only
// decode the p= format relies on.
function receivedPath(url: string): string {
  return decodeURIComponent(url.split("#/?p=")[1]);
}

test("buildSharePathUrl returns a fragment URL with the escaped bare path as its p payload", () => {
  const share = buildSharePathUrl(PATH_EXAMPLE);
  expect(share).not.toBeNull();
  const { url, chars } = share!;
  expect(url.startsWith(`${window.location.origin}${import.meta.env.BASE_URL}`)).toBe(true);
  expect(url).toContain("#/?p=");
  expect(url).not.toContain("#/?d=");
  expect(chars).toBe(url.length);
  const bare = PATH_EXAMPLE.slice(DIAGRAMS_PREFIX.length);
  const payload = url.split("#/?p=")[1];
  expect(payload).toBe(encodeURIComponent(bare));
  expect(payload.split("%2F")).toHaveLength(bare.split("/").length);
  expect(payload.split("%20")).toHaveLength(bare.split(" ").length);
  expect(payload).not.toContain("diagrams%2F");
  expect(decodeSharePath(receivedPath(url))).toBe(PATH_EXAMPLE);
});

test("buildSharePathUrl round-trips a non-ASCII path with spaces", () => {
  const path = "diagrams/Test/Éléments/Porté é.json";
  const { url } = buildSharePathUrl(path)!;
  expect(url.split("#/?p=")[1]).toBe(encodeURIComponent(path.slice(DIAGRAMS_PREFIX.length)));
  expect(decodeSharePath(receivedPath(url))).toBe(path);
});

test("decodeSharePath rejects a payload that points outside the diagram tree", () => {
  expect(decodeSharePath("")).toBeNull();
  expect(decodeSharePath("/etc/passwd")).toBeNull();
  expect(decodeSharePath("https://evil.example/x.json")).toBeNull();
  expect(decodeSharePath("../../index.html")).toBeNull();
  expect(decodeSharePath("a\\b.json")).toBeNull();
});

// The URL parser strips raw tabs and newlines before it normalizes dot
// segments, and a file server can trim dots, spaces and path parameters from a
// segment, so every one of those forms is rejected in both directions.
test("both directions reject a bare path that a parser or a file server would rewrite", () => {
  const rejected = [
    ".\t./index.html",
    ".\r./index.html",
    ".\n./index.html",
    "..\u0000/index.html",
    ".. /index.html",
    " x.json",
    "..;/x.json",
    ".../x.json",
  ];
  for (const bare of rejected) {
    expect(decodeSharePath(bare), `decodeSharePath(${JSON.stringify(bare)})`).toBeNull();
    expect(buildSharePathUrl(`${DIAGRAMS_PREFIX}${bare}`), `buildSharePathUrl(${JSON.stringify(bare)})`).toBeNull();
  }
});

// Nothing decodes a segment any more, so a percent escape that the router left
// in the text is a literal character of the file name.
test("both directions accept a percent that survives into the bare path", () => {
  const bare = "100%.json";
  expect(decodeSharePath(bare)).toBe(`${DIAGRAMS_PREFIX}${bare}`);
  const url = buildSharePathUrl(`${DIAGRAMS_PREFIX}${bare}`)!.url;
  expect(url).toContain("#/?p=100%25.json");
  expect(decodeSharePath(receivedPath(url))).toBe(`${DIAGRAMS_PREFIX}${bare}`);
});

// Both directions must agree, or a sender would emit a link the receiver refuses.
test("both directions reject a bare path that repeats the diagrams prefix", () => {
  expect(decodeSharePath(DIAGRAMS_PREFIX + "x.json")).toBeNull();
  expect(buildSharePathUrl(DIAGRAMS_PREFIX + DIAGRAMS_PREFIX + "x.json")).toBeNull();
});

// The server resolves the escapes before the file is read and the URL parser
// reads %2e as a dot segment, so both directions must reject these instead of
// sharing a path the receiver resolves to something else.
test("both directions reject a bare path with dot segments or markers", () => {
  const rejected = ["%2e%2e/%2e%2e/index.html", "%2E%2E/x.json", "x.json?y=1", "x.json#frag"];
  for (const bare of rejected) {
    expect(decodeSharePath(bare), `decodeSharePath(${bare})`).toBeNull();
    expect(buildSharePathUrl(`${DIAGRAMS_PREFIX}${bare}`), `buildSharePathUrl(${bare})`).toBeNull();
  }
});

test("buildSharePathUrl returns null without the diagrams prefix", () => {
  expect(buildSharePathUrl("/etc/passwd")).toBeNull();
  expect(buildSharePathUrl("Moves in the field/x.json")).toBeNull();
  expect(buildSharePathUrl(DIAGRAMS_PREFIX)).toBeNull();
});
