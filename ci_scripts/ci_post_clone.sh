#!/bin/sh
# Xcode Cloud: prepare iOS workspace before the xcodebuild step
set -euo pipefail
set -x

get_latest_node_version() {
  # Prefer index.tab (simple, sorted latest first); fallback to index.json
  LATEST=$(curl -fsSL --retry 5 https://nodejs.org/dist/index.tab 2>/dev/null | awk 'NR==2{print $1}') || true
  if [ -n "${LATEST:-}" ]; then
    echo "${LATEST#v}"
    return 0
  fi
  LATEST=$(curl -fsSL --retry 5 https://nodejs.org/dist/index.json 2>/dev/null | grep -oE '"version"\s*:\s*"v[0-9]+\.[0-9]+\.[0-9]+' | head -n1 | sed -E 's/.*"v([0-9.]+)$/\1/') || true
  [ -n "${LATEST:-}" ] && { echo "$LATEST"; return 0; }
  return 1
}

# Ensure Node.js is available (Xcode Cloud images may not include it)
ensure_node() {
  if command -v npm >/dev/null 2>&1; then
    return 0
  fi
  echo "npm not found; installing a local Node.js toolchain..."
  NODE_VERSION="${NODE_VERSION:-$(get_latest_node_version || echo 22.9.0)}"
  ARCH="$(uname -m)" # arm64 or x86_64
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
    # Ensure brew is on PATH for Cloud images
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

echo "Node: $(node -v 2>/dev/null || echo 'missing')"
echo "npm:  $(npm -v 2>/dev/null || echo 'missing')"
echo "CocoaPods: $(pod --version 2>/dev/null || echo 'missing')"

# Install JS dependencies
# Prefer bun (bun.lock present). If bun missing, install it; otherwise fallback to npm with legacy peer deps.
if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found; installing..."
  export BUN_INSTALL="${HOME}/.bun"
  curl -fsSL https://bun.sh/install | bash -s -- bun-v1.1.26 >/dev/null 2>&1 || true
  export PATH="${BUN_INSTALL}/bin:$PATH"
  echo "bun: $(bun --version 2>/dev/null || echo 'missing')"
fi

if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile || bun install || true
fi

if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null || true)" ]; then
  echo "Falling back to npm (legacy peer deps)"
  export NPM_CONFIG_LEGACY_PEER_DEPS=1
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps
fi

# Sync Capacitor iOS (copies web assets and ensures Podfile/plugins are in place)
npx cap sync ios

# Install CocoaPods for the iOS workspace
export COCOAPODS_DISABLE_STATS=1
cd ios/App
pod install --repo-update

echo "Post-clone setup complete."
