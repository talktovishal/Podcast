#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUNNER_TEMP-}" != /* || "$RUNNER_TEMP" == "/" || ! -d "$RUNNER_TEMP" ]]; then
  echo "[deployment-ssh] an existing absolute runner temporary directory is required" >&2
  exit 2
fi
directory="$RUNNER_TEMP/articlepod-ssh"
if [[ ! "${GITHUB_RUN_ID-}" =~ ^[0-9]+$ || ! "${GITHUB_RUN_ATTEMPT-}" =~ ^[0-9]+$ ||
      ! "${GITHUB_JOB-}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "[deployment-ssh] a GitHub job identity is required for temporary credential ownership" >&2
  exit 2
fi
owner="$GITHUB_RUN_ID:$GITHUB_RUN_ATTEMPT:$GITHUB_JOB"
cleanup() {
  if [[ -e "$directory" || -L "$directory" ]]; then
    if [[ ! -d "$directory" || -L "$directory" || ! -f "$directory/.owner" ||
          -L "$directory/.owner" || "$(< "$directory/.owner")" != "$owner" ]]; then
      echo "[deployment-ssh] preserving temporary files not owned by this job" >&2
      return 1
    fi
    rm -f -- "$directory/identity" "$directory/known_hosts" "$directory/.owner"
    rmdir -- "$directory"
  fi
}
case "${1-setup}" in
  cleanup) cleanup; exit ;;
  setup) ;;
  *) echo "[deployment-ssh] invalid credential setup action" >&2; exit 2 ;;
esac
if [[ -z "${AZURE_SSH_KEY-}" || -z "${AZURE_SSH_KNOWN_HOSTS-}" ]]; then
  echo "[deployment-ssh] an SSH identity and independently verified host pins are required" >&2
  exit 1
fi
umask 077
mkdir -m 700 -- "$directory"
trap 'status=$?; if [[ "$status" != "0" ]]; then cleanup; fi' EXIT
printf "%s\n" "$owner" > "$directory/.owner"
printf "%s\n" "$AZURE_SSH_KEY" > "$directory/identity"
printf "%s\n" "$AZURE_SSH_KNOWN_HOSTS" > "$directory/known_hosts"
if ! ssh-keygen -y -P "" -f "$directory/identity" >/dev/null 2>&1; then
  echo "[deployment-ssh] the SSH identity must be a valid unattended deployment key" >&2
  exit 1
fi
