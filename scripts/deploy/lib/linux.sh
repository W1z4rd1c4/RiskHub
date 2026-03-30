#!/usr/bin/env bash
set -euo pipefail

linux_python_bin() {
  printf '%s\n' "${RISKHUB_PYTHON_BIN:-python3.13}"
}

linux_require_prerequisites() {
  require_cmd python3
  require_cmd tar
  require_cmd systemctl
  require_cmd nginx
  require_cmd curl
  require_cmd redis-server
  local pybin
  pybin="$(linux_python_bin)"
  require_cmd "$pybin"
  run "$pybin" --version >/dev/null
}

linux_preflight() {
  local config_path="$1"
  local allow_port_in_use="${2:-false}"
  linux_require_prerequisites
  local runtime_dir=""
  runtime_dir="$(make_runtime_dir "$config_path" "linux")"
  local rc=0
  {
    source_metadata_env "$runtime_dir"
    check_bind_port "$FRONTEND_BIND_PORT" "$allow_port_in_use"
    warn_if_path_not_encrypted_mount "$SECRET_DIR"
  } || rc=$?
  cleanup_runtime_dir "$runtime_dir"
  return "$rc"
}

linux_bundle_require_entry() {
  local bundle_path="$1"
  local entry_path="$2"
  if tar -tzf "$bundle_path" "$entry_path" >/dev/null 2>&1; then
    return 0
  fi
  die "Missing required file in bundle: ${entry_path}"
}

linux_install_release() {
  local bundle_path="$1"
  local release_version="$2"
  local release_dir="${LINUX_RELEASES_DIR}/${release_version}"
  local extract_root
  extract_root="$(mktemp -d "${TMPDIR:-/tmp}/riskhub-linux-release.XXXXXX")"
  local extracted_dir="${extract_root}/riskhub-linux-${release_version}"
  local rc=0

  {
    if [[ -e "$release_dir" ]]; then
      die "Release directory already exists: ${release_dir}"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
      linux_bundle_require_entry "$bundle_path" "riskhub-linux-${release_version}/manifest.json"
      linux_bundle_require_entry "$bundle_path" "riskhub-linux-${release_version}/scripts/deploy.sh"
      linux_bundle_require_entry "$bundle_path" "riskhub-linux-${release_version}/scripts/deploy/lib/render.py"
      run tar -xzf "$bundle_path" -C "$extract_root"
      ensure_dir "$LINUX_RELEASES_DIR"
      run_privileged mv "${extracted_dir}" "$release_dir"
      ensure_linux_user
      run_privileged chown -R "${LINUX_USER}:${LINUX_GROUP}" "$release_dir"
    else
      run tar -xzf "$bundle_path" -C "$extract_root"
      require_file "${extracted_dir}/manifest.json"
      require_file "${extracted_dir}/scripts/deploy.sh"
      require_file "${extracted_dir}/scripts/deploy/lib/render.py"
      ensure_dir "$LINUX_RELEASES_DIR"
      run_privileged mv "$extracted_dir" "$release_dir"
      ensure_linux_user
      run_privileged chown -R "${LINUX_USER}:${LINUX_GROUP}" "$release_dir"
    fi
  } || rc=$?

  rm -rf "$extract_root"
  return "$rc"
}

linux_install_venvs() {
  local release_dir="$1"
  local pybin
  pybin="$(linux_python_bin)"
  run_privileged_sh \
    "$pybin -m venv ${release_dir}/venv" \
    "$(printf '%q' "$pybin") -m venv $(printf '%q' "${release_dir}/venv")"

  local runtime_pip_bin="${release_dir}/venv/bin/pip"
  local runtime_requirements_file="${release_dir}/backend/requirements-db.txt"
  local wheel_dir="${release_dir}/backend/wheels"
  run_privileged_sh \
    "${runtime_pip_bin} install --no-index --find-links ${wheel_dir} -r ${runtime_requirements_file}" \
    "$(printf '%q' "$runtime_pip_bin") install --no-index --find-links $(printf '%q' "$wheel_dir") -r $(printf '%q' "$runtime_requirements_file")"
  run_privileged chown -R "${LINUX_USER}:${LINUX_GROUP}" "${release_dir}/venv"
}

linux_render_runtime_files() {
  local config_path="$1"
  local runtime_dir="$2"
  local tmp_runtime
  tmp_runtime="$(make_temp_dir_in_parent_dir "$(dirname "$runtime_dir")" "riskhub-linux-runtime")"
  local rc=0

  {
    render_runtime_dir "$config_path" "linux" "$tmp_runtime"
    copy_runtime_file "${tmp_runtime}/backend.env" "$LINUX_BACKEND_ENV" 640
    copy_runtime_file "${tmp_runtime}/frontend.env" "${runtime_dir}/frontend.env" 640
    copy_runtime_file "${tmp_runtime}/metadata.env" "${runtime_dir}/metadata.env" 640
    copy_runtime_file "${tmp_runtime}/redis_url" "${runtime_dir}/redis_url" 440

    local backend_unit_tmp="${tmp_runtime}/riskhub-backend.service"
    local scheduler_unit_tmp="${tmp_runtime}/riskhub-scheduler.service"
    local redis_unit_tmp="${tmp_runtime}/riskhub-redis.service"
    local nginx_site_tmp="${tmp_runtime}/riskhub.conf"
    local nginx_full_tmp="${tmp_runtime}/nginx-full.conf"
    render_linux_backend_unit "$config_path" "$backend_unit_tmp"
    render_linux_scheduler_unit "$config_path" "$scheduler_unit_tmp"
    render_linux_redis_unit "$redis_unit_tmp"
    render_linux_site "$config_path" "$nginx_site_tmp"
    render_linux_nginx_full "$config_path" "$nginx_full_tmp"

    run nginx -t -c "$nginx_full_tmp" -p "$tmp_runtime"

    copy_file "$backend_unit_tmp" "/etc/systemd/system/${LINUX_BACKEND_SERVICE}.service" 644
    copy_file "$scheduler_unit_tmp" "/etc/systemd/system/${LINUX_SCHEDULER_SERVICE}.service" 644
    copy_file "$redis_unit_tmp" "/etc/systemd/system/${LINUX_REDIS_SERVICE}.service" 644
    copy_file "$nginx_site_tmp" "$LINUX_NGINX_SITE" 644
  } || rc=$?

  cleanup_temp_dir "$tmp_runtime"
  return "$rc"
}

linux_run_release_command() {
  local workdir="$1"
  local display="$2"
  local command_body="$3"
  local env_loader
  env_loader="$(envfile_loader_snippet "$LINUX_BACKEND_ENV")"
  run_privileged_sh \
    "$display" \
    "$(cat <<EOF
set -euo pipefail
${env_loader}
cd $(printf '%q' "$workdir")
${command_body}
EOF
)"
}

linux_run_db_tasks() {
  local release_dir="$1"
  local runtime_workdir="${release_dir}/backend"
  local python_bin="${release_dir}/venv/bin/python"
  local alembic_bin="${release_dir}/venv/bin/alembic"
  local pythonpath="${release_dir}/backend"

  linux_run_release_command \
    "$runtime_workdir" \
    "cd ${runtime_workdir} && PYTHONPATH=${pythonpath} ${alembic_bin} upgrade head" \
    "export PYTHONPATH=$(printf '%q' "$pythonpath"); $(printf '%q' "$alembic_bin") upgrade head"

  linux_run_release_command \
    "$runtime_workdir" \
    "cd ${runtime_workdir} && PYTHONPATH=${pythonpath} ${python_bin} -m scripts.seed_roles_permissions" \
    "export PYTHONPATH=$(printf '%q' "$pythonpath"); $(printf '%q' "$python_bin") -m scripts.seed_roles_permissions"

  linux_run_release_command \
    "$runtime_workdir" \
    "cd ${runtime_workdir} && PYTHONPATH=${pythonpath} ${python_bin} -m scripts.seed_departments" \
    "export PYTHONPATH=$(printf '%q' "$pythonpath"); $(printf '%q' "$python_bin") -m scripts.seed_departments"

  linux_run_release_command \
    "$runtime_workdir" \
    "cd ${runtime_workdir} && PYTHONPATH=${pythonpath} ${python_bin} -m scripts.bootstrap_sso_user --email <admin> --role admin --access-scope global" \
    "export PYTHONPATH=$(printf '%q' "$pythonpath"); $(printf '%q' "$python_bin") -m scripts.bootstrap_sso_user --email \"\$BOOTSTRAP_ADMIN_EMAIL\" --role admin --access-scope global"

  linux_run_release_command \
    "$runtime_workdir" \
    "cd ${runtime_workdir} && PYTHONPATH=${pythonpath} ${python_bin} -m scripts.bootstrap_sso_user --email <cro> --role cro --access-scope global" \
    "export PYTHONPATH=$(printf '%q' "$pythonpath"); $(printf '%q' "$python_bin") -m scripts.bootstrap_sso_user --email \"\$BOOTSTRAP_CRO_EMAIL\" --role cro --access-scope global"
}

linux_reload_services() {
  run_privileged systemctl daemon-reload
  run_privileged systemctl enable --now "$LINUX_REDIS_SERVICE"
  run_privileged systemctl enable --now "$LINUX_BACKEND_SERVICE"
  run_privileged systemctl enable --now "$LINUX_SCHEDULER_SERVICE"
  run_privileged systemctl restart "$LINUX_REDIS_SERVICE"
  run_privileged systemctl restart "$LINUX_BACKEND_SERVICE"
  run_privileged systemctl restart "$LINUX_SCHEDULER_SERVICE"
  run_privileged systemctl restart nginx
}

linux_deploy_or_upgrade() {
  local action="$1"
  local config_path="$2"
  local bundle_path="$3"
  require_file "$bundle_path"

  local allow_port_in_use="false"
  if [[ "$action" == "upgrade" ]]; then
    allow_port_in_use="true"
    [[ -L "$LINUX_CURRENT_LINK" ]] || die "Current linux deployment not found. Use install for first setup."
  else
    [[ ! -L "$LINUX_CURRENT_LINK" ]] || die "Existing linux deployment detected. Use upgrade instead of install."
  fi

  linux_preflight "$config_path" "$allow_port_in_use"
  local user_action="install"
  if [[ "$action" == "upgrade" ]]; then
    user_action="upgrade"
  fi
  confirm_or_die "Run linux ${user_action} using the release bundle?"

  local release_version
  release_version="$(bundle_version "$bundle_path")"
  local release_dir="${LINUX_RELEASES_DIR}/${release_version}"
  local previous_target=""
  if [[ -L "$LINUX_CURRENT_LINK" ]]; then
    previous_target="$(readlink "$LINUX_CURRENT_LINK")"
  fi

  linux_install_release "$bundle_path" "$release_version"
  if [[ "$DRY_RUN" != "true" ]]; then
    use_deploy_assets_from_root "$release_dir"
  fi
  linux_install_venvs "$release_dir"
  # shellcheck disable=SC2153 # RUNTIME_DIR is a sourced global from deploy/lib/common.sh.
  linux_render_runtime_files "$config_path" "$RUNTIME_DIR"
  linux_run_db_tasks "$release_dir"

  if [[ -n "$previous_target" ]]; then
    run_privileged ln -sfn "$previous_target" "$LINUX_PREVIOUS_LINK"
  fi
  run_privileged ln -sfn "$release_dir" "$LINUX_CURRENT_LINK"
  linux_reload_services
  linux_smoke "$config_path"
}

linux_status() {
  printf '%s\n' "COMPONENT	STATUS"
  for unit in "$LINUX_BACKEND_SERVICE" "$LINUX_SCHEDULER_SERVICE" "nginx" "$LINUX_REDIS_SERVICE"; do
    local status
    status="$(systemctl is-active "$unit" 2>/dev/null || true)"
    printf '%s\t%s\n' "$unit" "${status:-unknown}"
  done
  if [[ -L "$LINUX_CURRENT_LINK" ]]; then
    printf '%s\t%s\n' "current-release" "$(readlink "$LINUX_CURRENT_LINK")"
  else
    printf '%s\t%s\n' "current-release" "missing"
  fi
  if [[ -L "$LINUX_PREVIOUS_LINK" ]]; then
    printf '%s\t%s\n' "previous-release" "$(readlink "$LINUX_PREVIOUS_LINK")"
  else
    printf '%s\t%s\n' "previous-release" "missing"
  fi
}

linux_logs() {
  local service="$1"
  local follow="$2"
  local tail_lines="$3"
  local journal_args=(-n "$tail_lines")
  if [[ "$follow" == "true" ]]; then
    journal_args+=(-f)
  fi

  case "$service" in
    backend) run_privileged journalctl -u "$LINUX_BACKEND_SERVICE" "${journal_args[@]}" ;;
    scheduler) run_privileged journalctl -u "$LINUX_SCHEDULER_SERVICE" "${journal_args[@]}" ;;
    frontend) run_privileged journalctl -u nginx "${journal_args[@]}" ;;
    redis) run_privileged journalctl -u "$LINUX_REDIS_SERVICE" "${journal_args[@]}" ;;
    all)
      run_privileged journalctl -u "$LINUX_BACKEND_SERVICE" -u "$LINUX_SCHEDULER_SERVICE" -u nginx -u "$LINUX_REDIS_SERVICE" "${journal_args[@]}"
      ;;
    *)
      die "Invalid --service for linux logs (expected all|backend|scheduler|frontend|redis)"
      ;;
  esac
}

linux_smoke() {
  local config_path="$1"
  local runtime_dir=""
  runtime_dir="$(make_runtime_dir "$config_path" "linux")"
  local rc=0
  {
    source_metadata_env "$runtime_dir"

    local frontend_url="http://127.0.0.1:${FRONTEND_BIND_PORT}"
    local backend_url="http://127.0.0.1:8000"

    if [[ "$DRY_RUN" == "true" ]]; then
      run curl -fsS -H "Host: ${SERVER_NAME}" "${frontend_url}/"
      run curl -fsS -H "Host: ${SERVER_NAME}" "${frontend_url}/api/v1/health"
      run curl -sS -H "Host: ${SERVER_NAME}" -o /dev/null -w "%{http_code}" "${backend_url}/docs"
      run curl -sS -H "Host: ${SERVER_NAME}" -o /dev/null -w "%{http_code}" "${backend_url}/openapi.json"
    else
      curl -fsS -H "Host: ${SERVER_NAME}" "${frontend_url}/" >/dev/null
      curl -fsS -H "Host: ${SERVER_NAME}" "${frontend_url}/api/v1/health" >/dev/null

      local docs_code
      docs_code="$(curl -sS -H "Host: ${SERVER_NAME}" -o /dev/null -w "%{http_code}" "${backend_url}/docs" 2>/dev/null || true)"
      local openapi_code
      openapi_code="$(curl -sS -H "Host: ${SERVER_NAME}" -o /dev/null -w "%{http_code}" "${backend_url}/openapi.json" 2>/dev/null || true)"
      [[ "$docs_code" == "404" ]] || die "Expected /docs to be disabled in production, got HTTP ${docs_code}"
      [[ "$openapi_code" == "404" ]] || die "Expected /openapi.json to be disabled in production, got HTTP ${openapi_code}"

      [[ -L "$LINUX_CURRENT_LINK" ]] || die "Current linux deployment not found for reliability check"
      local release_dir
      release_dir="$(readlink "$LINUX_CURRENT_LINK")"
      local python_bin="${release_dir}/venv/bin/python"
      local reliability_report
      reliability_report="$(
        linux_run_release_command \
          "${release_dir}/backend" \
          "cd ${release_dir}/backend && ${python_bin} reliability runtime check" \
          "$(cat <<EOF
$(printf '%q' "$python_bin") - <<'PY'
import asyncio
import json
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

REQUIRED_TABLES = {"scheduler_job_runs", "app_outbox_events"}


async def main() -> None:
    db_url = Path(os.environ["DATABASE_URL_FILE"]).read_text(encoding="utf-8").strip()
    engine = create_async_engine(db_url)
    try:
        async with engine.connect() as conn:
            table_names = set(
                (
                    await conn.execute(
                        text(
                            "SELECT tablename FROM pg_tables "
                            "WHERE schemaname = 'public' "
                            "AND tablename IN ('scheduler_job_runs', 'app_outbox_events')"
                        )
                    )
                ).scalars()
            )
            missing_tables = sorted(REQUIRED_TABLES - table_names)
            scheduler_runtime_rows = 0
            dead_letter_count = 0
            if not missing_tables:
                scheduler_runtime_rows = int(
                    (
                        await conn.execute(
                            text(
                                "SELECT COUNT(*) FROM scheduler_job_runs "
                                "WHERE job_name = '__scheduler_runtime__' AND status = 'running'"
                            )
                        )
                    ).scalar_one()
                )
                dead_letter_count = int(
                    (
                        await conn.execute(
                            text("SELECT COUNT(*) FROM app_outbox_events WHERE status = 'dead_letter'")
                        )
                    ).scalar_one()
                )
    finally:
        await engine.dispose()

    payload = {
        "missing_tables": missing_tables,
        "scheduler_runtime_rows": scheduler_runtime_rows,
        "dead_letter_count": dead_letter_count,
    }
    if missing_tables or scheduler_runtime_rows != 1 or dead_letter_count != 0:
        raise SystemExit(json.dumps(payload, sort_keys=True))
    print(json.dumps(payload, sort_keys=True))


asyncio.run(main())
PY
EOF
)"
      )"
      log "Smoke: reliability runtime OK ${reliability_report}"
    fi
  } || rc=$?

  cleanup_runtime_dir "$runtime_dir"
  return "$rc"
}

linux_rollback() {
  local config_path="$1"
  [[ -L "$LINUX_CURRENT_LINK" ]] || die "Current linux deployment not found."
  [[ -L "$LINUX_PREVIOUS_LINK" ]] || die "Previous linux deployment not found."
  linux_preflight "$config_path" "true"
  confirm_or_die "Rollback linux deployment to the previous release? (DB will NOT be downgraded)"

  local current_target previous_target
  current_target="$(readlink "$LINUX_CURRENT_LINK")"
  previous_target="$(readlink "$LINUX_PREVIOUS_LINK")"
  run_privileged ln -sfn "$previous_target" "$LINUX_CURRENT_LINK"
  run_privileged ln -sfn "$current_target" "$LINUX_PREVIOUS_LINK"
  linux_reload_services
  linux_smoke "$config_path"
}
