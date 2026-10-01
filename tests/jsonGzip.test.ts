import { expect, test } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeJsonFile, encodeJsonFile, gzipFileName, gzipText, isGzipPayload } from "@/utils/jsonGzip";

test("decodeJsonFile parses plain JSON bytes", async () => {
  const payload = new TextEncoder().encode(JSON.stringify({ name: "Diagram", sequences: [] }));
  const json = await decodeJsonFile(payload.buffer as ArrayBuffer);
  expect(json).toEqual({ name: "Diagram", sequences: [] });
});

test("decodeJsonFile decompresses gzip bytes", async () => {
  const diagram = { name: "Diagram", sequences: [{ path: { curves: [] } }] };
  const gzipped = gzipSync(Buffer.from(JSON.stringify(diagram)));
  const json = await decodeJsonFile(gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength));
  expect(json).toEqual(diagram);
});

test("gzipText round-trips through decodeJsonFile", async () => {
  const diagram = { name: "Diagram", sequences: [{ path: { curves: [] } }] };
  const gzipped = await gzipText(JSON.stringify(diagram));
  expect(isGzipPayload(gzipped)).toBe(true);
  const json = await decodeJsonFile(gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength));
  expect(json).toEqual(diagram);
});

test("encodeJsonFile returns a gzip blob", async () => {
  const text = JSON.stringify({
    name: "Diagram",
    sequences: Array.from({ length: 50 }, (_, i) => ({ path: { curves: [{ points: [i, i + 0.5] }] } })),
  });
  const blob = await encodeJsonFile(text);
  expect(blob.type).toBe("application/gzip");
  expect(blob.size).toBeLessThan(new TextEncoder().encode(text).length);
});

test("decodeJsonFile rejects on garbage bytes", async () => {
  const garbage = new TextEncoder().encode("not json");
  await expect(decodeJsonFile(garbage.buffer as ArrayBuffer)).rejects.toThrow();
});

test("gzipFileName appends .json.gz to plain names", () => {
  expect(gzipFileName("diagram.json")).toBe("diagram.json.gz");
  expect(gzipFileName("diagram")).toBe("diagram.json.gz");
  expect(gzipFileName("Diagram.JSON")).toBe("Diagram.json.gz");
});

test("gzipFileName keeps already-gzipped names", () => {
  expect(gzipFileName("diagram.json.gz")).toBe("diagram.json.gz");
  expect(gzipFileName("diagram.gz")).toBe("diagram.gz");
});
