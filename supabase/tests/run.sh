#!/usr/bin/env bash
# Fresh DB -> all migrations -> RLS/role security tests. Exits non-zero on any failure.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/../local/reset.sh" nirmaan_test 2>&1 | grep -v NOTICE | tail -1
OUT="$(psql -X -d nirmaan_test -q -f "$HERE/rls_tests.sql" 2>&1 || true)"
echo "$OUT" | grep -E "ERROR|FATAL" && { echo "SQL error while running tests"; exit 2; } || true
echo "$OUT" | grep -o 'CHECK|.*' | awk -F'|' '{printf "%-5s %s %s\n", $2, $3, ($4==""?"":"("$4")")}' | sort
P=$(echo "$OUT" | grep -c 'CHECK|PASS' || true); F=$(echo "$OUT" | grep -c 'CHECK|FAIL' || true)
echo "----"; echo "$P passed, $F failed"
[ "$F" -eq 0 ] && [ "$P" -gt 0 ]
