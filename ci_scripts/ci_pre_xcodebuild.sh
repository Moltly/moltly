#!/bin/sh
# Xcode Cloud: ensure Pods and Capacitor iOS are prepared before xcodebuild
set -euo pipefail
set -x

REPO_DIR="${CI_WORKSPACE:-${CI_PRIMARY_REPOSITORY_PATH:-$PWD}}"
cd "$REPO_DIR"

echo "Xcode: $(xcodebuild -version | tr '\n' ' ' || true)"
echo "Node:  $(node -v 2>/dev/null || echo 'missing')"
echo "npm:   $(npm -v 2>/dev/null || echo 'missing')"
echo "CocoaPods: $(pod --version 2>/dev/null || echo 'missing')"

# Install JS deps if node_modules is missing/sparse
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null || true)" ]; then
  if command -v bun >/dev/null 2>&1; then
    bun install --frozen-lockfile || bun install
  elif [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

# Ensure Capacitor iOS and Pods are in sync
npx cap sync ios

# If Target Support Files missing, run pod install (with repo update as fallback)
if [ ! -f ios/App/Pods/Target\ Support\ Files/Pods-Moltly/Pods-Moltly.debug.xcconfig ]; then
  echo "Pods support files missing; running pod install..."
  (cd ios/App && pod install) || (cd ios/App && pod install --repo-update)
fi

echo "Pre-xcodebuild setup complete."

