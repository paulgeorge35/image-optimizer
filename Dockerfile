FROM oven/bun:1-alpine

WORKDIR /app

# Install system dependencies for Sharp
RUN apk add --no-cache \
    vips-dev \
    build-base \
    python3

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun build ./server.ts --outdir ./dist --target bun

EXPOSE 3000

CMD ["bun", "run", "dist/server.js"]