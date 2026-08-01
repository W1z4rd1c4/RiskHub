# RiskHub Frontend Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Build React application
# =============================================================================
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS builder

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
FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS runtime

# Patch base OS packages to the latest point releases on every rebuild so that
# CVEs fixed in Alpine's stable branch (e.g. openssl 3.5.7-r0) get picked up
# automatically, not just at the next manual digest bump. Then keep the runtime
# to plain nginx: the official Alpine image ships optional dynamic modules and
# their image/curl dependencies that this SPA does not use.
RUN apk upgrade --no-cache && \
    apk del --no-cache \
    curl \
    nginx-module-acme \
    nginx-module-geoip \
    nginx-module-image-filter \
    nginx-module-njs \
    nginx-module-xslt

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
