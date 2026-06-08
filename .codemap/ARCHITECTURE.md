# Architecture

## Overview

STS2 Mod Manager is a Windows desktop application for installing, enabling, and managing Slay the Spire2 mods. The codebase ships two parallel backend implementations of the same app:

- **Electron** — `main.js` (single-file main process, ~46KB) + `preload.js` + React renderer. Build target: `npm run dist` → portable `STS2ModManager.exe`.
- **Tauri2** — `src-tauri/src/lib.rs` (command handlers) + `src-tauri/src/main.rs` (window entry + panic catcher) + React renderer (separate entry `src/index-tauri.jsx`). Build target: `npm run tauri:build` → NSIS installer.

Both backends expose the identical IPC surface (`app:init`, `mods:scan`, `mods:toggle`, `game:launch`, `translate:text`, etc.) so the React UI is reused unchanged. `package.json:6-17` declares scripts for both. The Electron build is the primary shipped artifact (`dist/sts2-mod-manager-v1.0.1.exe`); Tauri is the actively-developed next-generation port with crash analysis, save export/import, and translation pipelines already implemented in Rust.

## Process / runtime layers

### Electron main process — `main.js`

Single1249-line Node.js file. Responsibilities:

- App lifecycle and window creation (`createWindow` at `main.js:31`, `frame: false`, `titleBarStyle: 'hidden'`, `preload.js` attached with `contextIsolation: true` and `nodeIntegration: false`).
- Persistent config at `%APPDATA%/STS2ModManager/config.json` (`loadConfig`/`saveConfig` at `main.js:17-29`).
- Steam game-path auto-detection from `libraryfolders.vdf` plus hardcoded fallbacks (`detectGamePath` at `main.js:61-100`).
- Mod filesystem scan: enabled mods in `<gamePath>/mods/`, disabled in `<gamePath>/mods_disabled/`, legacy `_disabled/` migrated on startup (`migrateLegacyDisabledDir` at `main.js:121-138`).
- Archive extraction. ZIP via `adm-zip` with smart manifest detection (`smartExtractZip` at `main.js:371-543`);7z via `node-7z` wrapping the system `7z` binary (system requirement noted in `docs/superpowers/plans/2026-05-16-mod-manager-enhancement.md:14`).
- Game launch: Steam-protocol URL (`steam://rungameid/2868840`) for Steam installs, direct `SlayTheSpire2.exe` spawn otherwise (`main.js:718-747`). Process presence polled via `tasklist /FI "IMAGENAME eq SlayTheSpire2.exe"` every2s (`watchGameProcess` at `main.js:685-716`).
- Crash analysis: regex patterns (`CRASH_PATTERNS` at `main.js:752-762`) plus mod-level extraction (`analyzeModsFromLog` at `main.js:777-834`).
- Translation proxy: `electron.net.fetch` to `https://api.mymemory.translated.net/get` (`main.js:635-649`).
- Translation persistence at `%APPDATA%/STS2ModManager/translations.json` (`main.js:652-668`).

### Electron renderer — `src/`

React18 SPA. Entry `src/index.jsx` mounts `<App />` into `#root`; `src/index.html:25` loads the webpack bundle `../dist/renderer.js`. Top-level state lives in `src/App.jsx` (mod list, search, filter, sort, view mode, profiles, drag state, crash report). Sub-views:

- `src/components/ModCard.jsx` — grid card with category badge, missing-dep banner, toggle.
- `src/components/ModListItem.jsx` — list-row variant with multi-select checkbox.
- `src/components/ModDetail.jsx` — slide-in panel; description translation, Nexus URL editor, custom display-name editor.
- `src/components/ProfileManager.jsx` — currently unused at the App-level routing (`App.jsx:670-671` routes to `SaveManager` and `LogViewer` only); kept for legacy.
- `src/components/SaveManager.jsx` — save-slot browser and stats.
- `src/components/LogViewer.jsx` — filtered log viewer (error/warn levels, free-text search).
- `src/components/Sidebar.jsx` — left navigation; MOD / Saves / Logs + quick links.
- `src/components/TitleBar.jsx` — frameless-window titlebar (`-webkit-app-region: drag`).

### Tauri Rust backend — `src-tauri/src/`

- `main.rs` — sets `windows_subsystem = "windows"` in release, calls `setup_logging()` to write `launch.log` to `%APPDATA%/STS2ModManager/`, wraps `sts2_mod_manager_lib::run()` in `std::panic::catch_unwind` and shows a Windows `MessageBoxA` on crash (`main.rs:60-66`).
- `lib.rs` — registers all Tauri plugins (`dialog`, `opener`, `fs`, `single-instance`), declares `AppState { game_path, game_state }` (`lib.rs:13-16`), and lists every `#[tauri::command]` in `tauri::generate_handler![]` (`lib.rs:27-70`).
- `mods.rs` — mod lifecycle: scan, toggle (rename between `mods/` ↔ `mods_disabled/`), uninstall, install (file dialog → `smart_extract_archive`), backup (zip the mods dir), restore (extract a backup zip). Archive support: ZIP (`zip` crate, `smart_extract_zip` at `mods.rs:529-666`), RAR (`unrar` crate, `smart_extract_rar` at `mods.rs:668-713`),7z (`sevenz-rust`, `smart_extract_7z` at `mods.rs:715-753`).
- `config.rs` — game-path detection mirroring the Electron logic; config persistence at `%APPDATA%/STS2ModManager/config.json` (`config.rs:30-48`).
- `game.rs` — launch via `steam://rungameid/2868840` (Steam install) or direct `Command::new("SlayTheSpire2.exe")` (non-Steam); process detection via `sysinfo` (`game.rs:146-160`); log tail-parsing for game version + crash analysis with a richer `CRASH_PATTERNS` table including Chinese localization (`game.rs:237-250`).
- `logs.rs` — latest-godot-log file enumeration; tail-read with512KB cap (`logs.rs:24-46`).
- `saves.rs` — `profile1/2/3` and `modded/profile1/2/3` slot scanning; per-character stats; ZIP export/import with auto-backup before import (`saves.rs:285-540`).
- `profiles.rs` — `profiles.json` save/load.
- `translations.rs` — `translations.json` save/load.
- `translate.rs` — `reqwest` call to MyMemory translation API.
- `build.rs` — Tauri build script (generated).

### Tauri webview frontend

`src/index-tauri.jsx` differs from `src/index.jsx` only by pre-importing `src/tauri-api.js`, which assigns the same `window.api` shape as `preload.js` but maps each method to a `window.__TAURI__.core.invoke()` call (`src/tauri-api.js:43-102`). Game-state polling uses `setInterval`2000ms (`src/tauri-api.js:15-41`) instead of push events. Webpack builds the bundle to `dist-tauri/renderer.js` (`webpack.tauri.config.js:7`).

## Data flow: install → enable → game reads it

1. **Acquire**: User clicks "安装 MOD" or drops a file. `App.jsx:124-130` calls `window.api.installMod()` / `installDrop(filePaths)`.
2. **IPC → backend**:
 - Electron: `preload.js:17-18` → `ipcMain.handle('mods:install', ...)` at `main.js:558-584`. Dialog opens with `extensions: ['zip', '7z']`. For each path: if directory → `installFolder` (`main.js:545-556`); if archive → `await smartExtractZip()`.
 - Tauri: `src/tauri-api.js:57-58` → `mods::mods_install` (`mods.rs:782-850`) or `mods::mods_install_drop` (`mods.rs:852-901`). Dispatch by extension: `zip` → `smart_extract_zip`; `rar` → `smart_extract_rar`; `7z` → `smart_extract_7z`; directory → `install_folder`.
3. **Smart extract**: ZIP/7z scanners look for entries with `id` + `name` JSON fields (the manifest). If found, the enclosing directory becomes a folder-mod subdir in `<gamePath>/mods/<modFolder>/`. If no manifest is found, fallback uses the zip's top-level directory name. Post-extract check fails with a Chinese error if no `.json`/`.dll`/`.pck` is present (`main.js:526-542`).
4. **Smart-replace**: Both backends `rmSync` the destination folder before extracting so a new version of the same mod replaces the old one (`main.js:469`, `mods.rs:586-588`, `mods.rs:1031`).
5. **Scan**: Returns list of mods. `tryParseMod` accepts either folder-mods (dir containing a manifest JSON) or flat-mods (`ModName.json` + sibling `.dll`/`.pck` files). Each mod gets `instanceKey = fullPath`, `folderName`, `enabled = true|false` based on location.
6. **Enable/disable**: `mods:toggle` moves the folder/file via `fs.rename` between `<gamePath>/mods/` (enabled) and `<gamePath>/mods_disabled/` (disabled). Atomic from the game's perspective: the next game launch reads only `mods/`.
7. **Game reads mods**: Slay the Spire2 itself reads `<gamePath>/mods/*` at startup. The manager does not inject anything; it is a filesystem organizer.

## External boundaries

- **Filesystem**:
 - Game install — `<gamePath>/mods/` (enabled), `<gamePath>/mods_disabled/` (disabled), `<gamePath>/SlayTheSpire2.exe`.
 - Steam install detection — `C:\Program Files (x86)\Steam`, `C:\Program Files\Steam`, `D:\Steam`, `D:\SteamLibrary`, `E:\SteamLibrary` + any library listed in `libraryfolders.vdf`.
 - Game logs — `%APPDATA%/SlayTheSpire2/logs/godot2*.log` (rotated).
 - Game saves — `%APPDATA%/SlayTheSpire2/steam/<userid>/{profile1,profile2,profile3,modded/profile{1,2,3}})`.
 - Manager config — `%APPDATA%/STS2ModManager/config.json`, `translations.json`, `profiles.json`, `save_backups/*.zip`, `launch.log`.
- **Network**:
 - `https://api.mymemory.translated.net/get?q=…&langpair=en|zh-CN` for English→Chinese translation of MOD descriptions.
 - Steam protocol URL `steam://rungameid/2868840` for game launch (handled by Steam client).
 - External URLs opened via `shell.openExternal` (`main.js:626-630`, `lib.rs:152-157`) — guarded by `https?://` prefix check.
- **Game process**: Observed via `tasklist` (Electron) or `sysinfo::System::new().refresh_processes` (Tauri). Lookup target: process name `SlayTheSpire2.exe` / `SlayTheSpire2`.

## Key modules

| Function / module | File:line | Purpose |
|---|---|---|
| `detectGamePath()` (Electron) | `main.js:61-100` | Steam library + hardcoded fallbacks for game install dir |
| `scanMods()` (Electron) | `main.js:146-180` | Scan enabled + disabled mod roots |
| `tryParseMod()` (Electron) | `main.js:182-233` | Read manifest JSON, return mod metadata |
| `smartExtractZip()` (Electron) | `main.js:371-543` | ZIP manifest-aware extraction +7z branch via `node-7z` |
| `installFolder()` (Electron) | `main.js:545-556` | `fs.cpSync` a dropped folder into `mods/` |
| `analyzeModsFromLog()` (Electron) | `main.js:777-834` | Parse Godot log for loaded mods + error attribution |
| `watchGameProcess()` (Electron) | `main.js:685-716` |2-second `tasklist` poll; emit `game:stateChanged`/`game:exited` |
| `contextBridge.exposeInMainWorld('api', …)` | `preload.js:3-55` | IPC surface exposed to renderer |
| `tauri::generate_handler!` | `lib.rs:27-70` | All Tauri command registrations |
| `AppState { game_path, game_state }` | `lib.rs:13-16` | Shared mutable state behind `Mutex` |
| `scan_mods_internal()` (Tauri) | `src-tauri/src/mods.rs:270-342` | Tauri scan + `_mod_display_names` enrichment |
| `try_parse_mod()` (Tauri) | `src-tauri/src/mods.rs:152-268` | Folder vs flat mod JSON reader |
| `smart_extract_archive()` (Tauri) | `src-tauri/src/mods.rs:513-527` | Dispatch ZIP/RAR/7z by extension |
| `game_analyze_crash()` (Tauri) | `src-tauri/src/game.rs:278-446` | Latest log + pattern table + mod involvement |
| `saves_export()` (Tauri) | `src-tauri/src/saves.rs:373-435` | ZIP a save slot with `_meta.json` |
| `saves_import()` (Tauri) | `src-tauri/src/saves.rs:437-540` | Auto-backup + remap prefix on import |
| `App` component | `src/App.jsx:15-828` | Renderer top-level state, routing, mod CRUD handlers |
| `window.api` bridge (Tauri) | `src/tauri-api.js:43-102` | Mirrors preload.js methods on `__TAURI__.core.invoke` |
