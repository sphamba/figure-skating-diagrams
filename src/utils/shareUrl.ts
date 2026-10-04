import { decodeJsonFile, gzipText } from "@/utils/jsonGzip";

// A share link lives in the URL fragment, which browsers never send to the
// server. The limit guards against URL lengths that shorteners, QR codes
// and some apps cannot carry; the fragment itself has no server limit.
export const SHARE_URL_MAX_CHARS = 8000;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function buildShareUrl(json: string): Promise<{ url: string; chars: number }> {
  const payload = bytesToBase64Url(await gzipText(json));
  const base = window.location.origin + import.meta.env.BASE_URL;
  const url = `${base}#/?d=${payload}`;
  return { url, chars: url.length };
}

export async function decodeShareParam(value: string): Promise<unknown> {
  return decodeJsonFile(base64UrlToBytes(value).buffer as ArrayBuffer);
}
