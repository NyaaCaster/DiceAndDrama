#!/usr/bin/env bash
# Pull dicedrama-client:latest from the private registry and (re)start the
# container. Intended for the deploy host — does not build anything.
set -euo pipefail

PROJECT_NAME="dicedrama-client"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

cd "$SCRIPT_DIR"

echo "Pulling latest image ..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" pull

echo "Bringing up ${PROJECT_NAME} ..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d

docker image prune -f >/dev/null
echo "Done."
