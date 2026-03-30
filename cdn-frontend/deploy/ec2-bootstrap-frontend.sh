#!/usr/bin/env bash
# ─── EC2 Bootstrap Script — CDN Frontend ─────────────────────────────────────
# Provision a single Ubuntu 22.04 EC2 instance to run the Next.js Frontend.
#
# ─── ENV VARS TO SET MANUALLY PER INSTANCE (before running this script) ─────
#   REPO_URL         — Git clone URL (HTTPS or SSH)
#                      Example: https://github.com/youruser/cdn-project.git
# 
# ─── Usage ──────────────────────────────────────────────────────────────────
#   export REPO_URL=https://github.com/youruser/cdn-project.git
#   chmod +x ec2-bootstrap-frontend.sh
#   sudo -E ./ec2-bootstrap-frontend.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  CDN Frontend — EC2 Bootstrap"
echo "═══════════════════════════════════════════════════"
echo "  REPO_URL:       ${REPO_URL:?'Missing REPO_URL'}"
echo "═══════════════════════════════════════════════════"

echo "[1/7] Updating system packages..."
apt-get update -y && apt-get upgrade -y

echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "  Node: $(node --version)"
echo "  npm:  $(npm --version)"

echo "[3/7] Installing git & PM2..."
apt-get install -y git
npm install -g pm2

echo "[4/7] Cloning repository..."
INSTALL_DIR="/home/ubuntu/cdn-project"

if [ -d "$INSTALL_DIR" ]; then
  echo "  Directory exists — pulling latest..."
  cd "$INSTALL_DIR"
  git pull
else
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "[5/7] Building Frontend..."
cd "$INSTALL_DIR/cdn-frontend"

# Copy production env template
cp .env.production .env

npm install
npm run build

echo "[6/7] Starting with PM2..."
# PM2 ecosystem for Next.js uses npm start
pm2 delete "cdn-frontend" 2>/dev/null || true
pm2 start npm --name "cdn-frontend" -- start
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

echo "[7/7] Opening firewall port 3004..."
ufw allow 3004

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✓ CDN Frontend deployed."
echo "  IMPORTANT: Edit /home/ubuntu/cdn-project/cdn-frontend/.env"
echo "  Replace the <IP> placeholders with actual EC2 addresses."
echo "  Then restart: pm2 restart cdn-frontend"
echo "═══════════════════════════════════════════════════"
