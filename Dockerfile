# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm install typescript -g
RUN npx tsc -p tsconfig.server.json

# Stage 3: Production Runtime
FROM node:20-alpine
WORKDIR /app

# Copy package files and install ONLY production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/dist-server ./dist-server
# Copy built frontend to a public folder for the server to serve (if configured)
# OR we assume the server serves it.
# In our server/index.ts, we didn't add static file serving.
# We should add it to server/index.ts to make this a self-contained container.
COPY --from=frontend-builder /app/dist ./public

# Environment variables will be passed via docker-compose
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "dist-server/server/index.js"]
