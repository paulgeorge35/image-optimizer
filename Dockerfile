# Build stage
FROM oven/bun:1 as builder

WORKDIR /app

# Create images directory
RUN mkdir -p /app/images && chmod 755 /app/images

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files and images
COPY . .

# Build the application
RUN bun run build:prod

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/images ./images
COPY package.json bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Create images directory if it doesn't exist and set permissions
RUN mkdir -p /app/images && chmod 755 /app/images

# Expose the port the app runs on
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["bun", "dist/server.js"] 