import { decodeJsonFile, gzipText } from "@/utils/jsonGzip";

// A share link lives in the URL fragment, which browsers never send to the
// server. The limit guards against URL lengths that shorteners, QR codes
// and some apps cannot carry; the fragment itself has no server limit.
export const SHARE_URL_MAX_CHARS = 8000;

// A path share link points at a file in the public diagram tree. The payload
// holds the tree path without this prefix, as plain percent-encoded text so the
// link stays readable and editable by hand.
export const DIAGRAMS_PREFIX = "diagrams/";

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

// The payload is untrusted. The text checks cover what a file server does to a
// segment (trimming, path parameters, truncation) and the resolved target check
// covers what the URL parser does to the raw text (stripping tabs and newlines,
// and reading %2e as a dot segment, before it normalizes dot segments). Both
// must hold, and the fetch must stay on this origin inside the diagram folder.
function isShareablePath(path: string): boolean {
  if (
    path === "" ||
    path.startsWith("/") ||
    path.startsWith(DIAGRAMS_PREFIX) ||
    path.includes("\\") ||
    path.includes(":") ||
    path.includes("?") ||
    path.includes("#") ||
    /[\u0000-\u001f\u007f]/.test(path)
  )
    return false;
  const segments = path
    .split("/")
    .every(
      (segment) =>
        segment !== "" &&
        segment === segment.trim() &&
        !/[\u0000-\u001f\u007f;]/.test(segment) &&
        !segment.endsWith(".") &&
        segment !== "." &&
        segment !== "..",
    );
  if (!segments) return false;
  const target = new URL(import.meta.env.BASE_URL + DIAGRAMS_PREFIX + path, window.location.href);
  return (
    target.origin === window.location.origin && target.pathname.startsWith(import.meta.env.BASE_URL + DIAGRAMS_PREFIX)
  );
}

// Total by design: a path that cannot be shared returns null so the caller
// falls back to the inline gzip link instead of surfacing an error.
export function buildSharePathUrl(path: string): { url: string; chars: number } | null {
  if (!path.startsWith(DIAGRAMS_PREFIX)) return null;
  const bare = path.slice(DIAGRAMS_PREFIX.length);
  if (!isShareablePath(bare)) return null;
  // One escape pass over the whole path, so the slashes travel as %2F and
  // vue-router undoes exactly this encoding when it reads the query.
  const payload = encodeURIComponent(bare);
  const base = window.location.origin + import.meta.env.BASE_URL;
  const url = `${base}#/?p=${payload}`;
  return { url, chars: url.length };
}

// The router has already decoded the query value once, so this only validates.
export function decodeSharePath(value: string): string | null {
  if (!isShareablePath(value)) return null;
  return DIAGRAMS_PREFIX + value;
}
