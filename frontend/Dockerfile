# RiskHub Frontend Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Build React application
# =============================================================================
FROM node:24-alpine@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14 AS builder

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
FROM nginx:alpine@sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa AS runtime

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
