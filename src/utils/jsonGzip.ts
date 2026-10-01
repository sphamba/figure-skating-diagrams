// Diagram JSON is served gzip-compressed in production builds and downloaded
// as .json.gz, so every read sniffs the gzip magic bytes and decompresses when
// needed; plain JSON passes through unchanged.
const GZIP_MAGIC = [0x1f, 0x8b] as const;

export function isGzipPayload(bytes: Uint8Array): boolean {
  return bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

export async function decodeJsonFile(payload: ArrayBuffer): Promise<unknown> {
  const bytes = new Uint8Array(payload);
  let stream = new Response(bytes).body!;
  if (isGzipPayload(bytes) && typeof DecompressionStream !== "undefined") {
    stream = stream.pipeThrough(new DecompressionStream("gzip"));
  }
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

export async function gzipText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof CompressionStream === "undefined") return new TextEncoder().encode(text);
  const stream = new Response(text).body!.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeJsonFile(text: string): Promise<Blob> {
  if (typeof CompressionStream === "undefined") {
    return new Blob([text], { type: "application/json" });
  }
  return new Blob([await gzipText(text)], { type: "application/gzip" });
}

export function gzipFileName(name: string): string {
  if (name.endsWith(".gz")) return name;
  return `${name.replace(/\.json$/i, "")}.json.gz`;
}
