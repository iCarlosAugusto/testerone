#!/bin/sh
# ============================================================
# Docker Entrypoint Script
# Runs database migrations before starting the application
# ============================================================

set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy

echo "🚀 Starting application..."
exec "$@"
