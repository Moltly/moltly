#!/bin/sh
# Wrapper for environments that look for ci_scripts/pre_xcodebuild.sh
set -euo pipefail
exec "$(dirname "$0")/ci_pre_xcodebuild.sh"

