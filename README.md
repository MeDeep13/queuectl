# Quick links

- Project root commands shown assume you run them from the project root (QUEUECTL).
- Worker process file: src/workers/worker.js
- CLI entrypoint: src/cli/queuectl.js
- Job model: src/models/job.js
- Config store: .config/config.json (CLI editable) and .env (defaults)

# 1. Setup — run locally
## Prerequisites

- Node.js (v16+ recommended)
- npm
- MongoDB instance (Atlas connection string)  [MY CONNECTION STRING IS AVAILABLE IN .ENV FILE, IF THAT DON'T WORK IN ANY CASE, USE PERSONAL CONNECTION STRING OF MONGODB ATLAS]

## Files you should create/verify

- .env (project root) — below is my connection string

- DB_URL=mongodb+srv://admin:admin@kuldeepcluster.5zaybhb.mongodb.net/?appName=KuldeepCluster
  BACKOFF_BASE=2
  DEFAULT_MAX_RETRIES=3

- .config/config.json is created automatically by the CLI when needed.
