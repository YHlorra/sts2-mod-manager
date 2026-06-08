# STS2 Mod Manager — Stack

## Project

- **Name**: `sts2-mod-manager` (`E:\Desktop\workspace\sts2-mod-manager`)
- **Purpose**: Slay the Spire 2 desktop mod manager — install, enable/disable, profile, translate, and launch mods.
- **Identifier**: `com.sts2.mod-manager` (`src-tauri/tauri.conf.json`)
- **Display name**: `STS2 Mod Manager`
- **Version**: package `1.0.0` / Tauri config `1.1.0`

## Runtimes

- **Electron**: `^29.4.6` (devDependency; main process = `main.js`, preload = `preload.js`)
- **Tauri**: `2` (Rust crate + `tauri-build 2`); `frontendDist` = `../dist-tauri` (`src-tauri/tauri.conf.json`)
- **Node target**: Webpack targets `electron-renderer` (`webpack.config.js`) and `web` (`webpack.tauri.config.js`); no `.nvmrc` or `engines` block in `package.json`; CI uses Node 20 (`build.yml`) and Node 22 (`build-windows.yml`)
- **Rust edition**: `2021` (`src-tauri/Cargo.toml`)

## Frontend

- **React**: `^18.2.0` + `react-dom ^18.2.0`
- **JSX transform**: `@babel/preset-react ^7.23.0`, `@babel/preset-env ^7.24.0`
- **Icons**: `lucide-react ^0.344.0` (used by `ModCard.jsx`, `Sidebar.jsx`)
- **CSS**: `tailwindcss ^3.4.1` compiled via `npx tailwindcss` from `src/index.css` → `src/output.css`
- **PostCSS pipeline**: `postcss-loader ^8.1.1` + `css-loader ^6.10.0` + `style-loader ^3.3.4` + `autoprefixer ^10.4.18`

## Renderer Entry Points

- `src/index.jsx` — Electron renderer (mounted into `src/index.html`)
- `src/index-tauri.jsx` — Tauri renderer (loads `./tauri-api`); output goes to `dist-tauri/renderer.js`
- `src/App.jsx` — top-level React component; imports 7 sibling components + lucide-react icons
- `src/tauri-api.js` — Tauri-only `invoke` wrappers
- Components: `Sidebar`, `ModCard`, `ModListItem`, `ModDetail`, `LogViewer`, `SaveManager`, `ProfileManager`, `TitleBar` (all in `src/components/`)
- Codegraph import scan confirms: 0 CommonJS `require` calls in renderer; all imports are ESM (`import React from 'react'`, `import { Foo } from 'lucide-react'`)

## Build Tooling

- **Bundler**: `webpack ^5.90.0` + `webpack-cli ^5.1.4`
- **Loaders**: `babel-loader ^9.1.3`
- **Concurrency**: `concurrently ^8.2.2` + `wait-on ^7.2.0` for the dev pipeline
- **Package manager**: pnpm — `pnpm-lock.yaml` + `pnpm-workspace.yaml` present (`E:\Desktop\workspace\sts2-mod-manager\pnpm-workspace.yaml` contains only `allowBuilds: { electron: false }`, no `packages:` array → single-root, not a monorepo)
- **npm fallback**: `package-lock.json` and `package.json` scripts also work; CI runs `npm ci`

## Output Paths

- `webpack.config.js` → `dist/renderer.js` (Electron build)
- `webpack.tauri.config.js` → `dist-tauri/renderer.js` (Tauri build)
- `tauri.conf.json` `build.frontendDist` = `"../dist-tauri"` (resolved to `E:\Desktop\workspace\sts2-mod-manager\dist-tauri`)

## Language Mix (codegraph-verified)

35 tracked files. Breakdown:

- `.js` (6): `main.js`, `preload.js`, `webpack.config.js`, `webpack.tauri.config.js`, `postcss.config.js`, `tailwind.config.js`
- `.jsx` (12): `App.jsx`, `index.jsx`, `index-tauri.jsx`, `tauri-api.js` in `src/`; 8 components in `src/components/`
- `.rs` (11): `main.rs`, `lib.rs`, `build.rs`, `config.rs`, `game.rs`, `logs.rs`, `mods.rs`, `profiles.rs`, `saves.rs`, `translate.rs`, `translations.rs` (all under `src-tauri/src/`)
- `.ts`/`.tsx`: 0 (renderer is pure JSX; no TypeScript)
- `main.js` is CommonJS (`const { contextBridge, ipcRenderer } = require('electron')` in `preload.js`; `require('adm-zip')` etc. in `main.js`)

## Key External Libraries (Runtime)

- `adm-zip ^0.5.10` — ZIP read/write in Electron main (`main.js`)
- `node-7z ^3.0.0` — 7z extraction in Electron main
- `node-unrar-js ^2.0.2` — RAR extraction in Electron main; `asarUnpack` in `package.json` keeps native binding outside the asar archive
- `react ^18.2.0`, `react-dom ^18.2.0`, `lucide-react ^0.344.0` — renderer

## Key External Libraries (Rust)

- `tauri = "2"` + `tauri-build = "2"` (Tauri 2 core)
- `tauri-plugin-dialog "2"`, `tauri-plugin-opener "2"`, `tauri-plugin-fs "2"` (desktop plugins)
- `tauri-plugin-single-instance "2"` (desktop only, non-mobile target)
- `zip = "2"` (default-features = false, `deflate` only) — ZIP support in Rust mods path (`src-tauri/src/mods.rs` lines 541, 583, 650)
- `unrar = "0.5"` — RAR support in Rust (`src-tauri/src/mods.rs` line 669: `use unrar::Archive;`)
- `sevenz-rust = "0.6"` — 7z support in Rust (`src-tauri/src/mods.rs` line 716: `use sevenz_rust::*;`)
- `reqwest = "0.12"` (json feature) — HTTP client for translation API
- `tokio = "1"` (full) — async runtime
- `serde = "1"` (derive), `serde_json = "1"`
- `dirs = "6"` — config-dir resolution (`%APPDATA%/STS2ModManager/`)
- `encoding_rs = "0.8"` — charset conversion
- `sysinfo = "0.33"` — process introspection for game state
- `urlencoding = "2"`, `opener = "0.7"` (Cargo)
