# Keyforge - Docker build image
FROM oven/bun:1-alpine AS base

# Install dependencies for cross-platform builds
RUN apk add --no-cache \
    git \
    ca-certificates \
    build-base

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build stage
FROM base AS builder

# Run tests
RUN bun test

# Build binaries
RUN bun run build

# Create release artifacts
RUN mkdir -p /artifacts && \
    cp dist/* /artifacts/ || true

# Runtime stage - minimal image with just the binary
FROM alpine:3.18 AS runtime

# Install CA certificates for HTTPS
RUN apk add --no-cache ca-certificates

# Create non-root user
RUN adduser -D -s /bin/sh keyforge

# Copy binary from builder
COPY --from=builder /app/dist/keyforge-linux-x64 /usr/local/bin/keyforge

# Make it executable
RUN chmod +x /usr/local/bin/keyforge

# Switch to non-root user
USER keyforge

# Set up data directory
RUN mkdir -p /home/keyforge/.keyforge

WORKDIR /home/keyforge

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD keyforge --version || exit 1

# Default command
ENTRYPOINT ["keyforge"]
CMD ["--help"]

# Multi-stage build for artifacts
FROM scratch AS artifacts
COPY --from=builder /artifacts/ /