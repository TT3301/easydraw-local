#!/usr/bin/env bash
# Deploys (or updates) the share server on a VPS from the GHCR image.
# Usage: apps/share-server/deploy.sh <ssh-host> [remote-dir] [image-tag]
# The nginx site file and DNS record are set up once by hand (see README.md).
set -euo pipefail
export COPYFILE_DISABLE=1 # no macOS AppleDouble (._*) files in the tar stream
host="${1:?usage: deploy.sh <ssh-host> [remote-dir] [image-tag]}"
remote="${2:-/root/easydraw-share}"
tag="${3:-latest}"
here="$(cd "$(dirname "$0")" && pwd)"

ssh "$host" "mkdir -p '$remote/data' && chown 1000:1000 '$remote/data'"
tar -C "$here" -cf - compose.yaml | ssh "$host" "tar -C '$remote' -xf -"
ssh "$host" "set -e; cd '$remote'
  test -f .env || { umask 077; printf 'SHARE_TOKEN=%s\n' \"\$(openssl rand -base64 36 | tr -d '\n')\" > .env; echo 'Created .env with a new SHARE_TOKEN'; }
  EASYDRAW_SHARE_TAG='$tag' docker compose pull
  EASYDRAW_SHARE_TAG='$tag' docker compose up -d
  docker compose ps"
