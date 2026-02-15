#!/usr/bin/env bash
set -euo pipefail

# Quick resume script for Fly + Convex provisioning workflow.
# Usage examples:
#   bash dev_utils/resume.sh
#   bash dev_utils/resume.sh --publish-only
#   bash dev_utils/resume.sh --skip-publish
#   USER_ID=user123 TENANT_ID=linkhub-w4 bash dev_utils/resume.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PUBLISH_IMAGE=true
RUN_PROVISION=true
SHOW_LOGS=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish-only)
      PUBLISH_IMAGE=true
      RUN_PROVISION=false
      SHOW_LOGS=false
      shift
      ;;
    --skip-publish)
      PUBLISH_IMAGE=false
      shift
      ;;
    --no-logs)
      SHOW_LOGS=false
      shift
      ;;
    *)
      echo "Argomento non riconosciuto: $1"
      echo "Uso: bash dev_utils/resume.sh [--publish-only] [--skip-publish] [--no-logs]"
      exit 1
      ;;
  esac
done

read_env_local() {
  local key="$1"
  if [[ ! -f .env.local ]]; then
    return 0
  fi
  awk -F= -v k="$key" '$1 == k { print substr($0, index($0, "=") + 1); exit }' .env.local
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Comando richiesto non trovato: $1"
    exit 1
  fi
}

require_cmd fly
require_cmd docker
require_cmd npx
require_cmd node

APP_NAME="${FLY_APP_NAME:-linkhub-agents}"
IMAGE_LOCAL="${IMAGE_LOCAL:-linkhub-agents:openclaw-okr-v1}"
IMAGE_REMOTE="${IMAGE_REMOTE:-registry.fly.io/${APP_NAME}:openclaw-okr-v1}"

USER_ID="${USER_ID:-user123}"
TENANT_ID="${TENANT_ID:-linkhub-w4}"

BRIDGE_URL="${AGENT_BRIDGE_URL:-$(read_env_local AGENT_BRIDGE_URL)}"
SERVICE_ID="${OPENCLAW_SERVICE_ID:-$(read_env_local OPENCLAW_SERVICE_ID)}"
SERVICE_KEY="${OPENCLAW_SERVICE_KEY:-$(read_env_local OPENCLAW_SERVICE_KEY)}"
APP_KEY="${OPENCLAW_APP_KEY:-$(read_env_local OPENCLAW_APP_KEY)}"
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-$(read_env_local OPENCLAW_GATEWAY_TOKEN)}"
APP_KEY="${APP_KEY:-linkhub-w4}"

if [[ "$RUN_PROVISION" == true ]]; then
  for var_name in BRIDGE_URL SERVICE_ID SERVICE_KEY GATEWAY_TOKEN; do
    if [[ -z "${!var_name}" ]]; then
      echo "Variabile richiesta mancante: $var_name"
      echo "Controlla .env.local o esporta la variabile prima di eseguire lo script."
      exit 1
    fi
  done
fi

echo "==> App Fly: $APP_NAME"
echo "==> Immagine locale: $IMAGE_LOCAL"
echo "==> Immagine remota: $IMAGE_REMOTE"

if [[ "$PUBLISH_IMAGE" == true ]]; then
  echo "==> Login docker su Fly registry"
  fly auth docker

  echo "==> Tag immagine"
  docker tag "$IMAGE_LOCAL" "$IMAGE_REMOTE"

  echo "==> Push immagine"
  docker push "$IMAGE_REMOTE"
fi

if [[ "$RUN_PROVISION" == true ]]; then
  echo "==> Creo deploy token Fly (validita 24h)"
  FLY_DEPLOY_TOKEN="$(
    fly tokens create deploy -a "$APP_NAME" -x 24h -j | node -e '
      let d = "";
      process.stdin.on("data", c => (d += c));
      process.stdin.on("end", () => {
        const j = JSON.parse(d);
        process.stdout.write(j.token || j.Token || j.access_token || "");
      });
    '
  )"

  if [[ -z "$FLY_DEPLOY_TOKEN" ]]; then
    echo "Impossibile ottenere FLY_DEPLOY_TOKEN"
    exit 1
  fi

  echo "==> Provisioning macchina via Convex"
  npx convex run example:provisionAgent "{
    \"userId\":\"$USER_ID\",
    \"tenantId\":\"$TENANT_ID\",
    \"flyApiToken\":\"$FLY_DEPLOY_TOKEN\",
    \"flyAppName\":\"$APP_NAME\",
    \"bridgeUrl\":\"$BRIDGE_URL\",
    \"serviceId\":\"$SERVICE_ID\",
    \"serviceKey\":\"$SERVICE_KEY\",
    \"appKey\":\"$APP_KEY\",
    \"openclawGatewayToken\":\"$GATEWAY_TOKEN\",
    \"image\":\"$IMAGE_REMOTE\"
  }"
fi

if [[ "$SHOW_LOGS" == true ]]; then
  echo "==> Mostro i log Fly (Ctrl+C per uscire)"
  fly logs -a "$APP_NAME"
fi
