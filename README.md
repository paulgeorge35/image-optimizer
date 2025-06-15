# Image Optimizer Service

> A high-performance image optimization service built with Bun and TypeScript.
> This service handles image optimization through WebP conversion, width resizing, and quality control.
> Perfect for reducing image sizes while maintaining quality in web applications.

## Features

- 🖼️ WebP conversion for optimal compression
- 📏 Dynamic image resizing
- 🎯 Adjustable quality settings
- ⚡ High-performance Bun runtime
- 🔄 Auto-reload in development mode
- 🐳 Docker support with Redis caching

## Prerequisites

- Bun runtime (for local development)
- Node.js environment (for local development)
- Docker and Docker Compose (for containerized deployment)

## Installation

### Create .env file and set REDIS_PASSWORD

```bash
cp .env.example .env
```

### Local Development

1. Install Bun if not already installed:

```bash
curl -fsSL https://bun.sh/install | bash
```

2. Install dependencies:

```bash
bun install
```

### Docker Deployment

1. Build and start the services:

```bash
docker compose up --build
```

Or run in detached mode:

```bash
docker compose up --build -d
```

2. Stop the services:

```bash
docker compose down
```

To remove volumes when stopping:

```bash
docker compose down -v
```

## Running the Service

### Local Development

For production:

```bash
bun start
```

For development in watch mode:

```bash
bun dev
```

Type checking:

```bash
bun type-check
```

### Docker Environment

The service will be available at:

```
http://localhost:3000
```

Environment variables are configured in docker-compose.yml:

- PORT=3000
- REDIS_URL=redis://redis:6379

## API Usage

The service exposes a single endpoint for image optimization:

### GET /:src

Path Parameters:

- `src` (required): Source URL of the image to optimize or the name of the image in the `images` directory

Query Parameters:

- `w` (optional): Desired width in pixels
- `q` (optional): WebP quality (0-100, default: 75)

Example Request:

```
http://localhost:3000/url-encoded-image-link?w=800&q=80

http://localhost:3000/image-name?w=800&q=80
```

The service will:

1. If the parameter `src` is a URL, fetch the image from the provided URL, if not, look for the image in the `images` directory
2. Check if the image is already in the Redis cache, if it is, return the cached image
3. If the image is not in the cache, optimize it by resizing it to the specified width (if provided) and converting it to WebP format
4. Cache the optimized image in Redis
5. Return the optimized image

## Technical Details

The service leverages:

- TypeScript for type safety
- Bun's native features:
  - Fast JavaScript/TypeScript runtime
  - Built-in fetch API
  - File watching
  - Package management
- Docker with multi-stage builds for optimized deployment
- Redis for caching optimization results

## Performance Benefits

WebP format provides:

- Superior compression compared to JPEG/PNG
- Smaller file sizes with quality retention
- Support for lossy and lossless compression
- Broad browser compatibility

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

This project is open source and available under the MIT License.

## Contact

Paul George - contact@paulgeorge.dev

Project Link: https://github.com/paulgeorge35/image-optimizer
