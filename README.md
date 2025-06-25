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
- ☁️ Cloudflare R2 storage integration
- 🔄 Redis caching (optional)

## Prerequisites

- Bun runtime (for local development)
- Node.js environment (for local development)
- Cloudflare R2 account and bucket (for cloud storage)
- Redis service (for production caching)

## Installation

### Create .env file and configure environment variables

```bash
cp .env.example .env
```

Required environment variables:

```bash
# Redis Configuration (for production - set up in Coolify)
REDIS_URL=redis://localhost:6379

# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_REGION=auto
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

## Running the Service

### Local Development

For development in watch mode:

```bash
bun dev
```

For production (requires build first):

```bash
bun build
bun start
```

### Docker Development

```bash
# Build and run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Build the project:

```bash
bun build
```

Type checking and linting:

```bash
bun lint
```

Format code:

```bash
bun format
```

The service will be available at:

```
http://localhost:3000
```

## Coolify Deployment

### 1. Create Redis Service in Coolify

1. Go to your Coolify dashboard
2. Create a new "Database" service
3. Choose Redis
4. Note the service name (e.g., `redis-service`)

### 2. Configure Image Optimizer App

1. Create a new application in Coolify
2. Connect your Git repository
3. Set build command: `bun build`
4. Set start command: `bun run dist/server.js`
5. Set port: `3000`

### 3. Environment Variables

Set these environment variables in your Coolify app:

```
# Redis Configuration
REDIS_URL=redis://your-redis-service-name:6379

# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_REGION=auto
```

### 4. Link Services (Optional)

In your app settings, link the Redis service as a dependency for better service discovery.

## API Usage

The service exposes a single endpoint for image optimization:

### GET /:src

Path Parameters:

- `src` (required): Source URL of the image to optimize or the R2 bucket key of the image

Query Parameters:

- `w` (optional): Desired width in pixels
- `q` (optional): WebP quality (0-100, default: 75)

Example Request:

```
http://localhost:3000/url-encoded-image-link?w=800&q=80

http://localhost:3000/images/photo.jpg?w=800&q=80
```

The service will:

1. If the parameter `src` is a URL, fetch the image from the provided URL, if not, retrieve the image from the configured R2 bucket using the key
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
  - Built-in S3 client for R2 integration
  - Built-in Redis client
  - File watching
  - Package management
- Redis for caching optimization results
- Cloudflare R2 for scalable cloud storage

## Storage Configuration

### Cloudflare R2 Setup

1. Create a Cloudflare R2 bucket
2. Generate API tokens with appropriate permissions
3. Configure the following environment variables:
   - `R2_ACCOUNT_ID`: Your Cloudflare account ID
   - `R2_ACCESS_KEY_ID`: R2 API token access key
   - `R2_SECRET_ACCESS_KEY`: R2 API token secret key
   - `R2_BUCKET_NAME`: Your R2 bucket name
   - `R2_REGION`: Region (typically "auto" for R2)

### Image Storage

Images are stored in your R2 bucket using the key provided in the request. For example:

- Request: `/images/photo.jpg` → R2 key: `images/photo.jpg`
- Request: `/products/thumbnail.png` → R2 key: `products/thumbnail.png`

## Performance Benefits

WebP format provides:

- Superior compression compared to JPEG/PNG
- Smaller file sizes with quality retention
- Support for lossy and lossless compression
- Broad browser compatibility

R2 storage provides:

- Global edge caching
- High availability and durability
- Cost-effective storage
- S3-compatible API

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

This project is open source and available under the MIT License.

## Contact

Paul George - contact@paulgeorge.dev

Project Link: https://github.com/paulgeorge35/image-optimizer
