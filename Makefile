.PHONY: help install dev build start lint typecheck check clean

PORT ?= 3000

help: ## Show available make targets
	@echo "S1 Studio (s1-studio) — Common Tasks"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install dependencies with bun
	bun install

dev: ## Start Next.js development server (default PORT=3000)
	bun run dev -- --port $(PORT)

build: ## Create optimized production build
	bun run build

start: ## Start Next.js production server (default PORT=3000)
	bun run start -- --port $(PORT)

lint: ## Run ESLint code quality checks
	bun run lint

typecheck: ## Run TypeScript compiler type check (noEmit)
	bun x tsc --noEmit

check: typecheck lint build ## Run full verification pipeline (typecheck + lint + build)

clean: ## Remove Next.js build artifacts and caches
	rm -rf .next out tsconfig.tsbuildinfo
