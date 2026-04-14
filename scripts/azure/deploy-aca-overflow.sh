#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

RG="${AZURE_RESOURCE_GROUP:-rg-articlepod-prod-eastus}"
ENV_NAME="${CONTAINERAPP_ENV_NAME:-articlepod-aca-env}"
APP_NAME="${CONTAINERAPP_NAME:-articlepod-overflow}"
ACR_NAME="${ACR_NAME:-articlepodacrdvlolaz43j6be}"
ENV_FILE="${ENV_FILE:-}"
WORKER_IMAGE_REPO="${WORKER_IMAGE_REPO:-articlepod/worker}"
PYTHON_TTS_IMAGE_REPO="${PYTHON_TTS_IMAGE_REPO:-articlepod/python-tts}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
MIN_REPLICAS="${MIN_REPLICAS:-0}"
MAX_REPLICAS="${MAX_REPLICAS:-1}"
QUEUE_WAKE_LENGTH="${QUEUE_WAKE_LENGTH:-1}"
WORKER_CPU="${WORKER_CPU:-0.25}"
WORKER_MEMORY="${WORKER_MEMORY:-0.5Gi}"
PYTHON_TTS_CPU="${PYTHON_TTS_CPU:-1.75}"
PYTHON_TTS_MEMORY="${PYTHON_TTS_MEMORY:-3.5Gi}"
WORKER_CONTAINER_NAME="${WORKER_CONTAINER_NAME:-worker}"
PYTHON_TTS_CONTAINER_NAME="${PYTHON_TTS_CONTAINER_NAME:-python-tts}"
STATE_VOLUME_NAME="${STATE_VOLUME_NAME:-runtime-state}"
LOG_VOLUME_NAME="${LOG_VOLUME_NAME:-runtime-logs}"

usage() {
  cat <<EOF
Usage: scripts/azure/deploy-aca-overflow.sh --env-file <path> [options]

Builds and deploys the overflow worker + python-tts sidecar app to Azure Container Apps.

Options:
  --resource-group <name>         Resource group (default: ${RG})
  --environment <name>            Container Apps environment name (default: ${ENV_NAME})
  --app-name <name>               Container App name (default: ${APP_NAME})
  --acr-name <name>               Azure Container Registry name (default: ${ACR_NAME})
  --env-file <path>               Runtime env file copied from production (required)
  --image-tag <tag>               Image tag for both images (default: ${IMAGE_TAG})
  --min-replicas <n>              Minimum replicas (default: ${MIN_REPLICAS})
  --max-replicas <n>              Maximum replicas (default: ${MAX_REPLICAS})
  --queue-wake-length <n>         Queue length that wakes ACA from zero (default: ${QUEUE_WAKE_LENGTH})
  --worker-cpu <cores>            Worker CPU allocation (default: ${WORKER_CPU})
  --worker-memory <Gi>            Worker memory allocation (default: ${WORKER_MEMORY})
  --python-tts-cpu <cores>        Python TTS CPU allocation (default: ${PYTHON_TTS_CPU})
  --python-tts-memory <Gi>        Python TTS memory allocation (default: ${PYTHON_TTS_MEMORY})
  -h, --help                      Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group|-g)
      RG="${2:-}"
      shift 2
      ;;
    --environment)
      ENV_NAME="${2:-}"
      shift 2
      ;;
    --app-name)
      APP_NAME="${2:-}"
      shift 2
      ;;
    --acr-name)
      ACR_NAME="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="${2:-}"
      shift 2
      ;;
    --min-replicas)
      MIN_REPLICAS="${2:-}"
      shift 2
      ;;
    --max-replicas)
      MAX_REPLICAS="${2:-}"
      shift 2
      ;;
    --queue-wake-length)
      QUEUE_WAKE_LENGTH="${2:-}"
      shift 2
      ;;
    --worker-cpu)
      WORKER_CPU="${2:-}"
      shift 2
      ;;
    --worker-memory)
      WORKER_MEMORY="${2:-}"
      shift 2
      ;;
    --python-tts-cpu)
      PYTHON_TTS_CPU="${2:-}"
      shift 2
      ;;
    --python-tts-memory)
      PYTHON_TTS_MEMORY="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$ENV_FILE" ]]; then
  echo "Missing --env-file." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file does not exist: $ENV_FILE" >&2
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI 'az' is required." >&2
  exit 1
fi

az extension add --name containerapp --upgrade >/dev/null

if ! az acr show -g "$RG" -n "$ACR_NAME" >/dev/null 2>&1; then
  echo "ACR '$ACR_NAME' not found in resource group '$RG'." >&2
  exit 1
fi

if ! az containerapp env show -g "$RG" -n "$ENV_NAME" >/dev/null 2>&1; then
  echo "Container Apps environment '$ENV_NAME' not found in resource group '$RG'." >&2
  exit 1
fi

subscription_id="$(az account show --query id -o tsv)"
environment_resource_id="$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query id -o tsv)"
environment_location="$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query location -o tsv)"
acr_login_server="$(az acr show -g "$RG" -n "$ACR_NAME" --query loginServer -o tsv)"
acr_username="$(az acr credential show -g "$RG" -n "$ACR_NAME" --query username -o tsv)"
acr_password="$(az acr credential show -g "$RG" -n "$ACR_NAME" --query passwords[0].value -o tsv)"
worker_image="${acr_login_server}/${WORKER_IMAGE_REPO}:${IMAGE_TAG}"
python_tts_image="${acr_login_server}/${PYTHON_TTS_IMAGE_REPO}:${IMAGE_TAG}"

az acr build -r "$ACR_NAME" -t "${WORKER_IMAGE_REPO}:${IMAGE_TAG}" -f "$ROOT_DIR/Dockerfile.worker" "$ROOT_DIR" >/dev/null
az acr build -r "$ACR_NAME" -t "${PYTHON_TTS_IMAGE_REPO}:${IMAGE_TAG}" -f "$ROOT_DIR/services/python-tts/Dockerfile" "$ROOT_DIR" >/dev/null

manifest_file="$(mktemp "${TMPDIR:-/tmp}/articlepod-overflow-aca.XXXXXX.json")"

python3 - "$ENV_FILE" "$manifest_file" "$environment_resource_id" "$environment_location" "$acr_login_server" "$acr_username" "$acr_password" "$worker_image" "$python_tts_image" "$MIN_REPLICAS" "$MAX_REPLICAS" "$QUEUE_WAKE_LENGTH" "$WORKER_CONTAINER_NAME" "$PYTHON_TTS_CONTAINER_NAME" "$WORKER_CPU" "$WORKER_MEMORY" "$PYTHON_TTS_CPU" "$PYTHON_TTS_MEMORY" "$STATE_VOLUME_NAME" "$LOG_VOLUME_NAME" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

(
    env_file,
    manifest_file,
    environment_resource_id,
    environment_location,
    acr_login_server,
    acr_username,
    acr_password,
    worker_image,
    python_tts_image,
    min_replicas,
    max_replicas,
    queue_wake_length,
    worker_container_name,
    python_tts_container_name,
    worker_cpu,
    worker_memory,
    python_tts_cpu,
    python_tts_memory,
    state_volume_name,
    log_volume_name,
) = sys.argv[1:]


def parse_env_file(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def parse_connection_string_value(connection_string: str, key: str) -> str | None:
    prefix = f"{key}="
    for part in connection_string.split(";"):
        if part.startswith(prefix):
            return part[len(prefix):]
    return None


def infer_storage_account_name(values: dict[str, str]) -> str | None:
    override = values.get("AZURE_STORAGE_ACCOUNT_NAME")
    if override:
        return override
    connection_string = values.get("AZURE_STORAGE_CONNECTION_STRING")
    if connection_string:
        return parse_connection_string_value(connection_string, "AccountName")
    account_url = values.get("AZURE_STORAGE_ACCOUNT_URL")
    if account_url:
        try:
            from urllib.parse import urlparse

            hostname = urlparse(account_url).hostname or ""
            return hostname.split(".", 1)[0] or None
        except Exception:
            return None
    return None


source_env = parse_env_file(env_file)
storage_account_name = infer_storage_account_name(source_env)

secret_keys = {
    "AZURE_STORAGE_CONNECTION_STRING",
    "AZURE_STORAGE_SAS_TOKEN",
    "AZURE_TABLE_CONNECTION_STRING",
    "AZURE_TABLE_SAS_TOKEN",
    "PYTHON_TTS_SECRET",
    "OVERFLOW_PYTHON_TTS_SECRET",
    "DIGEST_SCHEDULER_SECRET",
    "AZURE_OPENAI_API_KEY",
    "OPENAI_API_KEY",
}

secret_name_map = {
    "AZURE_STORAGE_CONNECTION_STRING": "azure-storage-connection-string",
    "AZURE_STORAGE_SAS_TOKEN": "azure-storage-sas-token",
    "AZURE_TABLE_CONNECTION_STRING": "azure-table-connection-string",
    "AZURE_TABLE_SAS_TOKEN": "azure-table-sas-token",
    "PYTHON_TTS_SECRET": "python-tts-secret",
    "OVERFLOW_PYTHON_TTS_SECRET": "overflow-python-tts-secret",
    "DIGEST_SCHEDULER_SECRET": "digest-scheduler-secret",
    "AZURE_OPENAI_API_KEY": "azure-openai-api-key",
    "OPENAI_API_KEY": "openai-api-key",
}

worker_env_order = [
    "RUNTIME_PROFILE",
    "ANALYTICS_STORAGE_MODE",
    "JOB_EVENT_STORAGE_MODE",
    "DEMO_EXTRACTION_TRACE_ENABLED",
    "METADATA_PRIMARY_BACKEND",
    "METADATA_MIRROR_BACKEND",
    "METADATA_MIRROR_DUAL_WRITE",
    "METADATA_CANARY_COMPARE",
    "WORKER_QUEUE_PRESSURE_SOURCE",
    "AZURE_TABLE_CONNECTION_STRING",
    "AZURE_TABLE_ACCOUNT_URL",
    "AZURE_TABLE_SAS_TOKEN",
    "AZURE_TABLE_PREFIX",
    "AZURE_TABLE_CREATE_TABLES",
    "WORKER_ROLE",
    "WORKER_OVERFLOW_ENABLED",
    "WORKER_OVERFLOW_POLICY_EVAL_MS",
    "WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH",
    "WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH",
    "WORKER_OVERFLOW_ACTIVATE_OLDEST_MS",
    "WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS",
    "WORKER_OVERFLOW_MIN_ACTIVE_MS",
    "OVERFLOW_PYTHON_TTS_URL",
    "OVERFLOW_PYTHON_TTS_TIMEOUT_MS",
    "OVERFLOW_PYTHON_TTS_SECRET",
    "STORAGE_BACKEND",
    "STORAGE_ROOT",
    "MEDIA_ROOT",
    "UPLOAD_ROOT",
    "AZURE_STORAGE_CONTAINER",
    "AZURE_STORAGE_CREATE_CONTAINER",
    "AZURE_STORAGE_CONNECTION_STRING",
    "AZURE_STORAGE_ACCOUNT_URL",
    "AZURE_STORAGE_SAS_TOKEN",
    "ITEM_DISPATCH_BACKEND",
    "ITEM_DISPATCH_QUEUE_NAME",
    "ITEM_DISPATCH_CREATE_QUEUE",
    "ITEM_DISPATCH_VISIBILITY_MS",
    "ITEM_DISPATCH_HEARTBEAT_MS",
    "ITEM_DISPATCH_MAX_DELIVERIES",
    "LOG_ROOT",
    "LOG_RETENTION_DAYS",
    "LOG_ERROR_RETENTION_DAYS",
    "LOG_MAX_BYTES",
    "LOG_MAX_FILES",
    "WORKER_POLL_MS",
    "WORKER_STALE_PROCESSING_MS",
    "WORKER_MAX_STALE_RETRIES",
    "WORKER_MAX_PROCESSING_MS",
    "WORKER_RETRY_POLL_MS",
    "WORKER_RAW_ARTIFACT_RETENTION_DAYS",
    "AUDIO_RETENTION_DAYS",
    "WORKER_TTS_CHUNK_MAX_CHARS",
    "DIGEST_INTERNAL_SCHEDULER_ENABLED",
    "DIGEST_SCHEDULER_SECRET",
    "DIGEST_RUN_MAX_RETRY_ATTEMPTS",
    "DIGEST_SUMMARY_PROVIDER",
    "DIGEST_SUMMARY_PROXY_URL",
    "DIGEST_SUMMARY_TIMEOUT_MS",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT",
    "AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT",
    "DIGEST_EMAIL_PROVIDER",
    "OPENAI_API_KEY",
    "PYTHON_TTS_URL",
    "PYTHON_TTS_TIMEOUT_MS",
    "PYTHON_TTS_SECRET",
    "DEMO_EMAIL",
]

python_tts_env_order = [
    "RUNTIME_PROFILE",
    "PYTHON_TTS_SECRET",
    "PYTHON_TTS_RECYCLE_RSS_MB",
    "PYTHON_TTS_RECYCLE_IDLE_SECONDS",
    "LOG_ROOT",
    "LOG_RETENTION_DAYS",
    "LOG_ERROR_RETENTION_DAYS",
    "LOG_MAX_BYTES",
    "LOG_MAX_FILES",
    "DEMO_EMAIL",
    "TTS_WORKERS",
]

overrides = {
    "WORKER_ROLE": "overflow",
    "WORKER_OVERFLOW_ENABLED": "1",
    "WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH": "3",
    "WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH": "1",
    "WORKER_OVERFLOW_ACTIVATE_OLDEST_MS": "120000",
    "WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS": "60000",
    "WORKER_OVERFLOW_MIN_ACTIVE_MS": "1200000",
    "OVERFLOW_PYTHON_TTS_URL": "http://127.0.0.1:8010",
    "TTS_WORKERS": "1",
    "LOG_ROOT": "/var/log/articlepod",
    "STORAGE_ROOT": "/var/lib/articlepod/storage",
    "MEDIA_ROOT": "/var/lib/articlepod/media",
    "UPLOAD_ROOT": "/var/lib/articlepod/uploads",
    "PYTHON_TTS_URL": "http://127.0.0.1:8010",
}


def env_entry(key: str) -> dict[str, str] | None:
    value = overrides.get(key, source_env.get(key))
    if value is None:
      return None
    entry = {"name": key}
    if key in secret_keys and value != "":
        entry["secretRef"] = secret_name_map[key]
    else:
        entry["value"] = value
    return entry


worker_env = [entry for key in worker_env_order if (entry := env_entry(key))]
python_tts_env = [entry for key in python_tts_env_order if (entry := env_entry(key))]

secrets = [
    {"name": "acr-password", "value": acr_password},
]
for key in sorted(secret_keys):
    value = overrides.get(key, source_env.get(key, ""))
    if value:
        secrets.append({"name": secret_name_map[key], "value": value})

doc = {
    "location": environment_location,
    "properties": {
        "managedEnvironmentId": environment_resource_id,
        "configuration": {
            "activeRevisionsMode": "Single",
            "secrets": secrets,
            "registries": [
                {
                    "server": acr_login_server,
                    "username": acr_username,
                    "passwordSecretRef": "acr-password",
                }
            ],
        },
        "template": {
            "containers": [
                {
                    "name": worker_container_name,
                    "image": worker_image,
                    "env": worker_env,
                    "resources": {
                        "cpu": float(worker_cpu),
                        "memory": worker_memory,
                    },
                    "volumeMounts": [
                        {
                            "volumeName": state_volume_name,
                            "mountPath": "/var/lib/articlepod",
                        },
                        {
                            "volumeName": log_volume_name,
                            "mountPath": "/var/log/articlepod",
                        },
                    ],
                },
                {
                    "name": python_tts_container_name,
                    "image": python_tts_image,
                    "env": python_tts_env,
                    "resources": {
                        "cpu": float(python_tts_cpu),
                        "memory": python_tts_memory,
                    },
                    "volumeMounts": [
                        {
                            "volumeName": log_volume_name,
                            "mountPath": "/var/log/articlepod",
                        }
                    ],
                },
            ],
            "scale": {
                "minReplicas": int(min_replicas),
                "maxReplicas": int(max_replicas),
                "rules": [
                    {
                        "name": "item-dispatch-queue",
                        "azureQueue": {
                            **({"accountName": storage_account_name} if storage_account_name else {}),
                            "queueName": overrides.get("ITEM_DISPATCH_QUEUE_NAME", source_env.get("ITEM_DISPATCH_QUEUE_NAME", "articlepod-item-dispatch")),
                            "queueLength": int(queue_wake_length),
                            "auth": [
                                {
                                    "secretRef": "azure-storage-connection-string",
                                    "triggerParameter": "connection",
                                }
                            ],
                        },
                    }
                ],
            },
            "volumes": [
                {"name": state_volume_name, "storageType": "EmptyDir"},
                {"name": log_volume_name, "storageType": "EmptyDir"},
            ],
        },
    }
    },
}

Path(manifest_file).write_text(json.dumps(doc, indent=2), encoding="utf-8")
PY

containerapp_uri="https://management.azure.com/subscriptions/${subscription_id}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/${APP_NAME}?api-version=2026-01-01"

az rest \
  --method put \
  --uri "$containerapp_uri" \
  --body "@${manifest_file}" \
  >/dev/null

rm -f "$manifest_file"

az containerapp show -g "$RG" -n "$APP_NAME" --query '{name:name,latestRevision:properties.latestRevisionName,minReplicas:properties.template.scale.minReplicas,maxReplicas:properties.template.scale.maxReplicas}' -o json
