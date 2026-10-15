#!/usr/bin/env sh
# Start Voxlabs on macOS / Linux.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install || exit 1
if [ ! -f .next/BUILD_ID ] || [ "${REBUILD:-0}" = "1" ]; then npm run build || exit 1; fi
URL="http://localhost:${PORT:-3000}"
( sleep 3; (command -v xdg-open >/dev/null && xdg-open "$URL") || (command -v open >/dev/null && open "$URL") ) >/dev/null 2>&1 &
echo "Voxlabs running at $URL  (Ctrl+C to stop)"
exec npx next start -p "${PORT:-3000}"
