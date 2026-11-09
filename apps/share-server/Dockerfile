# syntax=docker/dockerfile:1
# Self-hosted EasyDraw share server with the read-only viewer baked in.
# Build context: repository root.  docker build -f apps/share-server/Dockerfile .

# The viewer is static, architecture-independent output: build it once on the native build platform.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS viewer
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages ./packages
# No lifecycle scripts: the viewer build needs neither Electron nor onnxruntime binaries.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build:viewer

FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/TT3301/easydraw-local" \
      org.opencontainers.image.description="EasyDraw Local self-hosted share server (ciphertext storage + read-only viewer)" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY apps/share-server/server.mjs ./
COPY --from=viewer /src/dist-viewer /viewer
ENV NODE_ENV=production DATA_DIR=/data VIEWER_DIR=/viewer HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=60s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:8787/viewer.html || exit 1
CMD ["node", "server.mjs"]
