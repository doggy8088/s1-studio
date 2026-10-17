#!/usr/bin/env bash
set -euo pipefail

# Temporarily move Next.js App Router API routes out of src/app during static export
# because Cloudflare Pages serves `/api/*` natively from the top-level `functions/api/*` directory.
BACKUP_DIR=".cf-api-backup"

cleanup() {
  if [ -d "$BACKUP_DIR/api" ]; then
    mv "$BACKUP_DIR/api" src/app/api
    rmdir "$BACKUP_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ -d "src/app/api" ]; then
  mkdir -p "$BACKUP_DIR"
  mv src/app/api "$BACKUP_DIR/api"
fi

rm -rf .next/dev/types .next/types
STATIC_EXPORT=1 bun run build
