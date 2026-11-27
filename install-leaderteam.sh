#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER_JS=""

if [[ -f "${SCRIPT_DIR}/bin/lt-installer.mjs" && -f "${SCRIPT_DIR}/leaderteam/core/installer.mjs" ]]; then
  INSTALLER_JS="${SCRIPT_DIR}/bin/lt-installer.mjs"
elif [[ -f "${SCRIPT_DIR}/installer/lt-installer-standalone.mjs" ]]; then
  INSTALLER_JS="${SCRIPT_DIR}/installer/lt-installer-standalone.mjs"
elif [[ -f "${SCRIPT_DIR}/lt-installer-standalone.mjs" ]]; then
  INSTALLER_JS="${SCRIPT_DIR}/lt-installer-standalone.mjs"
elif [[ -f "${SCRIPT_DIR}/bin/lt-installer.mjs" ]]; then
  INSTALLER_JS="${SCRIPT_DIR}/bin/lt-installer.mjs"
else
  echo "[LeaderTeam] 未找到安装器脚本，请先完整解压安装包目录。" >&2
  exit 1
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

echo "[LeaderTeam] 未检测到 Node.js (>= 22.15) 或官方 DeepSeek Harness 客户端，请先安装后再次运行本脚本。" >&2
exit 1
