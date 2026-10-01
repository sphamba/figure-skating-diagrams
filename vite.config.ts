import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

const gzipAsync = promisify(gzip);

type DiagramTreeFile = { name: string; path: string };
type DiagramTreeFolder = { name: string; files: DiagramTreeFile[]; folders: DiagramTreeFolder[] };

// Scans public/diagrams/ when the config loads, so dev and build both embed the same tree.
async function scanDiagramTree(absolute: string, relative: string): Promise<DiagramTreeFolder> {
  const entries = await readdir(absolute, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files: DiagramTreeFile[] = [];
  const folders: DiagramTreeFolder[] = [];
  for (const entry of entries) {
    const relativePath = `${relative}/${entry.name}`;
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push({ name: entry.name.replace(/\.json$/, ""), path: relativePath });
    } else if (entry.isDirectory()) {
      folders.push(await scanDiagramTree(`${absolute}/${entry.name}`, relativePath));
    }
  }
  return { name: relative.split("/").at(-1) ?? relative, files, folders };
}

const VIRTUAL_DIAGRAM_TREE = "virtual:diagram-tree";

// In-place gzip keeps the diagram names and URLs while the app decompresses by
// gzip magic bytes, and the PWA precache stores the compressed bytes.
async function gzipDiagramFiles(absolute: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) {
      await gzipDiagramFiles(path);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      const json = await readFile(path);
      const gzipped = await gzipAsync(json);
      if (gzipped.length < json.length) await writeFile(path, gzipped);
    }
  }
}

function gzipDiagramsPlugin(): Plugin {
  let outDir = "";

  return {
    name: "gzip-diagrams",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      sequential: true,
      order: "pre",
      async handler() {
        await gzipDiagramFiles(join(outDir, "diagrams"));
      },
    },
  };
}

function diagramTreePlugin(): Plugin {
  const diagramsRoot = fileURLToPath(new URL("./public/diagrams", import.meta.url));
  const resolvedId = `\0${VIRTUAL_DIAGRAM_TREE}`;

  return {
    name: "diagram-tree",
    resolveId(id) {
      if (id === VIRTUAL_DIAGRAM_TREE) return resolvedId;
      return null;
    },
    async load(id) {
      if (id !== resolvedId) return null;
      const tree = await scanDiagramTree(diagramsRoot, "diagrams");
      return `export default ${JSON.stringify(tree)};`;
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the app from a subfolder when built in CI.
  base: process.env.GITHUB_ACTIONS ? "/figure-skating-diagrams/" : "/",
  plugins: [
    vue(),
    diagramTreePlugin(),
    gzipDiagramsPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Figure Skating Diagrams",
        short_name: "Skating Diagrams",
        description: "Draw and animate step and pattern diagrams for figure skating, then open them offline.",
        theme_color: "#0ea5e9",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell, fonts, and every bundled diagram JSON.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,ico,woff,woff2,json}"],
      },
      // The glob patterns already cover the manifest icons.
      includeManifestIcons: false,
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
