# RiskHub Frontend Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Build React application
# =============================================================================
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies fresh in container (avoids architecture mismatch).
# The current lint toolchain includes an ESLint/plugin peer range that is
# narrower than the pinned container npm resolver, so keep the lockfile install
# but allow legacy peer resolution inside the Docker build path.
RUN npm ci --include=dev --legacy-peer-deps

# Copy source code (excluding node_modules via .dockerignore)
COPY . .

# Remove any local node_modules that might have been copied
RUN rm -rf node_modules/.cache

# Build for production
RUN npm run build

# =============================================================================
# Stage 2: Production nginx server
# =============================================================================
FROM nginx:alpine AS runtime

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built static files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user for security
RUN addgroup -g 1001 -S riskhub && \
    adduser -S riskhub -u 1001 -G riskhub && \
    chown -R riskhub:riskhub /usr/share/nginx/html && \
    chown -R riskhub:riskhub /var/cache/nginx && \
    chown -R riskhub:riskhub /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R riskhub:riskhub /var/run/nginx.pid

# Run runtime as non-root (install_frontend.sh grants NET_BIND_SERVICE for port 80)
USER riskhub

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Expose port
EXPOSE 80

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
