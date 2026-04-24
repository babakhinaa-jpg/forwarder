# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app/backend

# Install backend dependencies (production only)
COPY backend/package*.json ./
RUN npm ci --production

# Copy backend source
COPY backend/ ./

# Copy built frontend into expected location (backend looks at ../frontend/dist)
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Expose port
EXPOSE 4000

CMD ["node", "index.js"]
