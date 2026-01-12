# ============================================================
# Multi-Stage Dockerfile for NestJS + Prisma API
# Optimized for production: security, size, and performance
# ============================================================

# ============================================================
# Stage 1: Dependencies
# Install all dependencies for building
# ============================================================
FROM node:20-alpine AS deps

# Install libc6-compat for Prisma engines on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files for layer caching
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# ============================================================
# Stage 2: Builder
# Build the application
# ============================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the NestJS application
RUN npm run build

# Remove devDependencies for production
RUN npm prune --production

# ============================================================
# Stage 3: Runner (Production)
# Minimal image for running the application
# ============================================================
FROM node:20-alpine AS runner

# Install libc6-compat for Prisma engines
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Create non-root user for security (using built-in node user)
# The node:alpine image already has a 'node' user
RUN chown -R node:node /app

# Copy only necessary files from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Copy the Prisma config if it exists (for Prisma 7+)
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts

# Switch to non-root user
USER node

# Expose the application port
EXPOSE 3000

# Health check (optional but recommended)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the application
CMD ["node", "dist/main.js"]
