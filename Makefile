.PHONY: help install dev build cf-build cf-deploy start lint typecheck check clean

PORT ?= 3000
CF_PROJECT ?= s1-studio

help: ## Show available make targets
	@echo "S1 Studio (s1-studio) — Common Tasks"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install dependencies with bun
	bun install

dev: ## Start Next.js development server (default PORT=3000)
	bun run dev -- --port $(PORT)

build: ## Create standard Next.js production build
	bun run build

cf-build: ## Build static export (out/) + Cloudflare Pages Functions (functions/)
	bun run build:cf

cf-deploy: cf-build ## Deploy out/ and functions/ to Cloudflare Pages via Wrangler
	npx wrangler pages deploy out --project-name=$(CF_PROJECT)

start: ## Start Next.js production server (default PORT=3000)
	bun run start -- --port $(PORT)

lint: ## Run ESLint code quality checks
	bun run lint

typecheck: ## Run TypeScript compiler type check (noEmit)
	bun x tsc --noEmit

check: typecheck lint build ## Run full verification pipeline (typecheck + lint + build)

clean: ## Remove Next.js build artifacts and caches
	rm -rf .next out tsconfig.tsbuildinfo .cf-api-backup
