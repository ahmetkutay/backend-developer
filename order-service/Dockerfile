# syntax=docker/dockerfile:1

FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --no-audit --no-fund

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime image
FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install wget for healthcheck
USER root
RUN apk add --no-cache wget

# Copy artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Switch to non-root user
USER node

EXPOSE 3001
CMD ["node", "dist/app.js"]
