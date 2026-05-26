#!/usr/bin/env bash
# Build the cloudsave image, tag it (latest + git short hash), start the
# container, and optionally push to the private registry.
#
# Usage:
#   ./rebuild.sh              # build, tag, up, push
#   ./rebuild.sh --no-cache   # add --no-cache to the build step
#   ./rebuild.sh --no-push    # skip the docker push step
set -euo pipefail

REGISTRY="h.hony-wen.com:5000"
IMAGE_NAME="cloudsave"
PROJECT_NAME="cloudsave"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NO_CACHE=0
NO_PUSH=0
for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE=1 ;;
    --no-push)  NO_PUSH=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

GIT_SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
if [[ -z "$GIT_SHORT" ]]; then
  echo "Failed to read git short hash from $REPO_ROOT" >&2
  exit 1
fi

cd "$SCRIPT_DIR"

echo "Building ${IMAGE_NAME} @ ${GIT_SHORT} ..."
if [[ $NO_CACHE -eq 1 ]]; then
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" build --no-cache
else
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" build
fi

docker tag "${IMAGE_NAME}:latest" "${REGISTRY}/${IMAGE_NAME}:latest"
docker tag "${IMAGE_NAME}:latest" "${REGISTRY}/${IMAGE_NAME}:${GIT_SHORT}"

echo "Bringing up ${PROJECT_NAME} ..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d

if [[ $NO_PUSH -eq 0 ]]; then
  echo "Pushing to ${REGISTRY} ..."
  docker push "${REGISTRY}/${IMAGE_NAME}:latest"
  docker push "${REGISTRY}/${IMAGE_NAME}:${GIT_SHORT}"
else
  echo "Skipped registry push (--no-push)."
fi

DANGLING="$(docker images -f dangling=true -q || true)"
if [[ -n "$DANGLING" ]]; then
  docker rmi -f $DANGLING >/dev/null 2>&1 || true
fi

echo "Done. ${IMAGE_NAME}:${GIT_SHORT} ready."
