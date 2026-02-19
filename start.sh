#!/bin/bash
set -e

echo "Starting Kural IDE..."
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
python "$ROOT_DIR/backend/server.py" &
echo "Kural IDE running at http://localhost:5000"
