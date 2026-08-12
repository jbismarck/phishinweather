#!/bin/sh
# Post-deploy smoke test for phishinweather.com
# Railway deploys take ~60s — run this after the deploy log shows success.

HOST="https://phishinweather.com"
PASS=0
FAIL=0

check() {
  local label="$1"
  local url="$2"
  local timeout="${3:-10}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url")
  if [ "$status" = "200" ]; then
    echo "  ✓ $label ($status)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label — got $status (expected 200)"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke testing $HOST..."
check "Home page"            "$HOST/"
check "CSS bundle"           "$HOST/resources/ws.min.css"
check "JS bundle"            "$HOST/resources/ws.min.js"
check "Phish on-this-day"   "$HOST/api/phish/on-this-day" 30
check "Phish summer tour"    "$HOST/api/phish/tour"
check "Poster page"          "$HOST/poster"

echo ""
if [ $FAIL -eq 0 ]; then
  echo "✓ All $PASS checks passed"
else
  echo "✗ $FAIL check(s) failed, $PASS passed"
  exit 1
fi
