#!/usr/bin/env bash
# ─── EC2 Bootstrap Script — CDN Project ─────────────────────────────────────
# Provision a single Ubuntu 22.04 EC2 instance to run one CDN component.
# Run this script on each EC2 instance (one per component).
#
# ─── ENV VARS TO SET MANUALLY PER INSTANCE (before running this script) ─────
#
#   REPO_URL         — Git clone URL (HTTPS or SSH)
#                      Example: https://github.com/youruser/cdn-project.git
#
#   COMPONENT_DIR    — Subfolder name of the component to run on this instance
#                      One of: origin-server | edge-node | traffic-manager | purge-service
#
#   COMPONENT_NAME   — PM2 process name (human-readable)
#                      Examples: origin-server, edge-node-a, traffic-manager
#
#   PORT             — Port the component listens on
#                      origin-server=3000, edge-a=3001, edge-b=3002,
#                      edge-c=3003, purge-service=4000, traffic-manager=4001
#
#   --- Origin Server only ---
#   PURGE_SERVICE_URL — e.g. http://<purge-ec2-ip>:4000
#
#   --- Edge Node only ---
#   NODE_ID           — A | B | C
#   REGION            — americas | europe | asia
#   ORIGIN_URL        — e.g. http://<origin-ec2-ip>:3000
#   MAX_CONNECTIONS   — e.g. 10
#
#   --- Traffic Manager only ---
#   EDGE_A_URL        — e.g. http://<edge-a-ec2-ip>:3001
#   EDGE_B_URL        — e.g. http://<edge-b-ec2-ip>:3002
#   EDGE_C_URL        — e.g. http://<edge-c-ec2-ip>:3003
#
#   --- Purge Service only ---
#   EDGE_A_URL        — e.g. http://<edge-a-ec2-ip>:3001
#   EDGE_B_URL        — e.g. http://<edge-b-ec2-ip>:3002
#   EDGE_C_URL        — e.g. http://<edge-c-ec2-ip>:3003
#
# ─── Usage ──────────────────────────────────────────────────────────────────
#   export REPO_URL=https://github.com/youruser/cdn-project.git
#   export COMPONENT_DIR=origin-server
#   export COMPONENT_NAME=origin-server
#   export PORT=3000
#   export PURGE_SERVICE_URL=http://10.0.1.50:4000
#   chmod +x ec2-bootstrap.sh
#   sudo -E ./ec2-bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  CDN Project — EC2 Bootstrap"
echo "═══════════════════════════════════════════════════"
echo "  REPO_URL:       ${REPO_URL:?'Missing REPO_URL'}"
echo "  COMPONENT_DIR:  ${COMPONENT_DIR:?'Missing COMPONENT_DIR'}"
echo "  COMPONENT_NAME: ${COMPONENT_NAME:?'Missing COMPONENT_NAME'}"
echo "  PORT:           ${PORT:?'Missing PORT'}"
echo "═══════════════════════════════════════════════════"

# ── 1. System updates ───────────────────────────────────────────────────────
echo "[1/7] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ── 2. Install Node.js 20 via NodeSource ─────────────────────────────────────
echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "  Node: $(node --version)"
echo "  npm:  $(npm --version)"

# ── 3. Install Git ──────────────────────────────────────────────────────────
echo "[3/7] Installing git..."
apt-get install -y git

# ── 4. Install PM2 globally ─────────────────────────────────────────────────
echo "[4/7] Installing PM2..."
npm install -g pm2

# ── 5. Clone repository ─────────────────────────────────────────────────────
echo "[5/7] Cloning repository..."
INSTALL_DIR="/home/ubuntu/cdn-project"

if [ -d "$INSTALL_DIR" ]; then
  echo "  Directory exists — pulling latest..."
  cd "$INSTALL_DIR"
  git pull
else
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── 6. Build the component ──────────────────────────────────────────────────
echo "[6/7] Building component: $COMPONENT_DIR..."
cd "$INSTALL_DIR/$COMPONENT_DIR"
npm install
npm run build

# ── 7. Start with PM2 ──────────────────────────────────────────────────────
echo "[7/7] Starting with PM2..."
pm2 delete "$COMPONENT_NAME" 2>/dev/null || true
pm2 start dist/index.js --name "$COMPONENT_NAME"
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

# ── 8. Open firewall port ──────────────────────────────────────────────────
echo "Opening port $PORT..."
ufw allow "$PORT"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✓ $COMPONENT_NAME deployed on port $PORT"
echo "  ✓ PM2 will auto-restart on reboot"
echo "═══════════════════════════════════════════════════"
