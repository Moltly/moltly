#!/bin/sh
# Wrapper for environments that look for ci_scripts/post_xcodebuild.sh
set -euo pipefail
exec "$(dirname "$0")/ci_post_xcodebuild.sh"

