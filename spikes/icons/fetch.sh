#!/usr/bin/env bash
# Наборы значков-кандидатов с npm (только файлы, без установки и скриптов пакетов) → files/<набор>/package/…
# Версии закреплены: те же, что в отчёте docs/reports/2026-10-icons.md.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
for p in lucide:lucide-static@1.61.0 tabler:@tabler/icons@3.49.0 phosphor:@phosphor-icons/core@2.1.1 carbon:@carbon/icons@11.91.0; do
  set_name="${p%%:*}"
  dir="$here/files/$set_name"
  rm -rf "$dir" && mkdir -p "$dir"
  (cd "$dir" && npm pack --silent "${p#*:}" >/dev/null && tar -xzf ./*.tgz && rm ./*.tgz)
  echo "$set_name: $(find "$dir" -name '*.svg' | wc -l) svg"
done
