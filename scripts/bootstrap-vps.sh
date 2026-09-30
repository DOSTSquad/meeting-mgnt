#!/usr/bin/env bash
# Bootstrap a fresh single-host Ubuntu VPS for DOST Meeting Management.
#
#   sudo bash scripts/bootstrap-vps.sh --deploy-user deploy --admin-email admin@example.org \
#     [--domain meeting.example.com]
#
# Run it once. Afterwards the Deploy workflow (.github/workflows/deploy.yml) handles updates.
# Every step checks its own state, so re-running is safe. An existing .env is never modified.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

TOTAL_STEPS=12
NODE_MAJOR=22
REPO_BRANCH=main

# Heuristics, not limits enforced by the models: the AI images plus the llama3 download are about
# 15 GB on disk (compose notes llama3 alone is ~4.7 GB), and CPU inference is slow and swap-bound
# below these sizes. docs/deployment-guidelines.md suggests 8 vCPU / 16 GiB as a starting point.
MIN_RAM_GIB=8
RECOMMENDED_RAM_GIB=16
MIN_DISK_GIB=20

OS_RELEASE_FILE="${OS_RELEASE_FILE:-/etc/os-release}"
MEMINFO_FILE="${MEMINFO_FILE:-/proc/meminfo}"

APP_DIR=/srv/meeting-mgnt
REPO_URL=
DEPLOY_USER="${SUDO_USER:-}"
DEPLOY_GROUP=
DOMAIN=
AI_MODE=whisper
SKIP_PREFLIGHT=false
ADMIN_EMAIL=
ADMIN_NAME=Administrator

ADMIN_RESULT=
ADMIN_GENERATED_PASSWORD=
APP_SITE=
PUBLIC_URL=
SERVICE_UNITS="meeting-mgnt-server meeting-mgnt-worker"
CHANGED_UNITS=" "
APT_UPDATED=false
# A fresh VPS often runs unattended-upgrades on first boot; wait for the dpkg lock instead of failing.
APT_GET=(apt-get -o DPkg::Lock::Timeout=180)
STEP=0

log() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}
step() {
  STEP=$((STEP + 1))
  printf '\n[%d/%d] %s\n' "$STEP" "$TOTAL_STEPS" "$*"
}

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/bootstrap-vps.sh [options]

Bootstraps a fresh Ubuntu 22.04/24.04 VPS: Node.js, Docker, Caddy, PostgreSQL/Redis/MinIO,
the AI worker, systemd units and the sudoers rule the Deploy workflow needs.

Options:
  --deploy-user USER   Account the Deploy workflow SSHes in as; it owns the app directory.
                       Defaults to the sudo caller. Use "root" to deploy as root.
  --domain NAME        Public domain; Caddy then serves it over automatic HTTPS.
                       Without it the site is served over HTTP on the server's primary IP.
  --app-dir PATH       Application directory (default: /srv/meeting-mgnt).
  --repo-url URL       Repository to clone. Defaults to the origin of an existing checkout
                       in --app-dir, or of the checkout this script is run from.
  --ai-mode MODE       whisper (default): Whisper + Ollama containers on this host.
                       fixture: canned AI output for hosts that cannot run the models.
  --admin-email EMAIL  Administrator account to create after the migrations. Self-registration is
                       closed by default, so a host with no admin has nobody who can log in.
                       Optional on a re-run when an administrator already exists.
  --admin-name NAME    Display name for that account (default: Administrator).
  --skip-preflight     Skip the OS, architecture, systemd, RAM and disk checks
                       (the root check always runs).
  -h, --help           Show this help.

Environment:
  ADMIN_PASSWORD       Password for a newly created administrator (at least 8 characters). If unset a
                       random one is generated and printed once, at the end. It is never taken from
                       an argument. Pass it through sudo with:
                         read -rs ADMIN_PASSWORD; export ADMIN_PASSWORD
                         sudo --preserve-env=ADMIN_PASSWORD bash scripts/bootstrap-vps.sh ...
EOF
}

option_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    die "Option $1 needs a value (see --help)"
  fi
  printf '%s' "$2"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --app-dir) APP_DIR=$(option_value "$@") || exit 1; shift 2 ;;
      --repo-url) REPO_URL=$(option_value "$@") || exit 1; shift 2 ;;
      --deploy-user) DEPLOY_USER=$(option_value "$@") || exit 1; shift 2 ;;
      --domain) DOMAIN=$(option_value "$@") || exit 1; shift 2 ;;
      --ai-mode) AI_MODE=$(option_value "$@") || exit 1; shift 2 ;;
      --admin-email) ADMIN_EMAIL=$(option_value "$@") || exit 1; shift 2 ;;
      --admin-name) ADMIN_NAME=$(option_value "$@") || exit 1; shift 2 ;;
      --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
      -h | --help) usage; exit 0 ;;
      *) die "Unknown option: $1 (see --help)" ;;
    esac
  done
}

validate_settings() {
  local path_re='^/[A-Za-z0-9._/-]+$'
  local domain_re='^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$'

  case "$AI_MODE" in
    whisper | fixture) ;;
    *) die "--ai-mode must be 'whisper' or 'fixture', got '$AI_MODE'" ;;
  esac

  # The path is substituted into unit files with sed, so keep it to plain path characters.
  [[ $APP_DIR =~ $path_re ]] || die "--app-dir must be an absolute path without spaces, got '$APP_DIR'"

  if [ -n "$DOMAIN" ]; then
    [[ $DOMAIN =~ $domain_re ]] || die "--domain must be a bare domain name such as meeting.example.com, got '$DOMAIN'"
  fi

  local email_re='^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  if [ -n "$ADMIN_EMAIL" ]; then
    [[ $ADMIN_EMAIL =~ $email_re ]] || die "--admin-email must be an email address, got '$ADMIN_EMAIL'"
    if [ -n "${ADMIN_PASSWORD:-}" ] && [ "${#ADMIN_PASSWORD}" -lt 8 ]; then
      die "ADMIN_PASSWORD must be at least 8 characters long"
    fi
  fi
  case $ADMIN_NAME in
    -*) die "--admin-name must not start with '-', got '$ADMIN_NAME'" ;;
  esac

  if [ -z "$DEPLOY_USER" ]; then
    die "Cannot tell which account the Deploy workflow uses. Pass --deploy-user USER (or root)."
  fi
  id "$DEPLOY_USER" >/dev/null 2>&1 || die "User '$DEPLOY_USER' does not exist. Create it first (adduser $DEPLOY_USER)."
  DEPLOY_GROUP=$(id -gn "$DEPLOY_USER")

  if [ "$AI_MODE" = fixture ]; then
    SERVICE_UNITS="$SERVICE_UNITS meeting-mgnt-ai-worker"
  fi
}

# --- preflight -------------------------------------------------------------------------------

check_root() {
  [ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash $0 ..."
}

check_os() {
  [ -r "$OS_RELEASE_FILE" ] || die "Cannot read $OS_RELEASE_FILE; this script supports Ubuntu only."

  local id version_id
  id=$(. "$OS_RELEASE_FILE" && printf '%s' "${ID:-}")
  version_id=$(. "$OS_RELEASE_FILE" && printf '%s' "${VERSION_ID:-}")

  [ "$id" = ubuntu ] || die "This script supports Ubuntu only (found '${id:-unknown}')."
  case "$version_id" in
    22.04 | 24.04) ;;
    *) warn "Ubuntu $version_id is untested; 22.04 and 24.04 are supported." ;;
  esac
}

check_arch() {
  case "$(uname -m)" in
    x86_64 | aarch64) ;;
    *) die "Unsupported architecture '$(uname -m)'; need x86_64 or arm64." ;;
  esac
}

check_systemd() {
  [ -d /run/systemd/system ] || die "systemd is not running as PID 1; the services need it (containers are not supported)."
}

total_ram_gib() {
  awk '/^MemTotal:/ { printf "%d", $2 / 1024 / 1024 + 0.5 }' "$MEMINFO_FILE"
}

nearest_existing_dir() {
  local dir=$1
  while [ ! -d "$dir" ] && [ "$dir" != / ]; do
    dir=$(dirname "$dir")
  done
  printf '%s' "$dir"
}

free_disk_gib() {
  df -Pk "$(nearest_existing_dir "$1")" | awk 'NR == 2 { printf "%d", $4 / 1024 / 1024 }'
}

check_resources() {
  if [ "$AI_MODE" != whisper ]; then
    return 0
  fi

  local ram disk
  ram=$(total_ram_gib)
  disk=$(free_disk_gib "$APP_DIR")

  if [ "$ram" -lt "$MIN_RAM_GIB" ]; then
    die "Whisper + Ollama needs at least ${MIN_RAM_GIB} GiB RAM (found ${ram} GiB). Use --ai-mode fixture on a smaller host, or --skip-preflight to override."
  fi
  if [ "$ram" -lt "$RECOMMENDED_RAM_GIB" ]; then
    warn "${ram} GiB RAM is below the recommended ${RECOMMENDED_RAM_GIB} GiB; expect slow transcription and swapping."
  fi
  if [ "$disk" -lt "$MIN_DISK_GIB" ]; then
    die "Need at least ${MIN_DISK_GIB} GiB free disk for the AI images and the llama3 model (found ${disk} GiB free). Use --skip-preflight to override."
  fi
}

preflight() {
  check_os
  check_arch
  check_systemd
  check_resources
}

# --- helpers ---------------------------------------------------------------------------------

as_deploy_user() {
  if [ "$DEPLOY_USER" = root ]; then
    "$@"
  else
    sudo -H -u "$DEPLOY_USER" "$@"
  fi
}

# Like as_deploy_user, but lets ADMIN_PASSWORD through sudo's environment reset. Passing it as a
# `sudo ADMIN_PASSWORD=...` argument instead would put it in the process list.
as_deploy_user_keeping_admin_password() {
  if [ "$DEPLOY_USER" = root ]; then
    "$@"
  else
    sudo -H --preserve-env=ADMIN_PASSWORD -u "$DEPLOY_USER" "$@"
  fi
}

compose() {
  (cd "$APP_DIR" && docker compose "$@")
}

apt_update() {
  if [ "$APT_UPDATED" = true ]; then
    return 0
  fi
  "${APT_GET[@]}" update -qq
  APT_UPDATED=true
}

apt_install() {
  apt_update
  # dpkg's progress goes to stdout; errors still reach stderr and the exit status.
  "${APT_GET[@]}" install -y -qq "$@" >/dev/null
}

package_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'
}

ensure_packages() {
  local missing=() pkg
  for pkg in "$@"; do
    if ! package_installed "$pkg"; then
      missing+=("$pkg")
    fi
  done

  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi
  apt_install "${missing[@]}"
}

# Writes stdin to DEST with MODE. Returns 0 when the file changed and 1 when it already matched,
# so call it from an `if`: a bare call under `set -e` would exit on "unchanged".
write_file_if_changed() {
  local dest=$1 mode=$2 tmp
  tmp=$(mktemp)
  cat >"$tmp"

  if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
    rm -f "$tmp"
    return 1
  fi

  install -m "$mode" "$tmp" "$dest"
  rm -f "$tmp"
}

# fetch_apt_key URL DEST armored|dearmor
fetch_apt_key() {
  local url=$1 dest=$2 format=$3 tmp
  if [ -s "$dest" ]; then
    return 0
  fi

  install -m 0755 -d "$(dirname "$dest")"
  tmp=$(mktemp)
  curl -fsSL --retry 3 "$url" -o "$tmp"
  if [ "$format" = dearmor ]; then
    gpg --batch --no-tty --yes --dearmor -o "$dest" "$tmp"
  else
    install -m 0644 "$tmp" "$dest"
  fi
  chmod a+r "$dest"
  rm -f "$tmp"
}

# --- .env helpers ----------------------------------------------------------------------------

get_env_key() {
  awk -v key="$2" '
    index($0, key "=") == 1 { sub(/^[^=]*=/, ""); print; exit }
  ' "$1"
}

# Replaces the value of KEY, or appends it. The value goes through the environment rather than
# argv so a secret never shows up in `ps`, and nothing is echoed.
set_env_key() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp "${file}.XXXXXX")
  SET_ENV_VALUE=$value awk -v key="$key" '
    BEGIN { value = ENVIRON["SET_ENV_VALUE"]; done = 0 }
    index($0, key "=") == 1 { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

# Passwords and keys that must not keep the .env.example placeholder. SMTP_*/RESEND_* are
# credentials for outside services, so they cannot be generated and stay a manual step.
secret_keys() {
  grep -E '^[A-Z0-9_]+=' "$1" | cut -d= -f1 | grep -E '(PASSWORD|SECRET|_KEY)$' | grep -vE '^(SMTP|RESEND)_' || true
}

# Default 40 hex characters. MinIO access keys are conventionally 20 characters and older MinIO
# releases cap secret keys at 40, so neither is generated longer than that.
generate_secret() {
  openssl rand -hex "${1:-20}"
}

placeholder_keys() {
  grep -E '^[A-Z0-9_]+=replace' "$1" | cut -d= -f1 || true
}

# --- network ---------------------------------------------------------------------------------

detect_primary_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
}

is_private_ip() {
  [[ $1 =~ ^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.) ]]
}

resolve_public_site() {
  if [ -n "$DOMAIN" ]; then
    APP_SITE=$DOMAIN
    PUBLIC_URL="https://$DOMAIN"
    return 0
  fi

  local ip
  ip=$(detect_primary_ip)
  [ -n "$ip" ] || die "Could not detect this server's IP address. Pass --domain."
  if is_private_ip "$ip"; then
    warn "The primary address $ip is private (behind NAT?). Pass --domain, or browse to the public IP the provider gave you."
  fi
  APP_SITE="http://$ip"
  PUBLIC_URL="http://$ip"
}

# --- repository ------------------------------------------------------------------------------

git_remote_url() {
  git -c "safe.directory=$1" -C "$1" remote get-url origin 2>/dev/null || true
}

resolve_repo_url() {
  if [ -n "$REPO_URL" ]; then
    return 0
  fi

  local candidate url
  for candidate in "$APP_DIR" "$(cd "$SCRIPT_DIR/.." && pwd)"; do
    if [ -d "$candidate/.git" ]; then
      url=$(git_remote_url "$candidate")
      if [ -n "$url" ]; then
        REPO_URL=$url
        return 0
      fi
    fi
  done

  die "No repository to clone. Pass --repo-url URL, or run this script from a checkout."
}

# --- steps -----------------------------------------------------------------------------------

install_base_packages() {
  local packages=(ca-certificates curl gnupg git rsync openssl sudo)
  if [ "$AI_MODE" = fixture ]; then
    packages+=(python3-venv)
  fi
  ensure_packages "${packages[@]}"
}

install_node() {
  if [ -x /usr/bin/node ] && [ "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]; then
    log "Node.js $(/usr/bin/node -v) already installed."
    return 0
  fi

  fetch_apt_key https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key /etc/apt/keyrings/nodesource.gpg dearmor
  if printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' "$NODE_MAJOR" \
    | write_file_if_changed /etc/apt/sources.list.d/nodesource.list 0644; then
    APT_UPDATED=false
  fi

  apt_install nodejs
  [ -x /usr/bin/node ] || die "Node.js was installed but /usr/bin/node is missing; the systemd units expect that path."
  log "Installed Node.js $(/usr/bin/node -v)."
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    docker compose version >/dev/null 2>&1 \
      || die "Docker is installed without the compose plugin. Install docker-compose-plugin (or docker-compose-v2) and re-run."
    log "Docker $(docker --version | cut -d' ' -f3 | tr -d ,) already installed."
  else
    fetch_apt_key https://download.docker.com/linux/ubuntu/gpg /etc/apt/keyrings/docker.asc armored
    local codename arch
    codename=$(. "$OS_RELEASE_FILE" && printf '%s' "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
    arch=$(dpkg --print-architecture)
    if printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$arch" "$codename" \
      | write_file_if_changed /etc/apt/sources.list.d/docker.list 0644; then
      APT_UPDATED=false
    fi
    apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  systemctl enable --now docker >/dev/null 2>&1 || die "Could not enable and start the docker service."

  if [ "$DEPLOY_USER" != root ]; then
    case " $(id -nG "$DEPLOY_USER") " in
      *" docker "*) ;;
      *)
        usermod -aG docker "$DEPLOY_USER"
        log "Added $DEPLOY_USER to the docker group (takes effect on their next login)."
        ;;
    esac
  fi
}

sync_repository() {
  resolve_repo_url

  if [ -d "$APP_DIR/.git" ]; then
    log "Updating $APP_DIR from origin/$REPO_BRANCH."
    as_deploy_user git -C "$APP_DIR" fetch --prune origin "$REPO_BRANCH"
    as_deploy_user git -C "$APP_DIR" checkout "$REPO_BRANCH"
    as_deploy_user git -C "$APP_DIR" pull --ff-only origin "$REPO_BRANCH" \
      || die "Cannot fast-forward $APP_DIR to origin/$REPO_BRANCH. Resolve the local changes and re-run."
    return 0
  fi

  if [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR")" ]; then
    die "$APP_DIR exists, is not empty and is not a git checkout; refusing to touch it."
  fi

  install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$APP_DIR"
  as_deploy_user git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
}

create_env_file() {
  local env_file="$APP_DIR/.env" example="$APP_DIR/.env.example" tmp key count=0

  if [ -e "$env_file" ]; then
    log ".env already exists; leaving it untouched."
    return 0
  fi
  [ -f "$example" ] || die "$example is missing; cannot create .env."

  # Build the file aside and move it into place last so an interrupted run never leaves a
  # half-configured .env that the next run would then treat as finished.
  tmp=$(mktemp "$APP_DIR/.env.XXXXXX")
  cat "$example" >"$tmp"

  while IFS= read -r key; do
    if [[ $key == *_ACCESS_KEY ]]; then
      set_env_key "$tmp" "$key" "$(generate_secret 10)"
    else
      set_env_key "$tmp" "$key" "$(generate_secret)"
    fi
    count=$((count + 1))
  done < <(secret_keys "$tmp")

  local pg_user pg_password pg_db
  pg_user=$(get_env_key "$tmp" POSTGRES_USER)
  pg_password=$(get_env_key "$tmp" POSTGRES_PASSWORD)
  pg_db=$(get_env_key "$tmp" POSTGRES_DB)
  set_env_key "$tmp" DATABASE_URL "postgresql://${pg_user}:${pg_password}@localhost:5432/${pg_db}"

  set_env_key "$tmp" NODE_ENV production
  set_env_key "$tmp" TRUST_PROXY true
  set_env_key "$tmp" CLIENT_URL "$PUBLIC_URL"
  set_env_key "$tmp" AI_PIPELINE_ENABLED true

  if [ "$AI_MODE" = whisper ]; then
    set_env_key "$tmp" AI_TRANSCRIPTION_PROVIDER whisper
    set_env_key "$tmp" AI_ANALYSIS_PROVIDER llm
  else
    set_env_key "$tmp" AI_TRANSCRIPTION_PROVIDER fixture
    set_env_key "$tmp" AI_ANALYSIS_PROVIDER fixture
    set_env_key "$tmp" ALLOW_UNSAFE_FIXTURE_PROVIDERS true
  fi

  chown "$DEPLOY_USER:$DEPLOY_GROUP" "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$env_file"
  log "Created .env with $count generated secrets (values are not printed)."
}

start_infrastructure() {
  compose up -d --wait postgres redis minio
  # minio-init only creates the buckets and exits; it is safe to run repeatedly.
  compose run --rm -T minio-init
}

setup_ai_worker() {
  if [ "$AI_MODE" = fixture ]; then
    setup_fixture_worker
  else
    start_whisper_stack
  fi
}

setup_fixture_worker() {
  local venv="$APP_DIR/ai-service/.venv"
  if [ ! -x "$venv/bin/python" ]; then
    as_deploy_user python3 -m venv "$venv"
  fi
  as_deploy_user "$venv/bin/pip" install --quiet --no-cache-dir -r "$APP_DIR/ai-service/requirements.fixture.txt"
}

start_whisper_stack() {
  log "Building the AI images; the first build downloads PyTorch and takes several minutes."
  compose --profile ai up -d --build --wait ollama ai-service ai-worker

  local model
  model=$(get_env_key "$APP_DIR/.env" OLLAMA_MODEL)
  model=${model:-llama3}
  if compose exec -T ollama ollama show "$model" >/dev/null 2>&1; then
    log "Ollama model $model already present."
  else
    log "Pulling Ollama model $model (several GB)."
    compose exec -T ollama ollama pull "$model"
  fi

  curl --fail --silent --show-error --retry 10 --retry-delay 3 --retry-connrefused \
    http://127.0.0.1:8000/health >/dev/null
  log "ai-service health check passed."
}

install_application() {
  local marker="$APP_DIR/node_modules/.package-lock.json"
  if [ ! -f "$marker" ] || [ "$APP_DIR/package-lock.json" -nt "$marker" ]; then
    as_deploy_user bash -c 'cd "$1" && npm ci --omit=dev --no-audit --no-fund' _ "$APP_DIR"
  else
    log "node_modules is up to date."
  fi
  as_deploy_user bash -c 'cd "$1" && npm run migrate --workspace=server' _ "$APP_DIR"
}

# Creates the first administrator, or confirms one exists (server/scripts/create-admin.js is
# idempotent). Its stdout is captured, not streamed: a generated password is printed there and must
# only reach the final summary, never the log. stderr never carries the password.
create_first_admin() {
  local script="$APP_DIR/server/scripts/create-admin.js"
  local args=(--name "$ADMIN_NAME") stderr_file output errors line status=0

  [ -f "$script" ] || die "$script is missing; cannot create the administrator account."
  if [ -n "$ADMIN_EMAIL" ]; then
    args+=(--email "$ADMIN_EMAIL")
  fi

  stderr_file=$(mktemp)
  if output=$(as_deploy_user_keeping_admin_password /usr/bin/node "$script" "${args[@]}" 2>"$stderr_file"); then
    status=0
  else
    status=$?
  fi
  errors=$(cat "$stderr_file")
  rm -f "$stderr_file"

  case $status in
    0) ;;
    2) die "No administrator exists. Re-run with --admin-email <address> (this script is safe to re-run)." ;;
    *) die "Creating the administrator account failed: ${errors:-no error output}" ;;
  esac

  ADMIN_RESULT=$(printf '%s\n' "$output" | sed -n 's/^admin-account: //p' | tail -n 1)
  ADMIN_GENERATED_PASSWORD=$(printf '%s\n' "$output" | sed -n 's/^admin-password: //p' | head -n 1)
  [ -n "$ADMIN_RESULT" ] || die "create-admin gave no result line; run it by hand to see why: node $script --help"

  while IFS= read -r line; do
    case $line in
      admin-password:* | admin-account:*) ;;
      *) log "$line" ;;
    esac
  done <<<"$output"
}

# Installs a unit from deploy/ without User=/Group=: the existing production host runs its
# services as root, and the meeting-mgnt account the shipped units name does not exist here.
install_unit() {
  local name=$1 src="$APP_DIR/deploy/$1.service" dest="/etc/systemd/system/$1.service" tmp
  [ -f "$src" ] || die "$src is missing."

  tmp=$(mktemp)
  sed -e '/^User=/d' -e '/^Group=/d' -e "s#/srv/meeting-mgnt#$APP_DIR#g" "$src" >"$tmp"
  if write_file_if_changed "$dest" 0644 <"$tmp"; then
    CHANGED_UNITS="$CHANGED_UNITS$name "
  fi
  rm -f "$tmp"
}

install_services() {
  local unit
  for unit in $SERVICE_UNITS; do
    install_unit "$unit"
  done
  systemctl daemon-reload

  for unit in $SERVICE_UNITS; do
    systemctl enable "$unit.service" >/dev/null 2>&1 || die "Could not enable $unit.service."
    if ! systemctl is-active --quiet "$unit.service"; then
      systemctl start "$unit.service"
    elif [[ $CHANGED_UNITS == *" $unit "* ]]; then
      systemctl restart "$unit.service"
    fi
  done

  sleep 3
  local state
  for unit in $SERVICE_UNITS; do
    state=$(systemctl is-active "$unit.service" || true)
    case "$state" in
      failed | activating)
        die "$unit is $state (crash loop?). Check: journalctl -u $unit -n 50 --no-pager"
        ;;
      inactive)
        # The worker exits 0 when AI_PIPELINE_ENABLED is not true in an existing .env.
        warn "$unit is inactive; check AI_PIPELINE_ENABLED in $APP_DIR/.env."
        ;;
    esac
  done

  curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-connrefused \
    http://127.0.0.1:3001/health/live >/dev/null \
    || die "The API did not answer on 127.0.0.1:3001. Check: journalctl -u meeting-mgnt-server -n 50 --no-pager"
  log "API is answering on 127.0.0.1:3001."
}

install_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    return 0
  fi

  fetch_apt_key https://dl.cloudsmith.io/public/caddy/stable/gpg.key /usr/share/keyrings/caddy-stable-archive-keyring.gpg dearmor
  local list
  list=$(curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt)
  if printf '%s\n' "$list" | write_file_if_changed /etc/apt/sources.list.d/caddy-stable.list 0644; then
    APT_UPDATED=false
  fi
  apt_install caddy
}

configure_caddy() {
  install_caddy

  local changed=false client_dist="$APP_DIR/client/dist"
  if write_file_if_changed /etc/caddy/Caddyfile 0644 <"$APP_DIR/deploy/Caddyfile"; then
    changed=true
  fi

  # Same variables README.md tells you to set with `systemctl edit caddy`, kept in our own drop-in
  # so a hand-made override.conf is left alone. Environment= is read at process start, hence the
  # restart below rather than a reload.
  install -d /etc/systemd/system/caddy.service.d
  if printf '[Service]\nEnvironment=APP_SITE=%s\nEnvironment=CLIENT_DIST=%s\n' "$APP_SITE" "$client_dist" \
    | write_file_if_changed /etc/systemd/system/caddy.service.d/meeting-mgnt.conf 0644; then
    changed=true
  fi

  APP_SITE=$APP_SITE CLIENT_DIST=$client_dist caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
    || die "caddy validate rejected /etc/caddy/Caddyfile. Run: caddy validate --config /etc/caddy/Caddyfile"

  systemctl daemon-reload
  systemctl enable caddy >/dev/null 2>&1 || die "Could not enable caddy.service."
  if [ "$changed" = true ] || ! systemctl is-active --quiet caddy; then
    systemctl restart caddy
  fi

  if [ ! -f "$client_dist/index.html" ]; then
    warn "$client_dist is empty. The site returns 404 until the first Deploy workflow run ships the client bundle."
  fi
}

install_sudoers() {
  if [ "$DEPLOY_USER" = root ]; then
    log "Deploy user is root; no sudoers rule needed."
    return 0
  fi

  # Arguments are matched exactly, so each status --no-pager variant is its own entry. This is the
  # rule documented in README.md; the ai-worker entries are harmless when that unit is absent.
  local action unit commands=""
  for action in "restart" "status"; do
    for unit in meeting-mgnt-server meeting-mgnt-worker meeting-mgnt-ai-worker; do
      if [ -n "$commands" ]; then
        commands="$commands, "
      fi
      if [ "$action" = status ]; then
        commands="${commands}/usr/bin/systemctl status $unit.service --no-pager"
      else
        commands="${commands}/usr/bin/systemctl restart $unit.service"
      fi
    done
  done

  local tmp
  tmp=$(mktemp)
  printf '%s ALL=(root) NOPASSWD: %s\n' "$DEPLOY_USER" "$commands" >"$tmp"
  visudo -cf "$tmp" >/dev/null || die "Generated sudoers rule failed visudo validation; nothing was installed."

  if write_file_if_changed /etc/sudoers.d/meeting-mgnt-deploy 0440 <"$tmp"; then
    log "Installed /etc/sudoers.d/meeting-mgnt-deploy for $DEPLOY_USER."
  else
    log "Sudoers rule already up to date."
  fi
  rm -f "$tmp"
}

admin_summary() {
  if [ "$ADMIN_RESULT" = created ] && [ -n "$ADMIN_GENERATED_PASSWORD" ]; then
    printf '  Email:    %s\n  Password: %s\n' "$ADMIN_EMAIL" "$ADMIN_GENERATED_PASSWORD"
    printf '  Shown once and not stored anywhere. Log in and change it under Account > Change password.\n'
  elif [ "$ADMIN_RESULT" = created ]; then
    printf '  Email:    %s\n  Password: the ADMIN_PASSWORD you supplied\n' "$ADMIN_EMAIL"
  elif [ "$ADMIN_RESULT" = promoted ]; then
    printf '  %s is now an administrator and keeps its existing password.\n' "$ADMIN_EMAIL"
  else
    printf '  An administrator account already exists; nothing was changed.\n'
  fi
}

print_summary() {
  local todo
  todo=$(placeholder_keys "$APP_DIR/.env" | tr '\n' ' ')

  cat <<EOF

Bootstrap complete.

Installed
  Node.js $(/usr/bin/node -v), Docker, Caddy
  PostgreSQL, Redis, MinIO (containers bound to 127.0.0.1)
  AI: $AI_MODE
  systemd: $(printf '%s ' $SERVICE_UNITS)
  App directory: $APP_DIR (owned by $DEPLOY_USER)
  Site: $PUBLIC_URL

Administrator account
$(admin_summary)

Still manual
  1. Put the .env credentials for outside services in place: ${todo:-none left with a placeholder value}
     (edit $APP_DIR/.env, then: sudo systemctl restart meeting-mgnt-server meeting-mgnt-worker)
  2. Add the Deploy workflow's public key to ~$DEPLOY_USER/.ssh/authorized_keys.
  3. In GitHub, create the 'production' environment secrets DEPLOY_HOST, DEPLOY_USER
     ($DEPLOY_USER) and DEPLOY_SSH_KEY (optional: DEPLOY_PORT).
EOF
  if [ -n "$DOMAIN" ]; then
    printf '  4. Point the DNS A/AAAA record for %s at this server so Caddy can get its certificate.\n' "$DOMAIN"
  fi
  cat <<EOF
  5. Run the Deploy workflow once (Actions > Deploy > Run workflow) to ship client/dist.
     Until then $PUBLIC_URL answers 404.

Good to know
  - Only ports 22, 80 and 443 should be reachable from outside. PostgreSQL, Redis, MinIO, Ollama and
    ai-service listen on 127.0.0.1; this script does not change the firewall.
  - The Deploy workflow does not rebuild the AI containers. After changing ai-service/ run:
      cd $APP_DIR && docker compose --profile ai up -d --build --wait ollama ai-service ai-worker
  - Re-running this script is safe; it never modifies an existing .env.
EOF
}

main() {
  parse_args "$@"
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
  check_root
  validate_settings
  if [ "$SKIP_PREFLIGHT" = true ]; then
    warn "Skipping preflight checks."
  else
    preflight
  fi
  resolve_public_site

  step "Installing base packages"
  install_base_packages
  step "Installing Node.js $NODE_MAJOR"
  install_node
  step "Installing Docker Engine"
  install_docker
  step "Fetching the application code"
  sync_repository
  step "Creating .env"
  create_env_file
  step "Starting PostgreSQL, Redis and MinIO"
  start_infrastructure
  step "Setting up the AI worker ($AI_MODE)"
  setup_ai_worker
  step "Installing dependencies and running migrations"
  install_application
  step "Creating the first administrator"
  create_first_admin
  step "Installing systemd services"
  install_services
  step "Configuring Caddy"
  configure_caddy
  step "Allowing $DEPLOY_USER to restart the services"
  install_sudoers

  print_summary
}

if [[ ${BASH_SOURCE[0]:-$0} == "$0" ]]; then
  main "$@"
fi
