#!/usr/bin/env bash
set -euo pipefail

# Supports both local invocation and one-line pipe:
#   curl -fsSL https://raw.githubusercontent.com/youzi-ovo-create/leaderteam/main/install-leaderteam.sh | bash

SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

INSTALLER_JS=""
if [[ -n "${SCRIPT_DIR}" ]]; then
  if [[ -f "${SCRIPT_DIR}/bin/lt-installer.mjs" && -f "${SCRIPT_DIR}/leaderteam/core/installer.mjs" ]]; then
    INSTALLER_JS="${SCRIPT_DIR}/bin/lt-installer.mjs"
  elif [[ -f "${SCRIPT_DIR}/installer/lt-installer-standalone.mjs" ]]; then
    INSTALLER_JS="${SCRIPT_DIR}/installer/lt-installer-standalone.mjs"
  elif [[ -f "${SCRIPT_DIR}/lt-installer-standalone.mjs" ]]; then
    INSTALLER_JS="${SCRIPT_DIR}/lt-installer-standalone.mjs"
  elif [[ -f "${SCRIPT_DIR}/bin/lt-installer.mjs" ]]; then
    INSTALLER_JS="${SCRIPT_DIR}/bin/lt-installer.mjs"
  fi
fi

if [[ -z "${INSTALLER_JS}" ]]; then
  DL_DIR="${TMPDIR:-/tmp}/leaderteam-downloader"
  mkdir -p "${DL_DIR}"
  DL_JS="${DL_DIR}/lt-installer-standalone.mjs"
  DL_TMP="${DL_DIR}/lt-installer-standalone.$$.tmp.mjs"
  PRIMARY_URL="https://raw.githubusercontent.com/youzi-ovo-create/leaderteam/main/installer/lt-installer-standalone.mjs"
  FALLBACK_URL="https://github.com/youzi-ovo-create/leaderteam/releases/latest/download/lt-installer-standalone.mjs"
  LEGACY_URL="https://raw.githubusercontent.com/youzi-ovo-create/dsh-leaderteam-releases/main/installer/lt-installer-standalone.mjs"
  echo "[LeaderTeam] 正在下载统一安装器..." >&2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "${DL_TMP}" "${PRIMARY_URL}" || curl -fsSL -o "${DL_TMP}" "${FALLBACK_URL}" || curl -fsSL -o "${DL_TMP}" "${LEGACY_URL}"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "${DL_TMP}" "${PRIMARY_URL}" || wget -qO "${DL_TMP}" "${FALLBACK_URL}" || wget -qO "${DL_TMP}" "${LEGACY_URL}"
  else
    echo "[LeaderTeam] 未找到 curl 或 wget，请先安装或手动下载 lt-installer-standalone.mjs。" >&2
    exit 1
  fi
  mv -f "${DL_TMP}" "${DL_JS}"
  INSTALLER_JS="${DL_JS}"
fi

if command -v node >/dev/null 2>&1; then
  exec node "${INSTALLER_JS}" "$@"
fi

for cand in "/opt/node/bin/node" "${HOME}/.nvm/current/bin/node" "/usr/local/bin/node"; do
  if [[ -x "${cand}" ]]; then
    exec "${cand}" "${INSTALLER_JS}" "$@"
  fi
done

for dsh_bin in "${DSH_DESKTOP_DIR:-}/deepseek-harness" "/opt/DeepSeek Harness/deepseek-harness" "/opt/deepseek-harness/deepseek-harness"; do
  if [[ -n "${dsh_bin}" && -x "${dsh_bin}" ]]; then
    export ELECTRON_RUN_AS_NODE=1
    exec "${dsh_bin}" "${INSTALLER_JS}" "$@"
  fi
done

echo "[LeaderTeam] 未检测到 Node.js (>= 22.15) 或官方 DeepSeek Harness 客户端。" >&2
echo "请先前往 https://deepseekdsh.com 安装 DeepSeek Harness（或安装 Node.js >= 22.15）后重新运行本命令。" >&2
exit 1
