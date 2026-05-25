#!/bin/sh
set -eu

mkdir -p /app/logs

if [ "$(id -u)" = "0" ]; then
  chown -R riskhub:riskhub /app/logs
  exec su-exec riskhub "$@"
fi

exec "$@"
