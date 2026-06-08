# STS2 Mod Manager — Integrations

## External Services

### mymemory Translation API (Rust path only)

- **Endpoint**: `https://api.mymemory.translated.net/get?q=<text>&langpair=en|zh-CN`
- **Source**: `src-tauri/src/translate.rs` (`translate_text` command)
- **Caller**: `src-tauri/src/lib.rs` registers the command
- **Frontend mirror**: Electron renderer also exposes a `translateText` IPC handler via `preload.js` (label `translate:text`); however the actual fetch lives in the Rust side
- **CSP allowlist**: `tauri.conf.json` includes `connect-src 'self' https://api.mymemory.translated.net`
- **Persistence**: results cached to `%APPDATA%/STS2ModManager/translations.json` (`src-tauri/src/translations.rs`)

### Google Fonts (Tauri CSP)

- `tauri.conf.json` `style-src` allows `https://fonts.googleapis.com` and `font-src` allows `https://fonts.gstatic.com` — passive font CDN, not a runtime API

### GitHub Releases (publishing only)

- `softprops/action-gh-release@v2` in `build.yml` attaches `sts2-mod-manager.exe` + `src-tauri/target/release/bundle/nsis/*.exe` to GitHub Release on `v*` tag push
- Repo: `https://github.com/ImogeneOctaviap794/sts2-mod-manager` (per `nexus-mods-listing.md`)

## File Format Integrations

### ZIP

- **Electron path**: `adm-zip ^0.5.10` in `main.js` — read (`new AdmZip(path).getEntries()`), write (`zip.writeZip`), `extractAllTo`; used by `saves:import`, `saves:export`, `mods:restore`
- **Rust path**: `zip = "2"` (`deflate` only) in `src-tauri/src/mods.rs`; `ZipArchive::new(file)` at lines 545, 584, 651

### 7z

- **Electron path**: `node-7z ^3.0.0` in `main.js` (binary spawned via `7z`/`7za`)
- **Rust path**: `sevenz-rust = "0.6"` in `src-tauri/src/mods.rs:716`; extracts into `mods/.sevenz_temp` then promotes files

### RAR

- **Electron path**: `node-unrar-js ^2.0.2` in `main.js`; native binding must stay outside asar (`package.json` `build.asarUnpack: ["node_modules/node-unrar-js/**/*"]`)
- **Rust path**: `unrar = "0.5"` in `src-tauri/src/mods.rs:669`; `Archive::new(rar_path).open_for_processing()`

### File dialogs

- Electron: `dialog.showOpenDialog` / `dialog.showSaveDialog` in `main.js` (zip/7z filters visible: `extensions: ['zip', '7z']`)
- Tauri: `tauri-plugin-dialog = "2"` initialized in `src-tauri/src/lib.rs`

## Platform Integrations

### Steam (game detection + launch)

- **Detection (`main.js:62-94`)**: scans a hard-coded list of `steamPaths` for `steamapps/libraryfolders.vdf`; also tries `D:\SteamLibrary\steamapps\common\Slay the Spire 2` and `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2` directly
- **Launch (`main.js:724-738`)**: if `gamePath` contains `steamapps`, opens `steam://rungameid/2868840` via `shell.openExternal`; otherwise launches the `.exe` directly. Slay the Spire 2 Steam appid = `2868840`
- **Save dir (`main.js:1048-1052`)**: `path.join(process.env.APPDATA, 'SlayTheSpire2', 'steam')`; first user-id subdir is the user data root
- **Rust path**: `src-tauri/src/saves.rs:87` reads `%APPDATA%/SlayTheSpire2/steam/`

### Nexus Mods (publication surface only)

- `E:\Desktop\workspace\sts2-mod-manager\nexus-mods-listing.md` is a manual paste-target sheet (BBCode `Name` / `Summary` / `Description` / `Category` / `Tags`) for the [Nexus Mods](https://www.nexusmods.com/) listing — not a code integration
- Per-mod Nexus URLs are stored in `translations.json` (feature `nexus-01` in `feature_list.json`); `shell.openUrl(url)` IPC handler in `preload.js` opens them in the default browser (`tauri-plugin-opener` on Tauri)
- Featured features: `nexus-01..05` track URL storage, persistence, open-in-browser, version-tracking, batch-update-check (last one `pending`)

### Windows OS specifics

- `tauri-plugin-single-instance` (non-mobile only) prevents multiple app instances
- `webviewInstallMode: { type: "embedBootstrapper" }` and `nsis.installMode: "currentUser"` in `tauri.conf.json` — installer targets current user
- Process introspection via `sysinfo = "0.33"` for game-state tracking

## CI/CD

### `.github/workflows/build.yml` — "Build and Release"

- **Triggers**: push of `v*` tags; `workflow_dispatch`
- **Runner**: `windows-latest`
- **Node**: `actions/setup-node@v4` → Node 20
- **Rust**: `dtolnay/rust-toolchain@stable` + `swatinem/rust-cache@v2` (workspace: `src-tauri`)
- **Install**: `npm ci`, then `cargo install tauri-cli`
- **Build**: `npm run tauri:build`
- **Artifacts** (uploaded with `actions/upload-artifact@v4`):
  - `sts2-mod-manager-portable` ← `src-tauri/target/release/sts2-mod-manager.exe`
  - `sts2-mod-manager-setup` ← `src-tauri/target/release/bundle/nsis/*.exe`
- **Release**: `softprops/action-gh-release@v2` attaches both files to GitHub Release on tag push
- **Permissions**: `contents: write`

### `.github/workflows/build-windows.yml` — "Build Windows"

- **Triggers**: push to `main` / `master`; `workflow_dispatch`
- **Env**: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`
- **Runner**: `windows-latest`
- **Node**: `actions/setup-node@v4` → Node 22, with `cache: npm`
- **Rust**: same `dtolnay/rust-toolchain@stable` + `swatinem/rust-cache@v2` setup
- **Build**: `npm run build:tauri-fe` then `npx tauri build` (uses `cargo tauri` from `@tauri-apps/cli` devDep, not a system install)
- **Debug step**: lists `src-tauri\target\release\*.exe` and `src-tauri\target\release\bundle\nsis\` via `cmd` shell
- **Artifacts** (30-day retention):
  - `STS2-Mod-Manager-Portable` ← `src-tauri/target/release/*.exe`
  - `STS2-Mod-Manager-Installer` ← `src-tauri/target/release/bundle/nsis/*.exe`

## pnpm Workspace

`E:\Desktop\workspace\sts2-mod-manager\pnpm-workspace.yaml` contains only:

```yaml
allowBuilds:
  electron: false
```

No `packages:` array → this is a single-root workspace (one `package.json` at the repo root), not a monorepo. The `electron: false` rule prevents pnpm from trying to build the Electron native package from source.

## Build Artifacts (observed)

### `E:\Desktop\workspace\sts2-mod-manager\dist\` (Electron output)

- `builder-debug.yml`, `builder-effective-config.yaml` — electron-builder logs
- `renderer.js` (269 KB) — webpack production bundle
- `renderer.js.LICENSE.txt` — bundled license attributions
- `STS2ModManager.exe` (147 MB) — electron-builder portable x64 output
- `sts2-mod-manager-v1.0.1.exe` (14 MB) — alternate portable artifact
- `sts2-mod-manager-1.0.0-x64.nsis.7z` (568 MB) — packaged NSIS build
- `win-unpacked/` — electron-builder unpacked directory

### `E:\Desktop\workspace\sts2-mod-manager\dist-tauri\` (Tauri frontend output)

- `index.html` (1.7 KB) — Tauri shell HTML
- `output.css` (28 KB) — Tailwind production CSS
- `renderer.js` (279 KB) — Tauri-target webpack bundle (`target: 'web'`)
- `renderer.js.LICENSE.txt`

## Documentation Surface

- `E:\Desktop\workspace\sts2-mod-manager\docs/` — screenshots (`preview-mods.png`, `preview-saves.png`) + `superpowers/` subdir
- `E:\Desktop\workspace\sts2-mod-manager\.planning/phases/` — planning phases
- `E:\Desktop\workspace\sts2-mod-manager\nexus-mods-listing.md` — Nexus Mods listing paste-target (BBCode)
- `E:\Desktop\workspace\sts2-mod-manager\feature_list.json` — feature tracker (13 `feat-*` + 5 `nexus-*` items, mostly `done`; `nexus-04` and `nexus-05` `pending`)
