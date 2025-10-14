# Use official Node.js LTS image
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --silent || npm install --silent

# Copy source and build frontend
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine
WORKDIR /app

# Copy the built workspace from the builder stage
COPY --from=builder /app /app

# Remove common development files and caches to slim the image
RUN rm -rf /app/.git /app/.vscode /app/.venv /app/node_modules/.cache || true

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]
