# BrainForge: Deployment & Migration Guide

This document outlines the exact steps required to clone, configure, and boot the entire BrainForge monorepo on a completely fresh machine. 

By following these instructions, the system will automatically rebuild all necessary Docker containers, deploy the PostgreSQL schema, and sequentially execute the advanced seed scripts to generate all empirical connectome models and synaptic plasticity experiments.

## Prerequisites

Ensure your new machine has the following dependencies installed:
- **Git** (for cloning the repository)
- **Node.js** (v20+ recommended)
- **Python** 3.10+ (for backend simulation worker and data generation)
- **Docker** and **Docker Compose** (for running the database, redis, backend, and worker locally)
- Pnpm or Npm workspace support.

---

## Migration Steps

### 1. Clone the Repository
Clone your project onto the new machine and navigate into the root directory:
```bash
git clone <your-brainforge-repo-url>
cd brainforge
```

### 2. Install Workspace Node Dependencies
Install the package dependencies across all workspaces (`apps/api`, `apps/web`, `apps/sim-worker`, `packages/*`).
```bash
make install
# Alternately: npm install
```

### 3. Install Python Dependencies
BrainForge relies on a local Python environment to generate synthetic connectomes (like the Schaefer empirical models) and execute the physics engine.
```bash
make install-python
# This creates a localized `.venv` and installs numpy, scipy, nilearn, etc.
```

### 4. Boot the Container Environment
Start the Dockerized services. This brings up the PostgreSQL database, the Redis message broker, the NestJS API, and the Python simulation worker.
```bash
make dev
```
*Wait approximately 15-30 seconds for the PostgreSQL container to initialize on its very first run.*

### 5. Generate Empirical Datasets
Before seeding the database, the system must download (via Nilearn) and generate the local `.npz` files that represent the underlying structural matrices for advanced models like the Mouse Connectome and Schaefer 400. Open a **new terminal tab** and run:
```bash
make generate-dataset
# Wait for this script to finish. It will create files inside python/datasets/
```

### 6. Run the Master Database Migration & Seeding Sequence
This is the most critical step. Due to recent improvements, the Prisma seed command has been chained to run a sequential series of scripts. Running this command will:
1. Push the SQL Prisma Schema into the newly created Postgres container.
2. Seed the baseline DK68 synthetic model.
3. Import the generated AAL-90, Mouse Connectome, and Schaefer 400 empirical models via `scripts/seed-models.ts`.
4. Create the specialized 'Synaptic Plasticity' and '10-Minute Intensive Training' experiments for the Mouse Connectome.
5. Create the Seizure and Resting-State dynamic experiments for the massive 159,600-connection Schaefer model.

In your terminal, run:
```bash
cd apps/api
npm run db:setup
```

### 7. View the Application
Once the `db:setup` command completes successfully, start the frontend development server:
```bash
make dev-web
```
Navigate to **http://localhost:5173**. Your new machine now contains an exact replica of the advanced BrainForge environment, complete with all massive connectome structures and Hebbian learning experiments!
