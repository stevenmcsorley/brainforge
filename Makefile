.PHONY: help dev dev-db seed generate-dataset install build clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── Development ──────────────────────────────────────────────────────────────

dev: ## Start all services with Docker Compose (hot-reload)
	docker compose up

dev-db: ## Start only Postgres + Redis (for running API locally without Docker)
	docker compose up postgres redis

dev-api: ## Run NestJS API in dev mode (requires database running)
	cd apps/api && npm run start:dev

dev-web: ## Run Vite frontend dev server
	cd apps/web && npm run dev

dev-worker: ## Run Python sim-worker (requires database + redis running)
	cd apps/sim-worker && PYTHONPATH=../../python python -m sim_worker.main

# ─── Setup ────────────────────────────────────────────────────────────────────

install: ## Install all npm dependencies
	npm install
	@echo "✓ npm packages installed"

install-python: ## Create venv and install Python dependencies
	python3 -m venv .venv
	.venv/bin/pip install -r python/engine/requirements.txt
	@echo "✓ Python packages installed"

# ─── Database ─────────────────────────────────────────────────────────────────

migrate: ## Run Prisma migrations
	cd apps/api && npx prisma migrate dev

migrate-deploy: ## Apply migrations (production)
	cd apps/api && npx prisma migrate deploy

seed: ## Seed the database with sample brain model data
	cd apps/api && npx prisma db seed

generate-dataset: ## Generate the sample connectome dataset files
	python3 python/datasets/sample_connectome/generate.py

# ─── Build ────────────────────────────────────────────────────────────────────

build: ## Build all packages and apps
	npm run build --workspace=packages/contracts
	npm run build --workspace=packages/types
	npm run build --workspace=packages/config
	npm run build --workspace=apps/api
	npm run build --workspace=apps/web

build-web: ## Build web frontend only
	cd apps/web && npm run build

build-api: ## Build NestJS API only
	cd apps/api && npm run build

# ─── Docker ───────────────────────────────────────────────────────────────────

docker-build: ## Build all Docker images
	docker compose build

docker-reset: ## Destroy all containers and volumes, start fresh
	docker compose down -v
	docker compose up --build

# ─── Clean ────────────────────────────────────────────────────────────────────

clean: ## Remove build artifacts
	find . -name "dist" -not -path "*/node_modules/*" -exec rm -rf {} +
	find . -name "__pycache__" -exec rm -rf {} +
	find . -name "*.pyc" -delete

# ─── Verify ───────────────────────────────────────────────────────────────────

check-health: ## Ping the API health endpoint
	curl -s http://localhost:3001/api/admin/health | python3 -m json.tool

check-db: ## Check database connection via Prisma
	cd apps/api && npx prisma db execute --stdin <<< "SELECT current_database();"
