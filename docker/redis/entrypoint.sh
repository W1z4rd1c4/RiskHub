#!/bin/sh
set -eu

password_file="${RISKHUB_REDIS_PASSWORD_FILE:-/etc/riskhub/secrets/redis_password}"
if [ ! -f "${password_file}" ]; then
  echo "Missing redis password file: ${password_file}" >&2
  exit 1
fi

runtime_dir="/run/riskhub"
config_path="${runtime_dir}/redis.conf"
mkdir -p "${runtime_dir}"

password="$(tr -d '\r\n' < "${password_file}")"

umask 077
cat >"${config_path}" <<EOF
bind 0.0.0.0
port 6379
appendonly yes
dir /data
requirepass ${password}
EOF

exec redis-server "${config_path}"
