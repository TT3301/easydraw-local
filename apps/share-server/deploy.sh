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
# tar over ssh: no rsync needed on the server. The viewer directory is replaced atomically;
# the container is then recreated because its bind mount still points at the old directory.
tar -C "$here" -cf - server.mjs Dockerfile compose.yaml | ssh "$host" "tar -C '$remote' -xf -"
tar -C "$root/dist-viewer" -cf - . | ssh "$host" "rm -rf '$remote/viewer.new' && mkdir '$remote/viewer.new' && tar -C '$remote/viewer.new' -xf - \
  && rm -rf '$remote/viewer.old' && mv '$remote/viewer' '$remote/viewer.old' && mv '$remote/viewer.new' '$remote/viewer' && rm -rf '$remote/viewer.old'"
ssh "$host" "test -f '$remote/.env' || { umask 077; printf 'SHARE_TOKEN=%s\n' \"\$(openssl rand -base64 36 | tr -d '\n')\" > '$remote/.env'; echo 'Created $remote/.env with a new SHARE_TOKEN'; }
  cd '$remote' && docker compose up -d --build --force-recreate && docker compose ps"
