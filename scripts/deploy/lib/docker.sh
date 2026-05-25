#!/usr/bin/env bash
set -euo pipefail

docker_require_running() {
  require_cmd docker
  if ! docker ps >/dev/null 2>&1; then
    die "Docker daemon not reachable. Ensure Docker Engine is running and your user can run docker."
  fi
}

docker_preflight() {
  local config_path="$1"
  local allow_port_in_use="${2:-false}"
  docker_require_running
  local runtime_dir=""
  runtime_dir="$(make_runtime_dir "$config_path" "docker")"
  local rc=0

  {
    warn_if_path_not_encrypted_mount "$SECRET_DIR"
    local args=(
      --backend-env "${runtime_dir}/backend.env"
      --frontend-env "${runtime_dir}/frontend.env"
    )
    if [[ "$allow_port_in_use" == "true" ]]; then
      args+=(--allow-frontend-port-in-use)
    fi
    if [[ "$YES" == "true" ]]; then
      args+=(--yes)
    fi
    if [[ "$DRY_RUN" == "true" ]]; then
      args+=(--dry-run)
    fi
    if [[ "$VERBOSE" == "true" ]]; then
      args+=(--verbose)
    fi

    # shellcheck disable=SC2153 # RUNTIME_DIR is a sourced global from deploy/lib/common.sh.
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/preflight.sh" "${args[@]}"
  } || rc=$?

  cleanup_runtime_dir "$runtime_dir"
  return "$rc"
}

docker_require_release_images() {
  local version="$1"
  local backend_image_in="$2"
  local backend_db_image_in="$3"
  local frontend_image_in="$4"
  local redis_image_in="$5"

  if [[ -n "$version" && ( -z "$backend_image_in" || -z "$backend_db_image_in" || -z "$frontend_image_in" || -z "$redis_image_in" ) ]]; then
    die "Docker --version defaults require immutable image digests from a digest manifest; pass all four explicit digest image refs for now."
  fi
  if [[ -z "$version" && ( -z "$backend_image_in" || -z "$backend_db_image_in" || -z "$frontend_image_in" || -z "$redis_image_in" ) ]]; then
    die "Pass all of --backend-image, --backend-db-image, --frontend-image, and --redis-image as immutable digest refs for docker deploy/upgrade."
  fi

  require_immutable_image_ref "--backend-image" "$backend_image_in"
  require_immutable_image_ref "--backend-db-image" "$backend_db_image_in"
  require_immutable_image_ref "--frontend-image" "$frontend_image_in"
  require_immutable_image_ref "--redis-image" "$redis_image_in"

  DOCKER_BACKEND_IMAGE="$backend_image_in"
  DOCKER_BACKEND_DB_IMAGE="$backend_db_image_in"
  DOCKER_FRONTEND_IMAGE="$frontend_image_in"
  DOCKER_REDIS_IMAGE="$redis_image_in"
}

docker_container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

docker_image_for_container() {
  docker inspect --format '{{.Config.Image}}' "$1" 2>/dev/null || true
}

docker_deploy_or_upgrade() {
  local action="$1"
  local config_path="$2"
  local version="$3"
  local backend_image="$4"
  local backend_db_image="$5"
  local frontend_image="$6"
  local redis_image="$7"

  docker_require_release_images "$version" "$backend_image" "$backend_db_image" "$frontend_image" "$redis_image"
  docker_require_running

  local runtime_dir=""
  runtime_dir="$(make_runtime_dir "$config_path" "docker")"
  local rc=0
  {
    if [[ "$DRY_RUN" != "true" ]]; then
      copy_runtime_file "${runtime_dir}/backend.env" "${RUNTIME_DIR}/backend.env" 640
      copy_runtime_file "${runtime_dir}/frontend.env" "${RUNTIME_DIR}/frontend.env" 640
      copy_runtime_file "${runtime_dir}/metadata.env" "${RUNTIME_DIR}/metadata.env" 640
      copy_runtime_file "${runtime_dir}/redis_url" "${RUNTIME_DIR}/redis_url" 440
    fi
    source_metadata_env "$runtime_dir"

    local backend_env="${runtime_dir}/backend.env"
    local frontend_env="${runtime_dir}/frontend.env"

    local backend_exists="false"
    local scheduler_exists="false"
    local frontend_exists="false"
    if docker_container_exists "riskhub-backend"; then backend_exists="true"; fi
    if docker_container_exists "riskhub-backend-scheduler"; then scheduler_exists="true"; fi
    if docker_container_exists "riskhub-frontend"; then frontend_exists="true"; fi

    if [[ "$action" == "deploy" ]]; then
      if [[ "$backend_exists" == "true" || "$scheduler_exists" == "true" || "$frontend_exists" == "true" ]]; then
        die "Existing docker deployment detected. Use upgrade instead of deploy."
      fi
    else
      if [[ "$backend_exists" != "true" || "$scheduler_exists" != "true" || "$frontend_exists" != "true" ]]; then
        die "Existing docker deployment not found. Use deploy for first install."
      fi
    fi

    confirm_or_die "Run docker ${action} using prebuilt release images?"

    local allow_port_in_use="false"
    if [[ "$action" == "upgrade" ]]; then
      allow_port_in_use="true"
    fi
    docker_preflight "$config_path" "$allow_port_in_use"

    log "Pulling backend image: ${DOCKER_BACKEND_IMAGE}"
    run docker pull "$DOCKER_BACKEND_IMAGE"
    log "Pulling backend DB image: ${DOCKER_BACKEND_DB_IMAGE}"
    run docker pull "$DOCKER_BACKEND_DB_IMAGE"
    log "Pulling frontend image: ${DOCKER_FRONTEND_IMAGE}"
    run docker pull "$DOCKER_FRONTEND_IMAGE"
    log "Pulling redis image: ${DOCKER_REDIS_IMAGE}"
    run docker pull "$DOCKER_REDIS_IMAGE"

    local prod_common=()
    if [[ "$YES" == "true" ]]; then prod_common+=(--yes); fi
    if [[ "$DRY_RUN" == "true" ]]; then prod_common+=(--dry-run); fi
    if [[ "$VERBOSE" == "true" ]]; then prod_common+=(--verbose); fi

    local db_preflight_args=(
      --backend-env "$backend_env"
      --frontend-env "$frontend_env"
      --backend-db-image "$DOCKER_BACKEND_DB_IMAGE"
      --check-db
    )
    if [[ "$action" == "upgrade" ]]; then
      db_preflight_args+=(--allow-frontend-port-in-use)
    fi
    if [[ "$YES" == "true" ]]; then db_preflight_args+=(--yes); fi
    if [[ "$DRY_RUN" == "true" ]]; then db_preflight_args+=(--dry-run); fi
    if [[ "$VERBOSE" == "true" ]]; then db_preflight_args+=(--verbose); fi
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/preflight.sh" "${db_preflight_args[@]}"

    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/install_redis.sh" --backend-env "$backend_env" --redis-image "$DOCKER_REDIS_IMAGE" "${prod_common[@]}"
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/run_migrations.sh" --backend-env "$backend_env" --backend-db-image "$DOCKER_BACKEND_DB_IMAGE" "${prod_common[@]}"
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/bootstrap_db.sh" --backend-env "$backend_env" --backend-db-image "$DOCKER_BACKEND_DB_IMAGE" "${prod_common[@]}"

    local backend_install_args=(
      --backend-env "$backend_env"
      --backend-image "$DOCKER_BACKEND_IMAGE"
      --instance api
      --workers "$API_WORKERS"
    )
    local scheduler_install_args=(
      --backend-env "$backend_env"
      --backend-image "$DOCKER_BACKEND_IMAGE"
      --instance scheduler
    )
    local frontend_install_args=(
      --frontend-env "$frontend_env"
      --frontend-image "$DOCKER_FRONTEND_IMAGE"
    )

    if [[ "$action" == "upgrade" ]]; then
      local prev_backend_image prev_frontend_image
      prev_backend_image="$(docker_image_for_container "riskhub-backend")"
      prev_frontend_image="$(docker_image_for_container "riskhub-frontend")"
      backend_install_args+=(--previous-image "$prev_backend_image")
      scheduler_install_args+=(--previous-image "$prev_backend_image")
      frontend_install_args+=(--previous-image "$prev_frontend_image")
    fi

    if [[ "$YES" == "true" ]]; then
      backend_install_args+=(--yes)
      scheduler_install_args+=(--yes)
      frontend_install_args+=(--yes)
    fi
    if [[ "$DRY_RUN" == "true" ]]; then
      backend_install_args+=(--dry-run)
      scheduler_install_args+=(--dry-run)
      frontend_install_args+=(--dry-run)
    fi
    if [[ "$VERBOSE" == "true" ]]; then
      backend_install_args+=(--verbose)
      scheduler_install_args+=(--verbose)
      frontend_install_args+=(--verbose)
    fi

    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/install_backend.sh" "${backend_install_args[@]}"
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/install_backend.sh" "${scheduler_install_args[@]}"
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/install_frontend.sh" "${frontend_install_args[@]}"
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/smoke_test.sh" --frontend-env "$frontend_env" --backend-env "$backend_env" "${prod_common[@]}"
  } || rc=$?

  cleanup_runtime_dir "$runtime_dir"
  return "$rc"
}

docker_status() {
  docker_require_running
  run "${REPO_ROOT}/scripts/prod/status.sh"
}

docker_logs() {
  local service="$1"
  local follow="$2"
  local tail_lines="$3"
  docker_require_running

  local args=(--service "$service" --tail "$tail_lines")
  if [[ "$follow" == "true" ]]; then
    args+=(--follow)
  fi
  run "${REPO_ROOT}/scripts/prod/logs.sh" "${args[@]}"
}

docker_smoke() {
  local config_path="$1"
  docker_require_running
  local runtime_dir=""
  runtime_dir="$(make_runtime_dir "$config_path" "docker")"
  local rc=0
  {
    local args=(
      --frontend-env "${runtime_dir}/frontend.env"
      --backend-env "${runtime_dir}/backend.env"
    )
    if [[ "$YES" == "true" ]]; then args+=(--yes); fi
    if [[ "$DRY_RUN" == "true" ]]; then args+=(--dry-run); fi
    if [[ "$VERBOSE" == "true" ]]; then args+=(--verbose); fi
    run "${REPO_ROOT}/scripts/prod/smoke_test.sh" "${args[@]}"
  } || rc=$?

  cleanup_runtime_dir "$runtime_dir"
  return "$rc"
}

docker_rollback() {
  local config_path="$1"
  local service="$2"
  docker_require_running
  local runtime_dir=""
  runtime_dir="$(make_runtime_dir "$config_path" "docker")"
  local rc=0
  {
    if [[ "$DRY_RUN" != "true" ]]; then
      copy_runtime_file "${runtime_dir}/backend.env" "${RUNTIME_DIR}/backend.env" 640
      copy_runtime_file "${runtime_dir}/frontend.env" "${RUNTIME_DIR}/frontend.env" 640
      copy_runtime_file "${runtime_dir}/metadata.env" "${RUNTIME_DIR}/metadata.env" 640
      copy_runtime_file "${runtime_dir}/redis_url" "${RUNTIME_DIR}/redis_url" 440
    fi
    local args=(
      --backend-env "${runtime_dir}/backend.env"
      --frontend-env "${runtime_dir}/frontend.env"
      --service "$service"
      --i-understand-db-wont-downgrade
    )
    if [[ "$YES" == "true" ]]; then args+=(--yes); fi
    if [[ "$DRY_RUN" == "true" ]]; then args+=(--dry-run); fi
    if [[ "$VERBOSE" == "true" ]]; then args+=(--verbose); fi
    run env RISKHUB_DEFAULT_SECRET_DIR="$SECRET_DIR" RISKHUB_RUNTIME_DIR="$RUNTIME_DIR" \
      "${REPO_ROOT}/scripts/prod/rollback.sh" "${args[@]}"
  } || rc=$?

  cleanup_runtime_dir "$runtime_dir"
  return "$rc"
}
