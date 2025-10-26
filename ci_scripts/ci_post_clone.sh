#!/bin/sh
# Xcode Cloud: prepare iOS workspace before the xcodebuild step
set -euo pipefail
set -x

REPO_DIR="${CI_WORKSPACE:-${CI_PRIMARY_REPOSITORY_PATH:-$PWD}}"
cd "$REPO_DIR"

echo "Node: $(node -v 2>/dev/null || echo 'missing')"
echo "npm:  $(npm -v 2>/dev/null || echo 'missing')"
echo "CocoaPods: $(pod --version 2>/dev/null || echo 'missing')"

# Install JS dependencies (npm fallback if bun/pnpm are unavailable)
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install
else
  npm install --no-audit --no-fund
fi

# Sync Capacitor iOS (copies web assets and ensures Podfile/plugins are in place)
npx cap sync ios

# Install CocoaPods for the iOS workspace
export COCOAPODS_DISABLE_STATS=1
cd ios/App
pod install --repo-update

echo "Post-clone setup complete."

