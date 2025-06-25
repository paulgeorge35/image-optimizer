# Use the official Bun image
FROM oven/bun:1-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for Sharp
RUN apk add --no-cache \
    vips-dev \
    build-base \
    python3 \
    curl

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun build ./server.ts --outdir ./dist --target bun

# Create logs directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/favicon.ico || exit 1

# Start the application
CMD ["bun", "run", "dist/server.js"]