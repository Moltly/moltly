#!/bin/sh
# Xcode Cloud: ensure Pods and Capacitor iOS are prepared before xcodebuild
set -euo pipefail
set -x

get_latest_node_version() {
  LATEST=$(curl -fsSL --retry 5 https://nodejs.org/dist/index.tab 2>/dev/null | awk 'NR==2{print $1}') || true
  if [ -n "${LATEST:-}" ]; then
    echo "${LATEST#v}"
    return 0
  fi
  LATEST=$(curl -fsSL --retry 5 https://nodejs.org/dist/index.json 2>/dev/null | grep -oE '"version"\s*:\s*"v[0-9]+\.[0-9]+\.[0-9]+' | head -n1 | sed -E 's/.*"v([0-9.]+)$/\1/') || true
  [ -n "${LATEST:-}" ] && { echo "$LATEST"; return 0; }
  return 1
}

# Ensure Node.js is available (for npx cap etc.)
ensure_node() {
  if command -v npm >/dev/null 2>&1; then
    return 0
  fi
  echo "npm not found; installing a local Node.js toolchain..."
  NODE_VERSION="${NODE_VERSION:-$(get_latest_node_version || echo 22.9.0)}"
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64) PLATFORM="darwin-arm64";;
    *)     PLATFORM="darwin-x64";;
  esac
  TMPNODE="/tmp/node-v$NODE_VERSION"
  mkdir -p "$TMPNODE"
  set +e
  curl -fsSL --retry 5 "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$PLATFORM.tar.xz" -o "$TMPNODE/node.tar.xz"
  CURL_RC=$?
  set -e
  if [ $CURL_RC -ne 0 ]; then
    echo "curl failed ($CURL_RC). Attempting Homebrew install..."
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
    if command -v brew >/dev/null 2>&1; then
      brew update || true
      brew install node || brew upgrade node || true
    else
      echo "Homebrew not found and Node download failed." >&2
      exit 127
    fi
  else
    tar -xJf "$TMPNODE/node.tar.xz" -C "$TMPNODE" --strip-components=1
    export PATH="$TMPNODE/bin:$PATH"
  fi
  echo "Node after ensure: $(node -v 2>/dev/null || echo 'missing')"
  echo "npm after ensure:  $(npm -v 2>/dev/null || echo 'missing')"
}

ensure_node

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
