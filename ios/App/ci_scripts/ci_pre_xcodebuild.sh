#!/bin/sh
set -euo pipefail
exec "$(dirname "$0")/../../ci_scripts/ci_pre_xcodebuild.sh"

