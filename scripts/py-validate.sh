#!/usr/bin/env bash
set -euo pipefail

echo "Checking Python syntax in repository..."
failed=0
while IFS= read -r -d '' pyfile; do
  echo " - $pyfile"
  if ! python3 -m py_compile "$pyfile"; then
    echo "Syntax error in $pyfile" >&2
    failed=1
  fi
done < <(find . -name '*.py' -not -path './venv/*' -print0)

if [ "$failed" -ne 0 ]; then
  echo "Python syntax check failed" >&2
  exit 1
fi

echo "Python syntax OK"