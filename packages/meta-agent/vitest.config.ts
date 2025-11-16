import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      '@ai-idp/action-manager': path.resolve(__dirname, '../shared/action-manager/src'),
      '@ai-idp/types': path.resolve(__dirname, '../shared/types/src'),
      '@ai-idp/utils': path.resolve(__dirname, '../shared/utils/src'),
      '@ai-idp/mcp-client': path.resolve(__dirname, '../shared/mcp-client/src'),
      '@ai-idp/qdrant-client': path.resolve(__dirname, '../shared/qdrant-client/src')
    }
  }
});