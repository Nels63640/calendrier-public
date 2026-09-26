#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v xcodebuild >/dev/null; then
  echo "Installez Xcode 26 ou plus récent, puis ouvrez-le une première fois."
  exit 1
fi
if ! command -v xcodegen >/dev/null; then
  echo "Installez XcodeGen : brew install xcodegen"
  exit 1
fi
swift test --package-path AlarmCore
xcodegen generate
open FamilyCalendar.xcodeproj
