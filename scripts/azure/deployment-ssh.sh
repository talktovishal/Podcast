#!/usr/bin/env bash

configure_deployment_ssh() {
  local connect_timeout="$1"
  local alive_interval="$2"
  local alive_count="$3"
  local lookup port
  local options=(
    -o BatchMode=yes
    -o ConnectTimeout="$connect_timeout"
    -o ServerAliveInterval="$alive_interval"
    -o ServerAliveCountMax="$alive_count"
  )

  if [[ "${TARGET_KNOWN_HOSTS_FILE+x}" == "x" ]]; then
    if [[ ! "$TARGET_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && ! "$TARGET_HOST" =~ ^[a-fA-F0-9:]+:[a-fA-F0-9:]*$ ]] ||
       [[ ! "$TARGET_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*$ ]] ||
       [[ ! "$TARGET_PORT" =~ ^[0-9]{1,5}$ ]]; then
      echo "[deployment-ssh] invalid explicit SSH target" >&2
      return 2
    fi
    port=$((10#$TARGET_PORT))
    if (( port < 1 || port > 65535 )); then
      echo "[deployment-ssh] invalid SSH port" >&2
      return 2
    fi
    if [[ "$TARGET_KNOWN_HOSTS_FILE" != /* ]] ||
       [[ "$TARGET_KNOWN_HOSTS_FILE" == *['"'\%\$\\]* ]] ||
       [[ "$TARGET_KNOWN_HOSTS_FILE" =~ [[:cntrl:]] ]] ||
       [[ ! -f "$TARGET_KNOWN_HOSTS_FILE" || ! -r "$TARGET_KNOWN_HOSTS_FILE" ||
          ! -s "$TARGET_KNOWN_HOSTS_FILE" || -L "$TARGET_KNOWN_HOSTS_FILE" ]]; then
      echo "[deployment-ssh] an absolute readable literal known-hosts file is required" >&2
      return 2
    fi
    lookup="$TARGET_HOST"
    if (( port != 22 )); then
      lookup="[$TARGET_HOST]:$port"
    fi
    if ! ssh-keygen -F "$lookup" -f "$TARGET_KNOWN_HOSTS_FILE" >/dev/null 2>&1; then
      echo "[deployment-ssh] no stored host pin matches the explicit target and port; verify independently" >&2
      return 1
    fi
    options+=(
      -F /dev/null
      -o StrictHostKeyChecking=yes
      -o "UserKnownHostsFile=\"$TARGET_KNOWN_HOSTS_FILE\""
      -o GlobalKnownHostsFile=/dev/null
      -o UpdateHostKeys=no
      -o VerifyHostKeyDNS=no
      -o IdentitiesOnly=yes
      -o IdentityAgent=none
      -o ForwardAgent=no
      -o ClearAllForwardings=yes
    )
  elif [[ "${ARTICLEPOD_SECRET_SOURCE-environment}" != "environment" ]]; then
    echo "[deployment-ssh] explicit host pins are required outside legacy environment mode" >&2
    return 2
  fi

  SSH_ARGS=(-p "$TARGET_PORT")
  SCP_ARGS=(-P "$TARGET_PORT")
  if [[ -n "${TARGET_SSH_KEY:-}" ]]; then
    SSH_ARGS+=(-i "$TARGET_SSH_KEY")
    SCP_ARGS+=(-i "$TARGET_SSH_KEY")
  fi
  SSH_ARGS+=("${options[@]}")
  SCP_ARGS+=("${options[@]}")
}

deployment_rsync_shell() {
  local arg
  printf 'ssh'
  for arg in "${SSH_ARGS[@]}"; do
    # rsync parses quotes itself; doubled quotes preserve literal quote characters.
    arg="${arg//\'/\'\'}"
    printf " '%s'" "$arg"
  done
}
