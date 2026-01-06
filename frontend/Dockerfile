# RiskHub Frontend Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Build React application
# =============================================================================
FROM node:20-alpine as builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --silent

# Copy source code
COPY . .

# Build for production
RUN npm run build

# =============================================================================
# Stage 2: Production nginx server
# =============================================================================
FROM nginx:alpine as runtime

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built static files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user for security
RUN addgroup -g 1001 -S riskhub && \
    adduser -S riskhub -u 1001 -G riskhub && \
    chown -R riskhub:riskhub /usr/share/nginx/html && \
    chown -R riskhub:riskhub /var/cache/nginx && \
    touch /var/run/nginx.pid && \
    chown -R riskhub:riskhub /var/run/nginx.pid

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Expose port
EXPOSE 80

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
