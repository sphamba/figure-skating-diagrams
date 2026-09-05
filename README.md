# Figure Skating Diagrams

A web application to create and view figure skating diagrams. Built with Vue 3, Vite, TypeScript, and Pinia.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/layouts/MainLayout.vue` | Main page layout (header, content, footer) |
| `src/views/` | Route pages. `HomeView.vue` is the blank main page |
| `src/styles/theme.scss` | SCSS design tokens (colors, spacing, typography) |
| `src/stores/dummy.ts` | Dummy Pinia store (composition API) |
| `src/engine/` | Figure skating diagram engine |
| `src/components/DiagramViewer.vue` | Canvas-based diagram viewer |
| `.github/workflows/deploy.yml` | Builds and deploys to GitHub Pages |

## Requirements

- Node.js 20.19 or newer, or Node.js 22.12 or newer
- npm

## Setup

```sh
npm install
```

## Development server

Start a local server that watches your files and hot-reloads changes:

```sh
npm run dev
```

Open http://localhost:5173/ in your browser.

## Test

Run the unit tests with Vitest in watch mode. Vitest watches your files and re-runs the affected tests when you save changes:

```sh
npm run test
```

Run the tests once and exit (useful for CI):

```sh
npm run test:unit
```

## Build

Type-check, compile, and minify for production into the `dist/` folder:

```sh
npm run build
```

Preview the production build locally:

```sh
npm run preview
```

## Lint and format

```sh
npm run lint
npm run format
```

## Deploy to GitHub Pages

The project builds and deploys automatically with GitHub Actions.

### What the workflow does

The `.github/workflows/deploy.yml` file runs every time you push to `main`. It has two jobs.

| Job | What it does |
| --- | --- |
| Build | Checkout the code, install dependencies, run tests, type-check, and build. It uploads the `dist/` folder as a Pages artifact |
| Deploy | Takes the uploaded artifact and publishes it to the `github-pages` environment |

The Vite `base` option is set to `/figure-skating-diagrams/` when a GitHub Actions job builds the project. This path matches the repository name, so the asset URLs are correct under the Pages subfolder.

### One-time setup (do this once on GitHub)

Follow these steps in the GitHub web interface.

1. Push this repository to GitHub: `sphamba/figure-skating-diagrams`.
2. On the GitHub website, open the repository.
3. Click `Settings`.
4. In the left menu, click `Pages` (under `Code and automation`).
5. Under `Build and deployment`, set `Source` to `GitHub Actions`. Do not pick a branch here. The workflow is the source.
6. Push any commit to `main`, or open the `Actions` tab and run the `Deploy to GitHub Pages` workflow manually.
7. Wait for both jobs to finish. The build job uploads the artifact, and the deploy job publishes it.
8. The site is available at `https://sphamba.github.io/figure-skating-diagrams/`.

The deploy job reports the live URL in the workflow summary (the `environment.url` value).

### Note about the router

The router uses hash mode (`createWebHashHistory`). Hash mode works fully on GitHub Pages, including direct deep links (for example `/#/about`). The URL contains a `#` character, but no 404 errors occur on reload.

### Recommended IDE setup

[VS Code](https://code.visualstudio.com/) with [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar). Disable Vetur.
