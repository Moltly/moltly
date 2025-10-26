#!/bin/sh
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
exec "$ROOT_DIR/ci_scripts/ci_post_xcodebuild.sh"
