FROM node:20-alpine
WORKDIR /app

# Install pnpm using corepack
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Install production deps first (layer cache-friendly)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy source
COPY . .

# Create a non-root user and own the uploads dir
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && mkdir -p /app/uploads && chown -R appuser:appgroup /app/uploads

USER appuser

EXPOSE 4001

ENV NODE_ENV=production

# Docker-level health check — lets orchestrators mark the container unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4001/health || exit 1

CMD ["node", "server.js"]
