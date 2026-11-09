FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
ENV NODE_ENV=production DATA_DIR=/data VIEWER_DIR=/viewer HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=60s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:8787/viewer.html || exit 1
CMD ["node", "server.mjs"]
