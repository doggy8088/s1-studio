# AGENTS.md — AI Agent Development Guidelines for S1 Studio

This document defines mandatory project conventions and workflows for all AI coding agents working in the `s1-studio` repository.

---

## 1. Mandatory Version Bump Rule

**Every time an AI agent edits code in this repository, you MUST bump the `patch` version in `package.json` before completing the task or committing.**

- **Single Source of Truth**: `package.json` (`"version": "x.y.z"`).
- **Automatic UI Propagation**: `next.config.ts` reads `pkg.version` from `package.json` and exposes `NEXT_PUBLIC_APP_VERSION` alongside `NEXT_PUBLIC_GIT_SHA` in the application footer.
- **How to bump**:
  - Increment the patch number (e.g., `0.1.0` -> `0.1.1` -> `0.1.2`), or run:
    ```bash
    make bump-patch
    ```

---

## 2. Architecture & Dual-Mode Build Requirements

`s1-studio` supports both **local Next.js development** and **Cloudflare Pages static export + Edge Functions**:

1. **Local Development (`make dev`)**:
   - Uses Next.js App Router API routes under `src/app/api/proxy/route.ts` and `src/app/api/mock-systemone/v1/systemone/route.ts`.
2. **Cloudflare Pages Production (`make cf-build`)**:
   - Exports the static frontend into `out/` via `scripts/build-cf-pages.sh`.
   - Uses Cloudflare Pages Functions under `functions/api/proxy.ts` and `functions/api/mock-systemone/v1/systemone.ts`.
   - **Important**: Whenever you modify `/api/proxy` or `/api/mock-systemone/v1/systemone`, keep `src/app/api/*` and `functions/api/*` in sync.

---

## 3. Verification Checklist Before Committing

Before committing any code change:

1. Bump the patch version in `package.json` (`make bump-patch`).
2. Run full verification (`make check` and `make cf-build`) to ensure TypeScript, ESLint, Next.js build, and Cloudflare static export all pass with zero errors.
3. Write clear, detailed Traditional Chinese (`zh-TW`) commit messages when requested by the user.
