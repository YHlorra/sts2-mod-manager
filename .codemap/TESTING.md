# STS2 Mod Manager — Testing

Verified against the working tree on 2026-06-08. Headline finding: **there are no automated tests of any kind in this repository.**

This document records that absence honestly and recommends where tests are most needed.

---

## TL;DR

| Question | Answer |
|---|---|
| Test framework installed? | **No** |
| Test files in repo? | **0** (searched `*.test.js`, `*.spec.js`, `*.test.ts`, `*.test.jsx`, `*.test.rs` across the entire tree, excluding `node_modules`, `dist`, `.codegraph`, `target`) |
| Test script in `package.json`? | **No** — `scripts` keys are `start`, `build:css`, `dev`, `build`, `build:tauri-fe`, `tauri`, `tauri:dev`, `tauri:build`, `pack`, `dist`. No `test`. |
| Test framework in `devDependencies`? | **No** — no `jest`, `vitest`, `mocha`, `chai`, `playwright`, `puppeteer`, `@testing-library/*`, `cargo-test` harness, etc. |
| CI test job? | **No** — `.github/workflows/build.yml` and `build-windows.yml` build artifacts only; neither runs tests because none exist to run. |
| Coverage tooling? | **No** — no `c8`, `istanbul`, `nyc`, `tarpaulin`, `grcov` in either `dependencies` or `devDependencies`. |

This is the verified state, not an oversight. The project ships without a test suite.

---

## What this means in practice

- Every regression risk lives entirely in the manual test loop (build → launch installer → exercise UI).
- The IPC error envelope (`{ success: false, error: e.message }`, 27 sites in `main.js`) gives the UI a way to *show* errors, but nothing enforces that the envelope is correctly constructed on every path.
- The Rust error model (`Result<T, String>` with 59 `?` sites and 18 `.unwrap()` on `Mutex::lock()`) is exercised only at runtime.
- The two archive extraction helpers in `src-tauri/src\mods.rs` (`smart_extract_zip`, `smart_extract_rar`, `smart_extract_7z`) were added recently (commits `8847cc2`, `da1e7f8`, `114476a`, `8b507eb`) and have **zero** test coverage.

---

## Why there are no tests (working hypotheses)

Not directly documented, but the evidence is consistent with:

1. The project started as an Electron prototype and grew into a Tauri port (`src/tauri-api.js` exists explicitly as a bridge replacing `preload.js`). During that growth, test infrastructure was never added.
2. The codebase is mostly side-effectful (filesystem writes, archive extraction, IPC, registry config). Mocking was never set up.
3. The `devDependencies` list is purely a build toolchain (`webpack`, `babel-loader`, `tailwindcss`, `electron-builder`, `@tauri-apps/cli`, `concurrently`, `wait-on`, `autoprefixer`, `postcss`, `style-loader`, `css-loader`). No test runner.

---

## What SHOULD be tested (priority order)

If/when tests are added, the highest-value targets are:

### Priority 1 — archive extraction (highest risk, recent changes)

- **`src-tauri/src\mods.rs:529` `smart_extract_zip`** — feed it known zip files (nested directory layout, flat file layout, empty entries, zip-slip filenames, password-protected).
- **`src-tauri/src\mods.rs:668` `smart_extract_rar`** — same matrix, via `unrar = "0.5"`.
- **`src-tauri/src\mods.rs:715` `smart_extract_7z`** — same matrix, via `sevenz-rust = "0.6"`.
- **`src-tauri/src\mods.rs:513` `smart_extract_archive`** — the dispatcher; must correctly choose between the three.
- **`src-tauri/src\mods.rs:786` `install_mod` (returns `ModResult`)** — end-to-end: file copy + state mutation + manifest write.

Suggested approach: `cargo test` in `src-tauri`, with fixture archives checked in under `src-tauri/tests/fixtures/` (gitignored from installer bundle).

### Priority 2 — mod enable/disable

- **`main.js:560–580` IPC handler** (the `mods:toggle` channel) — verify the `mods/<name>` ↔ `mods_disabled/<name>` move is atomic, that duplicate names are rejected, and that the return shape is always `{ success, error?, mods?, installed? }`.
- The empty `try/catch` at `main.js:217` (size summation) and `main.js:230`/`244` (file probing) are exactly the kind of silently-swallowed errors that a unit test would catch.

### Priority 3 — IPC channel surface

- Every `ipcMain.handle('namespace:action', asyncFn)` in `main.js` (matching the 27 channels in `preload.js`) should have at least one test that:
  - Asserts the handler returns `{ success: true, ... }` on the happy path.
  - Asserts the handler returns `{ success: false, error: 'Game path not set' }` (or equivalent) when preconditions fail.
  - Asserts thrown exceptions are caught and converted to the envelope.

Suggested approach: a Node-side test runner (`vitest` is the lightest) running `main.js` exports in isolation; or a thin Electron integration test using `playwright` / `spectron` (deprecated, use `@playwright/test` with Electron support).

### Priority 4 — save backup / restore

- **`src-tauri/src\saves.rs:343,377,441` `Result<SimpleResult, String>` functions** — verify backup files land in the expected directory, restore overwrites correctly, and `deleteBackup` cleans up.
- **`main.js` IPC handler for `saves:export` / `saves:import` / `saves:deleteBackup`** — same envelope contract as Priority 3.

### Priority 5 — config persistence

- **`src-tauri/src\config.rs`** — verify `set_game_path` / `get_game_path` round-trip and that concurrent `Mutex::lock()` access (the 18 `.unwrap()` sites) does not deadlock under realistic contention.

### Priority 6 — game launch / state machine

- **`src-tauri/src\game.rs`** — `launch_game`, `get_game_state`, `analyze_crash`. Mock the `std::process::Command` invocation; assert state transitions `idle → launching → running → idle`.

### Priority 7 — translation network call

- **`src-tauri/src\translate.rs`** — `TranslateResult` returned from `mymemory.translated.net`. Mock `reqwest`; assert cache hit/miss behavior in `translations.rs`.

---

## React component tests

Currently zero. Lowest priority because:

1. The UI is presentation-only — all state-changing logic lives in main/Rust.
2. Component contracts are simple (props in, JSX out).
3. The risk of regressions is highest in side-effectful paths, not render output.

If added later, `@testing-library/react` + `vitest` is the lightest setup; the 9 components in `src/components/` and `src/App.jsx` would each map to one test file at `src/components/__tests__/Name.test.jsx`.

---

## How tests would be run (when added)

- **Rust**: `cargo test --manifest-path src-tauri/Cargo.toml` (no harness exists yet, so this would be the first command added). Add a `test` step to `.github/workflows/build.yml` and `build-windows.yml` before the build step.
- **JS**: `npx vitest run` or `npm test` (after adding `vitest` to `devDependencies` and `"test": "vitest"` to `scripts`). Add a `test` step to the same workflows.
- **Coverage**: `cargo tarpaulin` for Rust, `vitest --coverage` (via `@vitest/coverage-v8`) for JS.

---

## File references

- `E:\Desktop\workspace\sts2-mod-manager\package.json` — scripts section has no `test` entry
- `E:\Desktop\workspace\sts2-mod-manager\devDependencies` — no test framework
- `E:\Desktop\workspace\sts2-mod-manager\.github\workflows\build.yml` — build-only
- `E:\Desktop\workspace\sts2-mod-manager\.github\workflows\build-windows.yml` — build-only
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\mods.rs` — archive extraction (highest-risk untested surface)
- `E:\Desktop\workspace\sts2-mod-manager\src-tauri\src\saves.rs` — save backup/restore
- `E:\Desktop\workspace\sts2-mod-manager\main.js` — 27 IPC envelope sites, 22 catch blocks
- `E:\Desktop\workspace\sts2-mod-manager\preload.js` — 27 IPC channels that should each have a test
