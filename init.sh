#!/bin/bash
set -e

echo "=== STS2 Mod Manager - Verification ==="
echo ""

# Rust verification
echo "[1/4] Running cargo check..."
cd src-tauri
cargo check

echo "[2/4] Running cargo clippy..."
cargo clippy -- -D warnings

echo "[3/4] Running cargo fmt check..."
cargo fmt --check

echo "[4/4] Running cargo test..."
cargo test

echo ""
echo "=== All checks passed ==="