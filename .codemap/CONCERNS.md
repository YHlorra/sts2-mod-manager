# STS2 Mod Manager — Codebase Concerns

Snapshot date: 2026-06-08. Indexed files: 35 (CodeGraph 1.18 MB DB).
Main process is a single 1303-line `main.js` (46 KB) with all IPC, archive extraction, and filesystem logic. Rust/Tauri side is 11 files in `src-tauri/src/`. Both layers expose overlapping command sets (Electron `ipcMain.handle` and Tauri `#[tauri::command]`) for the same feature surface — see `src-tauri/src/lib.rs:18-60` vs `main.js:269-1300`.

## Hot spots — largest / most complex modules

- `E:\Desktop\workspace\sts2-mod-manager\main.js` — 1303 lines, 46 KB. Single file holds config, all IPC, ZIP/7z extraction, save scanning, crash analysis, and game launch. 33 named functions, 21 IPC handlers, 23 `try` blocks.
- `E:\Desktop\workspace\sts2-mod-manager\dist-tauri\renderer.js` — 273 KB minified bundle (UI shell).
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\lib.rs` — central Tauri command registry.
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\mods.rs`, `saves.rs`, `game.rs` — Tauri counterparts of the heaviest `main.js` logic.
- `E:\Desktop\workspace\sts2-mod-manager\preload.js` — 56 lines, exposes the full `window.api` surface (29 methods).

Long-named / multi-param functions in `main.js`: `tryParseMod` (3, L182), `scanSaveSlot` (3, L1101), `smartExtractZip` (L371, ~155 lines), `installFolder` (L545).

## TODO / FIXME / HACK / SKIP / BUG inventory

- 0 source-code TODO/FIXME matches. The 2 grep hits (`AGENTS.md:252`, `CLAUDE.md:21`) are inside negative instructions ("do NOT use … TODO lists").
- `main.js:389` has a "7z分支跳过manifest检测" comment that documents a known behavior gap, not a future TODO.

## Secret scan

- 0 matches for `sk-…`, `ghp_…`, `-----BEGIN PRIVATE KEY`, `password = "…"`, `api[_-]key = "…"`.
- Translation endpoint hardcoded: `https://api.mymemory.translated.net` (public, keyless) — appears in `src-tauri/tauri.conf.json` CSP and likely in `translate.rs`/main.js.
- Recommendation: add `gitleaks` or `trufflehog` to CI.

## Uncommitted state

Code drift to review:
- `M AGENTS.md`, `M .claude/settings.local.json`, `?? .claude/settings.json`, `?? CLAUDE.md`.

Build artifacts to gitignore or prune:
- `?? build.log`, `?? build_full.log` — left at repo root.
- `?? dist/sts2-mod-manager-1.0.0-x64.nsis.7z` — release artifact in `dist/`.

OMC state churn (should be ignored wholesale):
- `M .omc/project-memory.json`, `M .omc/state/…`, 4 new `sessions/` dirs.

Action: commit `CLAUDE.md` / `AGENTS.md`; add `build*.log` and `dist/*.7z` to `.gitignore`.

## Error handling gaps

`main.js` has 23 `try` blocks; many swallow errors silently. Severity: **medium**.

Empty catch sites in `main.js`:

| Line | What it swallows | Severity |
|------|------------------|----------|
| 20, 28 | config load/save | low |
| 84 | Steam libraryfolders.vdf parse | low |
| 203, 230, 244 | mods-dir file ops | medium |
| **339** | `mods:toggle` entire body | **high** |
| **366** | `smartExtractZip` pre-extract | high |
| 408 | `smartExtractZip` 7z/zip dispatch (rethrows with friendly msg) | high |
| 454 | "not valid JSON or not a manifest" | low |
| **579** | `mods:install` entire handler | **high** |
| 599 | `mods:installDrop` | high |
| 646, 656, 664 | `translations` save/load | medium |
| 1041, 1096 | `mods:backup` | medium |
| **1210, 1269, 1278** | `saves:export/import/deleteBackup` | **high** — user data loss path |
| **1299** | `mods:restore` | high |

Catches at L339, L579, L599, L1210, L1269, L1299 are user-data-impacting and should at minimum log to a `logs/` file and toast a failure to the renderer.

## Risk areas

1. **Archive extraction, `main.js:371-525`** — high. `smartExtractZip` is ~150 lines covering ZIP, 7z, smart-manifest, fallback, security. The 7z branch (L387-406) requires system `7z`. Path-traversal check at L466-468 only protects the ZIP path; smart-manifest path (L457-494) re-uses ZIP entry names without re-validating `..` segments. The L408-424 catch swallows the original error and replaces it with a generic message.
2. **Game launch uses unescaped `exec`, `main.js:732`** — medium. ``exec(`"${exePath}"`, { cwd: gamePath })`` wraps the user-selected path in quotes but does not escape embedded quotes. Windows-only mitigation, but the path is user-controlled.
3. **Two competing build targets (Electron vs Tauri)** — high coordination cost. `package.json` `main` = `main.js` (Electron), `tauri.conf.json` `frontendDist` = `../dist-tauri`. `src-tauri/src/lib.rs:18-60` re-implements every IPC command. No tooling keeps them in sync. Recent commit `8847cc2` updated Electron's archive code; verify `mods.rs` mirrors it.
4. **Tauri Rust panics on startup, `lib.rs:65-79`** — medium. `.run(...).unwrap_or_else(|e| { … panic!(...) })` crashes on init error. Combined with no `tauri:dev` in recent logs, suggests Tauri side may be unmaintained.
5. **Preload exposes full surface, `preload.js`** — medium. Notably `openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url)` is an arbitrary-URL-open vector — verify the L626 main-process handler validates the scheme.
6. **No automated tests** — medium. `find . -name "*.test.*" -o -name "*.spec.*"` returns 0; no `test/`/`tests/`/`__tests__`. `feature_list.json` claims 18 features `done` with "evidence" pointing to function names, no behavior verification.
7. **Untracked release artifact `dist/sts2-mod-manager-1.0.0-x64.nsis.7z`** — low. Build pipeline run manually, output not cleaned.

## Performance concerns

- **Synchronous FS on main thread, `main.js`**: `fs.readFileSync`, `fs.writeFileSync`, `fs.existsSync`, `fs.mkdirSync`, `fs.rmSync`, `fs.statSync` used throughout. `mods:install` (L558+) iterates and synchronously writes every ZIP entry — 500-file mods will freeze the UI for multi-second blocks.
- `getDirSize` (`main.js:235`) walks mods dir synchronously — O(filesystem) blocking.
- `logs:read` (L1000) likely reads entire log file; large crash logs (>10 MB) would block.
- Tauri side `mods.rs` should use `tokio::fs` for parallel I/O (not verified).
- Game process polling (`main.js:678` `tasklist` exec) — verify poll interval for busy-loop risk.

## Security concerns

1. **Path traversal in mod install — partial mitigation, `main.js:466-468`**: `path.resolve` + `startsWith(modsDir + sep)` is correct but only runs for the ZIP legacy path. The smart-manifest path (L448) reads `modRoots[].modDir` from ZIP entry names; if an entry is `..\..\evil.exe` the `parts` becomes `['..', '..', 'evil.exe']` and the `parts.length >= 2` check passes — but `destDir` is built from `mr.folderName` = `parts[-2]` (just `evil`), so the L466 check passes and the file would write to `modsDir/evil/` (in-bounds), but the inner `path.join(destDir, relativePath)` at L477 could escape if `relativePath` contains `..`. **Verify with a fuzzer.** Medium severity.
2. **`shell:openUrl` (`main.js:626`)** — passes URL to `shell.openExternal`. XSS via translation strings could trigger arbitrary URL open. Mitigate with an allowlist (`https:`, `http:`).
3. **`child_process.exec` with template-string interpolation (`main.js:732`)** — see Risk #2.
4. **`unsafe-inline` in CSP (`tauri.conf.json:25`)** — `script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`. Tauri build is less locked-down than it could be; React inlines style attributes.
5. **Translation endpoint** — mod descriptions sent to third-party; no user opt-out. Privacy concern, low severity.
6. **`openExternal('steam://rungameid/2868840')` (`main.js:728, 735, 738`)** — hardcoded game ID is safe, but the call sits in user-influenced branches.

## Maintenance signals

- **No test suite** — biggest red flag.
- **Two build targets, no sync automation** — see Risk #3.
- **No CI** — `.github/workflows/` exists but content unverified. No `.circleci/`.
- **Branch state clean** — only `main` / `remotes/origin/main` / `remotes/upstream/main`.
- **Doc drift risk** — recent commit `456f99b` says "Tauri is primary build target" but `package.json` `main` still points to Electron's `main.js`.
- **No `package-lock.json` / `yarn.lock` checked in** — `ls` returned nothing; anyone running `npm install` gets a different dependency tree.

## Top 3 concerns (summary)

1. **No tests + two parallel IPC implementations** (Electron `main.js` + Tauri `src-tauri/src/`) that must be kept in sync by hand. Every new feature risks being implemented in one layer and not the other. **High.**
2. **Error swallowing in user-data paths** — `main.js:339, 579, 599, 1210, 1269, 1278, 1299` (`mods:toggle`, `mods:install`, `mods:installDrop`, `saves:export/import/deleteBackup`, `mods:restore`) all catch errors with no logging and no user notification. **High.**
3. **Path-traversal guard is partial in `smartExtractZip` (`main.js:371-525`)** — L466 `startsWith` check only protects the legacy fallback path; smart-manifest path (L457-494) extracts using `modRoots[].modDir` derived from ZIP entry names without re-validating `..` segments. **Medium** (requires a malicious ZIP, but mod install accepts arbitrary user-supplied archives).
