#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Port Forwarder — local server installer
#  Usage:
#    sudo ./install.sh            — install / update
#    sudo ./install.sh uninstall  — remove service and files
#
#  Requirements: Linux with systemd, curl, git (already cloned)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (edit if needed) ───────────────────────────────────────────────────
APP_PORT="${PORT:-4000}"
INSTALL_DIR="/opt/port-forwarder"
SERVICE_NAME="port-forwarder"
SERVICE_USER="port-forwarder"
NODE_MIN_VERSION=18

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Run with sudo: sudo $0 $*"

# ── Source directory (where this script lives) ────────────────────────────────
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─────────────────────────────────────────────────────────────────────────────
#  UNINSTALL
# ─────────────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "uninstall" ]]; then
  info "Stopping and disabling service..."
  systemctl stop "$SERVICE_NAME"  2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  info "Removing files..."
  rm -rf "$INSTALL_DIR"
  userdel "$SERVICE_USER" 2>/dev/null || true
  ok "Port Forwarder uninstalled."
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
#  INSTALL / UPDATE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Port Forwarder  —  Installer     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Detect package manager ─────────────────────────────────────────────────
detect_pkg_manager() {
  if   command -v apt-get &>/dev/null; then echo "apt"
  elif command -v dnf     &>/dev/null; then echo "dnf"
  elif command -v yum     &>/dev/null; then echo "yum"
  elif command -v pacman  &>/dev/null; then echo "pacman"
  else die "Unsupported Linux distro. Install Node.js ${NODE_MIN_VERSION}+ manually and re-run."; fi
}

# ── 2. Install Node.js if missing or too old ──────────────────────────────────
install_nodejs() {
  local PKG_MGR; PKG_MGR=$(detect_pkg_manager)
  info "Installing Node.js 20 via NodeSource..."

  if [[ "$PKG_MGR" == "apt" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif [[ "$PKG_MGR" == "dnf" || "$PKG_MGR" == "yum" ]]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    $PKG_MGR install -y nodejs
  elif [[ "$PKG_MGR" == "pacman" ]]; then
    pacman -Sy --noconfirm nodejs npm
  fi
}

check_node() {
  if ! command -v node &>/dev/null; then
    warn "Node.js not found — installing..."
    install_nodejs
  else
    local ver; ver=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
    if (( ver < NODE_MIN_VERSION )); then
      warn "Node.js ${ver} is too old (need ${NODE_MIN_VERSION}+) — upgrading..."
      install_nodejs
    else
      ok "Node.js $(node --version) found"
    fi
  fi
}

check_node

# ── 3. Create system user ─────────────────────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
  info "Creating system user '${SERVICE_USER}'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  ok "User '${SERVICE_USER}' created"
else
  ok "User '${SERVICE_USER}' already exists"
fi

# ── 4. Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
cd "$SRC_DIR/frontend"
npm ci --silent
npm run build --silent
ok "Frontend built → frontend/dist/"

# ── 5. Install backend dependencies ───────────────────────────────────────────
info "Installing backend dependencies..."
cd "$SRC_DIR/backend"
npm ci --production --silent
ok "Backend dependencies installed"

# ── 6. Copy files to install directory ───────────────────────────────────────
info "Installing to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"

# Copy backend (exclude node_modules — will copy separately)
rm -rf "$INSTALL_DIR/backend"
mkdir -p "$INSTALL_DIR/backend"
cp -a "$SRC_DIR/backend/." "$INSTALL_DIR/backend/"

# Copy built frontend
rm -rf "$INSTALL_DIR/frontend/dist"
mkdir -p "$INSTALL_DIR/frontend"
cp -a "$SRC_DIR/frontend/dist" "$INSTALL_DIR/frontend/dist"

# Ensure data dir is writable by service user (rules + credentials persist here)
mkdir -p "$INSTALL_DIR/backend/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/backend/data"

ok "Files installed to ${INSTALL_DIR}"

# ── 7. Create systemd service ─────────────────────────────────────────────────
info "Creating systemd service..."

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Port Forwarder (TCP/UDP)
Documentation=https://github.com/babakhinaa-jpg/forwarder
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/backend
ExecStart=$(command -v node) ${INSTALL_DIR}/backend/index.js
Restart=on-failure
RestartSec=5s

# Allow binding to ports < 1024 (needed if listen port < 1024)
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

Environment=PORT=${APP_PORT}
Environment=NODE_ENV=production

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# ── 8. Verify ─────────────────────────────────────────────────────────────────
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Service is running"
else
  die "Service failed to start. Check logs: journalctl -u ${SERVICE_NAME} -n 50"
fi

# ── 9. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Installation complete!                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Web UI:     ${CYAN}http://$(hostname -I | awk '{print $1}'):${APP_PORT}${NC}"
echo -e "  Login:      admin / password  (change after first login!)"
echo ""
echo -e "  Useful commands:"
echo -e "    ${YELLOW}systemctl status  ${SERVICE_NAME}${NC}   — check status"
echo -e "    ${YELLOW}systemctl restart ${SERVICE_NAME}${NC}   — restart"
echo -e "    ${YELLOW}systemctl stop    ${SERVICE_NAME}${NC}   — stop"
echo -e "    ${YELLOW}journalctl -u ${SERVICE_NAME} -f${NC}  — live logs"
echo -e "    ${YELLOW}sudo $0 uninstall${NC}              — remove"
echo ""
echo -e "  Data & rules:  ${INSTALL_DIR}/backend/data/config.json"
echo -e "  Port:          ${APP_PORT} (set PORT=xxxx before install to change)"
echo ""
