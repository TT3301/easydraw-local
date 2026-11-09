#!/usr/bin/env bash
# Builds the viewer locally and deploys the share server to a VPS over SSH.
# Usage: apps/share-server/deploy.sh <ssh-host> [remote-dir]
# The nginx site file and DNS record are set up once by hand (see README.md).
set -euo pipefail
host="${1:?usage: deploy.sh <ssh-host> [remote-dir]}"
remote="${2:-/root/easydraw-share}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

(cd "$root" && npm run build:viewer)
ssh "$host" "mkdir -p '$remote/data' '$remote/viewer' && chown 1000:1000 '$remote/data'"
rsync -rlt --checksum "$here/server.mjs" "$here/Dockerfile" "$here/compose.yaml" "$host:$remote/"
rsync -rlt --checksum --delete "$root/dist-viewer/" "$host:$remote/viewer/"
ssh "$host" "test -f '$remote/.env' || { umask 077; printf 'SHARE_TOKEN=%s\n' \"\$(openssl rand -base64 36 | tr -d '\n')\" > '$remote/.env'; echo 'Created $remote/.env with a new SHARE_TOKEN'; }
  cd '$remote' && docker compose up -d --build && docker compose ps"
