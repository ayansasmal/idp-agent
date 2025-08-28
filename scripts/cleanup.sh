#!/bin/bash

# AI-IDP Service Cleanup Script
# Kills any remaining processes and cleans up PID files

echo "🧹 Cleaning up AI-IDP services..."

# Kill processes by port (fallback cleanup)
PORTS=(3000 3001 3002 3003)

for port in "${PORTS[@]}"; do
    echo "Checking port $port..."
    PID=$(lsof -ti :$port)
    if [ ! -z "$PID" ]; then
        echo "  Killing process $PID on port $port"
        kill -TERM $PID 2>/dev/null || kill -KILL $PID 2>/dev/null
        sleep 1
    fi
done

# Clean up PID file
PID_FILE="$(dirname "$0")/../.pids.json"
if [ -f "$PID_FILE" ]; then
    echo "🗑️  Removing PID file: $PID_FILE"
    rm "$PID_FILE"
fi

# Clean up any remaining tsx/node processes related to our project
echo "Cleaning up remaining tsx/node processes..."
pkill -f "tsx.*src/index.ts" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

echo "✅ Cleanup complete!"