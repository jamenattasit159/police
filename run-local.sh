#!/usr/bin/env bash
# Run the app locally: Postgres in Docker + Go serving the built frontend on http://localhost:8080
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
docker compose up -d db
(cd frontend && npm run build)
cd backend
DATABASE_URL="postgres://police:${DB_PASSWORD}@127.0.0.1:5433/police" STATIC_DIR=../frontend/dist exec go run .
