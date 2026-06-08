# Structure

## Top-level layout

| Path | Purpose |
|---|---|
| `main.js` | Electron main process (~46KB,1249 lines). Window, IPC handlers, archive extraction, game process polling, crash analysis, translation proxy. |
| `preload.js` | Electron context bridge. Exposes `window.api` over `contextBridge.exposeInMainWorld`. |
| `package.json` | npm manifest. Declares `start`, `dev`, `build`, `build:tauri-fe`, `tauri`, `tauri:dev`, `tauri:build`, `pack`, `dist` scripts. `main: "main.js"`. |
| `webpack.config.js` | Electron webpack. Entry `./src/index.jsx` → `./dist/renderer.js`. `target: 'electron-renderer'`. |
| `webpack.tauri.config.js` | Tauri webpack. Entry `./src/index-tauri.jsx` → `./dist-tauri/renderer.js`. `target: 'web'`. |
| `tailwind.config.js` | Tailwind config. `content: ['./src/**/*.{js,jsx,html}']`. |
| `postcss.config.js` | PostCSS pipeline: tailwindcss → autoprefixer. |
| `AGENTS.md` | Agentic instructions file. |
| `CLAUDE.md` | Agent instructions / context file (present). |
| `.planning/` | Phase-level planning docs. |
| `.beads/` | Beads (Dolt-backed) issue tracker state + git hooks. |
| `.claude/` | Claude Code session + settings. |
| `.codegraph/` | CodeGraph SQLite index (`codegraph.db`). |
| `docs/` | Documentation + planning snapshots. |
| `src/` | React renderer source (Electron entry + shared components). |
| `src-tauri/` | Tauri Rust backend. |
| `dist/` | Electron build output. |
| `dist-tauri/` | Tauri frontend build output (Tauri binary lives under `src-tauri/target/`). |

## `src/` (renderer)

| File | Role |
|---|---|
| `src/index.jsx` | Electron renderer entry. `createRoot(...).render(<App />)`. |
| `src/index-tauri.jsx` | Tauri renderer entry. Same as `index.jsx` but pre-imports `./tauri-api`. |
| `src/tauri-api.js` | Tauri-side `window.api` shim. Maps each `preload.js` method to `window.__TAURI__.core.invoke`. Owns a2s polling loop for `game_get_state`. |
| `src/App.jsx` | Top-level component. Owns: mod list, search/filter/sort, view mode (grid/list), drag state, profiles, crash report, toast. Calls all `window.api.*` methods. |
| `src/index.html` | Electron HTML shell. Loads `../dist/renderer.js`. Inter font + scrollbar + titlebar-drag CSS. |
| `src/index.css` / `src/output.css` | Tailwind input + built output. |
| `src/components/TitleBar.jsx` | Frameless window titlebar. minimize/maximize/close + GitHub link. |
| `src/components/Sidebar.jsx` | Left nav: MOD 管理 /存档管理 / 游戏日志. Quick links: Nexus, mods/logs/saves dirs. |
| `src/components/ModCard.jsx` | Grid card. Category badge (框架前置/玩法改动/资源类), missing-deps banner, toggle button. |
| `src/components/ModListItem.jsx` | List-row variant. Multi-select checkbox, drag handle. |
| `src/components/ModDetail.jsx` | Slide-in detail panel. Description translation (`translateText`), Nexus URL editor, custom display name + URL saved via `translations:save`. |
| `src/components/SaveManager.jsx` | Save-slot browser. Uses `saves_scan` / `saves_export` / `saves_import`. |
| `src/components/LogViewer.jsx` | Log file viewer. Filter by level (error/warn), free-text search. |
| `src/components/ProfileManager.jsx` | Standalone profile page (NOT routed from `App.jsx`). `App.jsx:670-671` only routes `saves` and `logs`. Profiles are inlined in `App.jsx:341-388`. |

## `src-tauri/` (Rust backend)

| File | Role |
|---|---|
| `src-tauri/src/main.rs` | Process entry. Sets `windows_subsystem = "windows"`, writes `launch.log`, catches panics, shows `MessageBoxA` on Windows if startup fails. |
| `src-tauri/src/lib.rs` | `sts2_mod_manager_lib::run()`. Registers plugins (`dialog`, `opener`, `fs`, `single-instance`), declares `AppState`, lists all `#[tauri::command]` handlers. |
| `src-tauri/src/mods.rs` | Mod lifecycle. `mods_scan`, `mods_toggle`, `mods_uninstall`, `mods_install`, `mods_install_drop`, `mods_backup`, `mods_restore`. Archive support: ZIP, RAR,7z. |
| `src-tauri/src/config.rs` | Game-path detection + config persistence. `app_init`, `app_select_game_path`. |
| `src-tauri/src/game.rs` | Launch, state polling (via `sysinfo`), version detection from godot logs, crash analysis with Chinese-localized `CRASH_PATTERNS`. |
| `src-tauri/src/logs.rs` | Log enumeration + tail-read (512KB cap, top50 most recent). |
| `src-tauri/src/saves.rs` | Save slot scan, ZIP export, ZIP import with auto-backup before overwrite. |
| `src-tauri/src/profiles.rs` | `profiles.json` load/save. |
| `src-tauri/src/translations.rs` | `translations.json` load/save. |
| `src-tauri/src/translate.rs` | MyMemory translation HTTP proxy. |
| `src-tauri/Cargo.toml` | Rust manifest. Deps: `tauri2`, `tauri-plugin-{dialog,opener,fs,single-instance}`, `serde`, `serde_json`, `zip`, `unrar0.5`, `sevenz-rust0.6`, `reqwest`, `tokio`, `dirs`, `sysinfo`, `urlencoding`, `opener`, `encoding_rs`. |
| `src-tauri/tauri.conf.json` | Tauri config. `productName: "STS2 Mod Manager"`, `version: "1.1.0"`, `identifier: "com.sts2.mod-manager"`. Window1400×900 frameless. CSP allows Google Fonts + MyMemory. Bundle: NSIS, currentUser install. |
| `src-tauri/build.rs` | Tauri build script (generated, calls `tauri_build`). |
| `src-tauri/icons/` | App icons in multiple resolutions (Tauri requires PNG + ICO + ICNS). |
| `src-tauri/target/` | Cargo build output. NOT shipped. Contains compiled binaries + WebView2 loader DLLs. |

## `docs/`

| File | Role |
|---|---|
| `docs/preview-mods.png` | Screenshot of the MOD management view. |
| `docs/preview-saves.png` | Screenshot of the save manager view. |
| `docs/superpowers/plans/2026-05-16-mod-manager-enhancement.md` | Plan: add7z support + smart-replace fix. Documents `node-7z` integration via system `7z` binary, `async function` refactor of `smartExtractZip`, target-file/line edits, task checklist. |

## `.planning/`

Phase-based planning output. Currently one phase documented:

| File | Content |
|---|---|
| `.planning/phases/02-custom-display-name-and-local-update-time/02-01-SUMMARY.md` | Phase2 plan01 summary. Added `display_name` + `local_updated_at` fields to `ModInfo` in `mods.rs`. `display_name` persisted in `translations.json` under `_mod_display_names` keyed by `instance_key`. `local_updated_at` computed from newest-file mtime inside mod folder.37 tests passed. |

Earlier phases (01-*) are not present in this directory.

## Build outputs

| Path | Contents |
|---|---|
| `dist/STS2ModManager.exe` | Most recent Electron portable build artifact (single-file). |
| `dist/sts2-mod-manager-v1.0.1.exe` | Versioned Electron portable build. |
| `dist/win-unpacked/` | Unpacked Electron build (used during dev / testing). Contains `STS2ModManager.exe` + `resources/` (`elevate.exe`). |
| `dist-tauri/renderer.js` | Tauri webpack bundle (frontend). |
| `dist-tauri/index.html` | Tauri dev HTML loader. |
| `dist-tauri/output.css` | Built Tailwind CSS for Tauri. |
| `dist-tauri/renderer.js.LICENSE.txt` | License attributions for the bundle. |
| `src-tauri/target/debug/` + `release/` | Cargo artifacts. `sts2-mod-manager.exe` (Tauri binary) is produced here. Contains WebView2 loader DLLs in `build/webview2-com-sys-*/out/{x86,x64,arm64}/`. |

## Config files

| File | Configures |
|---|---|
| `webpack.config.js` | Electron renderer bundling. `babel-loader` (`@babel/preset-env` + `@babel/preset-react`), `style-loader` → `css-loader` → `postcss-loader` for CSS. Output: `dist/renderer.js`. `target: 'electron-renderer'`. |
| `webpack.tauri.config.js` | Tauri frontend bundling. Same loaders, output `dist-tauri/renderer.js`. `target: 'web'` (Tauri webview). |
| `tailwind.config.js` | Tailwind v3. `content: ['./src/**/*.{js,jsx,html}']`. Extended palette: `primary`, `accent.{green,yellow,pink,blue,purple}`. Inter as `fontFamily.sans`. |
| `postcss.config.js` | PostCSS pipeline: `tailwindcss` + `autoprefixer`. |
| `package.json` (`build` block) | electron-builder config. `appId: "com.sts2.mod-manager"`, `productName: "STS2 Mod Manager"`. Files: `main.js`, `preload.js`, `dist/**/*`, `src/index.html`, `src/output.css`. `asarUnpack: ['node_modules/node-unrar-js/**/*']`. Win target: `portable`, x64, artifact `STS2ModManager.exe`. Compression: `maximum`. |
| `src-tauri/Cargo.toml` | Rust dependencies + Tauri build deps. `[lib]` crate-type `staticlib`, `cdylib`, `rlib` (Tauri requires both staticlib + cdylib). |
| `src-tauri/tauri.conf.json` | Tauri app config: window dims, CSP, bundle targets (NSIS), icon set. |

## Other dirs

| Path | Notes |
|---|---|
| `node_modules/` | pnpm-managed dependencies. `.pnpm/` subdir holds the actual store. |
| `.git/` | Git repository. |
| `.codegraph/` | CodeGraph index (`codegraph.db`). Auto-generated. |
| `.beads/` | Beads issue tracker (Dolt embedded). `embeddeddolt/sts2_mod_manager/.dolt/` is the SQLite-on-disk store. `hooks/` has git hooks: `post-merge`, `pre-commit`, `pre-push`, `post-checkout`, `prepare-commit-msg`. `backup/` has automatic kv-store backups. |
| `build.log`, `build_full.log` | Transient build logs (present in working tree; not committed per `.gitignore`). |
| `dist/sts2-mod-manager-1.0.0-x64.nsis.7z` | Archived NSIS build (untracked). |

## No-data notes

- No automated test runner configured (`npm test` is not declared in `package.json`). The Tauri phase-2 plan summary mentions37 tests passed, but no test harness file is committed; tests likely live in a local-only path.
- No CI configuration (no `.github/workflows/`, no `.gitlab-ci.yml`).
- No `README.md` in repo root.
- `.planning/` has only phase02; earlier phases not archived here.
- `.omc/` state directories are session/temporary and not part of the shipped codebase.
