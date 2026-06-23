#!/bin/bash
# Revela → staging.graindays.jp/edit/ deploy script
# Usage: bash deploy-staging.sh
set -e

VPS_USER="${VPS_USER:-r4311406}"
VPS_HOST="${VPS_HOST:-www248.onamae.ne.jp}"
VPS_PORT="${VPS_PORT:-8022}"
VPS_KEY="${VPS_KEY:-/Users/unokeito/ssh/vscode_uno.pem}"
REMOTE_DIR="/var/www/photo-editor-staging"

echo "==> Building with basePath=/edit"
DEPLOY_TARGET=staging npm run build

echo "==> Syncing to ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  -e "ssh -p ${VPS_PORT} -i ${VPS_KEY} -o StrictHostKeyChecking=no" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'src' \
  --exclude 'src-tauri' \
  --exclude '.env*' \
  ./ "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "==> Installing deps and restarting PM2 on VPS"
ssh -p "${VPS_PORT}" -i "${VPS_KEY}" -o StrictHostKeyChecking=no \
  "${VPS_USER}@${VPS_HOST}" bash <<'REMOTE'
set -e
cd /var/www/photo-editor-staging
npm install --production=false
if pm2 list | grep -q "revela-staging"; then
  pm2 restart revela-staging
else
  pm2 start npm --name "revela-staging" -- start -- -p 3001
fi
pm2 save
echo "✅ Revela staging deployed at staging.graindays.jp/edit/"
REMOTE

echo "==> Done. Check: https://staging.graindays.jp/edit/"
