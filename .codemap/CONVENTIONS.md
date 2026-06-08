# STS2 Mod Manager — Conventions

Verified against the working tree on 2026-06-08. CodeGraph index: 35 files, 321 nodes, 564 edges.

This document captures the in-code conventions actually in use. Where conventions are absent (lint, format, tests), that absence is itself documented as a finding — it is the real state of the project, not an oversight in this doc.

---

## Runtime targets

- **Node.js**: `>=20` in CI (`.github/workflows/build.yml` pins `node-version: 20`; `build-windows.yml` pins `22`). No `engines` field in `package.json`.
- **Rust**: `edition = "2021"` (`E:\Desktop\workspace\sts2-mod-manager\src-tauri\Cargo.toml`).
- **Tauri**: v2 (tauri `2`, tauri-plugin-* `"2"` in Cargo.toml).
- **Electron**: v29 (`devDependencies.electron: ^29.4.6`) — same JS codebase targets both runtimes via `preload.js` (Electron) vs `src/tauri-api.js` (Tauri bridge).

## Source layout (sizes verified)

| File | Lines | Role |
|---|---|---|
| `E:\Desktop\workspace\sts2-mod-manager\main.js` | 1303 | Electron main process |
| `E:\Desktop\workspace\sts2-mod-manager\preload.js` | 56 | Electron contextBridge |
| `E:\Desktop\workspace\sts2-mod-manager\src\App.jsx` | 829 | Top-level React component |
| `E:\Desktop\workspace\sts2-mod-manager\src\tauri-api.js` | 103 | Tauri runtime bridge |
| `E:\Desktop\workspace\sts2-mod-manager\src\components\*.jsx` | 1323 total | React components |
| `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\*.rs` | 2697 total | Rust commands and helpers |

---

## Module style

The project uses **two module systems in one repo** — strict separation, never mixed within a file.

| File family | System | Evidence |
|---|---|---|
| `main.js`, `preload.js` | **CommonJS** | `require(...)` (8 in main.js, 1 in preload.js), zero `import` statements |
| `src/**/*.jsx`, `src/index*.jsx` | **ESM** | `import ... from` only, zero `require`. Webpack/Babel transpile via `babel-loader` + `@babel/preset-env` + `@babel/preset-react` |
| `src/tauri-api.js` | ESM-style syntax but **no imports** | Uses `window.__TAURI__.core.invoke` directly; loads as a `<script>` tag in the renderer |
| `src-tauri/**/*.rs` | Rust 2021 modules | Standard `mod` / `use` |

`@babel/preset-env` is configured to handle both via the build, but the convention is: **if it talks to Electron or Node directly → CommonJS; if it renders in the React tree → ESM.** Mixing them in the same file is not done anywhere.

---

## Naming

### JavaScript / React

- **Functions**: `camelCase` (e.g. `scanMods`, `toggleMod`, `installMod` in `preload.js`).
- **React components**: `PascalCase`, both `function Name()` and `const Name = (...)` patterns are used. Verified components: `App`, `LogViewer`, `ModCard`, `ModDetail`, `ModListItem`, `ProfileManager`, `SaveManager`, `Sidebar`, `TitleBar`.
- **Constants**: `UPPER_SNAKE_CASE`. Examples in `main.js`: `DISABLED_DIR`, `LEGACY_DISABLED_DIR`. Examples in `src/components\ModCard.jsx`: `MAX_VISIBLE_LINES`, `SLOT_LABELS`.
- **No classes** are defined anywhere in the JS source — all behavior is plain functions or React function components.

### Rust

- **Functions**: `snake_case` (e.g. `window_minimize`, `smart_extract_archive`, `copy_dir_recursive`).
- **Structs / enums**: `PascalCase` (`ModInfo`, `ModResult`, `SimpleResult`, `TranslateResult`, `AppState`, `GameState`).
- **Tauri commands**: `snake_case` and explicitly **prefixed by domain** — `window_*`, `shell_*`, `mods_*`, `game_*`, `saves_*`, `logs_*`, `profiles_*`, `translate_*`, `translations_*`, `app_*`. This prefix maps 1:1 to the IPC channel namespace exposed in `preload.js`.
- **No `class`** keyword anywhere; behavior lives in plain `fn` + free `impl` blocks.

### Files

- React components: `PascalCase.jsx` (`ModCard.jsx`, `SaveManager.jsx`, …).
- Helper modules: `kebab-case` only where Webpack requires it (`webpack.tauri.config.js`); otherwise `camelCase` (`tauri-api.js`, `output.css`).
- Rust modules: `snake_case` matching the `mod name;` declaration (`mods.rs`, `saves.rs`, `game.rs`, `config.rs`, `profiles.rs`, `logs.rs`, `translate.rs`, `translations.rs`).

---

## Async style

`main.js` is the canonical example — the rest of the JS follows the same shape.

- **`async`/`await` is the primary style.** 1 `async function` declaration, 12 `await` usages, 0 `async () =>` arrows, 2 `new Promise(...)` constructions, 1 `.then(` call (a single Promise chain in `getGameState` polling fallback).
- **No `.catch(...)` chains.** Errors are surfaced via try/catch returning `{ success: false, error: e.message }` instead.
- **IPC handlers in `main.js` are `async` functions** registered on `ipcMain.handle(channel, asyncFn)`.
- **Tauri commands** in `lib.rs` / domain modules are also `async fn` where they await network or filesystem I/O.
- **Renderer (`src/App.jsx`)**: pure functional React; effect hooks use `useEffect` with `await` inside.

---

## Error handling

### JavaScript — main process (`main.js`)

`main.js` has **22 `catch` blocks**; **9 of them are empty** (`} catch (e) {}`) — a 41% silent-swallow rate. The remaining 13 fall into two buckets:

1. **IPC error envelope** (8 occurrences) — return the failure to the renderer so the UI can display it:
   ```js
   } catch (e) {
     return { success: false, error: e.message };
   }
   ```
   Found at lines 339–341, 366–368, 579–581, 599–601, 646–648, 1041–1043, 1210–1212, 1269–1271, 1278–1280, 1299–1301.
2. **Best-effort / tolerated failure** (9 occurrences at lines 20, 28, 84, 203, 217, 230, 244, 656, 664) — empty body, falls through to a benign default (`return null;`, `return {};`, or skips the file). Used for manifest probing and stat'ing user-supplied paths where failure is expected.

Additional pre-checks (not in `try`) also return the same `{ success: false, error: '...' }` shape, e.g. line 305: `if (!modsDir || !disabledDir) return { success: false, error: 'Game path not set' };`. There are **27 such response sites** in `main.js` — this is the project's de-facto error contract between main and renderer.

### Rust

- **Internal error type**: stringly-typed `Result<T, String>`. Every function that can fail returns `Result<T, String>` (15 `Result<` declarations across `mods.rs`, `saves.rs`, `config.rs`).
- **`?` operator is the dominant propagation path** — **59 occurrences** across the Rust source. Callers wrap the underlying error with `.map_err(|e| e.to_string())` (see `mods.rs:558,564,583,584,591,603,604,611,615`) because the bound is `String`, not `anyhow::Error` or a custom enum.
- **`.unwrap()`**: 18 occurrences, **all on `Mutex::lock()`** — `state.game_path.lock().unwrap()` or `state.game_state.lock().unwrap()`. Examples: `config.rs:123,156`, `game.rs:58,70,98,111,121,129,137`, `lib.rs:115,126`, `mods.rs:375,387,468,787,857,950,1009`. Poisoning will panic the process; acceptable because mutexes are never held across `.await` in this codebase.
- **`.expect()`**: 0 occurrences. `.unwrap()` is used even where a comment would help.
- **`panic!`**: 1 occurrence (in `logs.rs`).
- **Tauri command return structs** — the public surface normalizes errors to typed shapes:
  - `ModResult { success: bool, error: Option<String>, mods: Option<Vec<ModInfo>>, installed: Option<Vec<String>> }` — `mods.rs`.
  - `SimpleResult { success: bool, error: Option<String> }` — `saves.rs`.
  - `TranslateResult { success: bool, translated: Option<String>, error: Option<String> }` — `translate.rs`.
  - On the JS side these are consumed by reading `.success` / `.error` / `.mods` / `.installed` fields. Tauri commands implemented: `window_minimize`, `window_maximize`, `window_close`, `shell_open_mods_dir`, `shell_open_game_dir`, `shell_open_logs_dir`, `shell_open_saves_dir`, `shell_open_url` (verified from `src-tauri/src/lib.rs`).

---

## Logging

**No `console.*` calls exist in the JS source.** Verified across all 14 JS files in scope — `main.js`, `preload.js`, `tauri-api.js`, and every `.jsx` under `src\`. There are zero `console.log`, `console.error`, `console.warn`, `console.info`, or `console.debug` calls.

This is intentional but surprising for a 1303-line main process. Errors that would normally be `console.error`'d are instead returned through the IPC envelope (`{ success: false, error: e.message }`). Diagnostic output for users happens through:

- The `logs.rs` Rust module + `getLatestLogs` / `readLog` IPC commands (read by the `LogViewer` component).
- The `onGameStateChanged` / `onGameExited` events (from `preload.js`).

**Implication for agents**: do not add `console.log` as a debugging strategy — it will get code-reviewed out. Use the IPC envelope or the in-app log viewer.

---

## Linting and formatting

**None configured.** Verified absence:

- `.eslintrc`, `.eslintrc.js`, `.eslintrc.json`, `.eslintrc.yml` — all absent.
- `eslint.config.js`, `eslint.config.mjs` — absent.
- `.prettierrc`, `.prettierrc.js`, `.prettierrc.json` — absent.
- `.editorconfig` — absent.
- `src-tauri/rustfmt.toml`, `src-tauri/clippy.toml`, `src-tauri/.rustfmt.toml` — all absent.
- `package.json` `scripts` has no `lint`, `format`, `check`, or `fmt` script.

This is a real concern, not a doc gap. The Rust side especially benefits from `cargo clippy -- -D warnings` and `cargo fmt --check`; the JS side from ESLint with `eslint-plugin-react`. Any new contributor is free to write any style — the project enforces consistency only by convention.

**Implication for agents**: review style manually. Don't rely on a formatter to clean up whitespace, don't rely on a linter to catch unused imports, and don't add CI gates that don't exist yet.

---

## Comments and documentation

- **Sparse, line-oriented comments.** `main.js` has 79 `//` lines out of 1303 (≈6%); 0 JSDoc/`/* ... */` block comments.
- **No header docstring convention** — file purpose is either implied by name or absent.
- **Inline comments** mark region boundaries (`// ── Config persistence ──`) in `main.js` but are not used consistently.
- **No `README` is required reading** for understanding the code structure; behavior is best understood by reading the IPC channel names in `preload.js` end-to-end.

---

## File references

- `E:\Desktop\workspace\sts2-mod-manager\package.json`
- `E:\Desktop\workspace\sts2-mod-manager\main.js`
- `E:\Desktop\workspace\sts2-mod-manager\preload.js`
- `E:\Desktop\workspace\sts2-mod-manager\src\App.jsx`
- `E:\Desktop\workspace\sts2-mod-manager\src\tauri-api.js`
- `E:\Desktop\workspace\sts2-mod-manager\src\components\*.jsx` (9 components)
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\Cargo.toml`
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\lib.rs`
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\mods.rs`
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\saves.rs`
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\translate.rs`
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\tauri.conf.json`
- `E:\Desktop\workspace\sts2-mod-manager\.github\workflows\build.yml`
- `E:\Desktop\workspace\sts2-mod-manager\.github\workflows\build-windows.yml`
