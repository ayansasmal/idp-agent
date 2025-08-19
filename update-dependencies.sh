#!/bin/bash

echo "🚀 Updating all dependencies to latest versions..."

# Update core package dependencies
echo "📦 Updating @ai-idp/core..."
cd packages/core

# Update major dependencies
npm update @anthropic-ai/sdk@latest
npm update @fastify/cors@latest 
npm update @fastify/helmet@latest
npm update @fastify/rate-limit@latest
npm update @kubernetes/client-node@latest
npm update @langchain/core@latest
npm update @prisma/client@latest
npm update @types/node@latest
npm update @types/uuid@latest
npm update @vitest/ui@latest
npm update dotenv@latest
npm update fastify@latest
npm update langchain@latest
npm update pino@latest
npm update pino-pretty@latest
npm update prisma@latest
npm update redis@latest
npm update uuid@latest
npm update vitest@latest
npm update zod@latest

echo "✅ Core package updated"

# Update web-app package dependencies
echo "📦 Updating @ai-idp/web-app..."
cd ../web-app

npm update @anthropic-ai/sdk@latest
npm update @tanstack/react-query@latest
npm update @types/node@latest
npm update ai@latest
npm update concurrently@latest
npm update eslint-config-next@latest
npm update nanoid@latest
npm update next@latest
npm update react@latest
npm update react-dom@latest
npm update zod@latest

echo "✅ Web-app package updated"

# Update windmill-service package dependencies
echo "📦 Updating @ai-idp/windmill-service..."
cd ../windmill-service

npm update windmill-client@latest
npm update fastify@latest
npm update @fastify/cors@latest
npm update zod@latest
npm update pino@latest
npm update @types/node@latest
npm update vitest@latest

echo "✅ Windmill-service package updated"

# Go back to root
cd ../..

echo "🎉 All dependencies updated to latest versions!"
echo "📋 Running type checks..."

npm run type-check

echo "✅ Dependency update complete!"