import { readdir } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

type DiagramTreeFile = { name: string; path: string }
type DiagramTreeFolder = { name: string; files: DiagramTreeFile[]; folders: DiagramTreeFolder[] }

// Scans public/diagrams/ when the config loads, so dev and build both embed the same tree.
async function scanDiagramTree(absolute: string, relative: string): Promise<DiagramTreeFolder> {
  const entries = await readdir(absolute, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  const files: DiagramTreeFile[] = []
  const folders: DiagramTreeFolder[] = []
  for (const entry of entries) {
    const relativePath = `${relative}/${entry.name}`
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push({ name: entry.name.replace(/\.json$/, ''), path: relativePath })
    } else if (entry.isDirectory()) {
      folders.push(await scanDiagramTree(`${absolute}/${entry.name}`, relativePath))
    }
  }
  return { name: relative.split('/').at(-1) ?? relative, files, folders }
}

const VIRTUAL_DIAGRAM_TREE = 'virtual:diagram-tree'

function diagramTreePlugin(): Plugin {
  const diagramsRoot = fileURLToPath(new URL('./public/diagrams', import.meta.url))
  const resolvedId = `\0${VIRTUAL_DIAGRAM_TREE}`

  return {
    name: 'diagram-tree',
    resolveId(id) {
      if (id === VIRTUAL_DIAGRAM_TREE) return resolvedId
      return null
    },
    async load(id) {
      if (id !== resolvedId) return null
      const tree = await scanDiagramTree(diagramsRoot, 'diagrams')
      return `export default ${JSON.stringify(tree)};`
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the app from a subfolder when built in CI.
  base: process.env.GITHUB_ACTIONS ? "/figure-skating-diagrams/" : "/",
  plugins: [
    vue(),
    vueDevTools(),
    diagramTreePlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
