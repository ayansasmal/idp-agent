#!/bin/bash

# Simplified dependency update script for all packages and root project

echo "🚀 Updating all dependencies to latest versions across all packages and root..."

# Update root project dependencies
if [ -f package.json ]; then
  echo "📦 Updating dependencies in root project..."
  npx npm-check-updates -u
  npm install --legacy-peer-deps
  echo "✅ Root project dependencies updated."
fi

# Find all package.json files (excluding node_modules, .next, dist, and root)
find packages -name package.json -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" | while read pkg; do
  dir=$(dirname "$pkg")
  echo "📦 Updating dependencies in $dir..."
  cd "$dir" && npx npm-check-updates -u && npm install --legacy-peer-deps && cd - > /dev/null
  echo "✅ $dir dependencies updated."
done

echo "🎉 All dependencies updated to latest versions!"
echo "📋 Running type checks..."

npm run type-check --workspaces

echo "✅ Dependency update complete!"