#!/bin/sh
set -euo pipefail
exec "$(dirname "$0")/../../ci_scripts/ci_post_xcodebuild.sh"

