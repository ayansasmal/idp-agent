import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // Core package tests
  {
    test: {
      name: 'core',
      root: './packages/core',
      environment: 'node',
      include: ['**/*.test.ts', '**/*.spec.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts']
      }
    }
  },
  // Web interface tests
  {
    test: {
      name: 'web-interface',
      root: './packages/web-interface',
      environment: 'jsdom',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      exclude: ['**/node_modules/**', '**/dist/**']
    }
  },
  // Slack app tests
  {
    test: {
      name: 'slack-app',
      root: './packages/slack-app',
      environment: 'node',
      include: ['**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**']
    }
  },
  // CLI tests
  {
    test: {
      name: 'cli',
      root: './packages/cli',
      environment: 'node',
      include: ['**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**']
    }
  },
  // API server tests
  {
    test: {
      name: 'api-server',
      root: './packages/api-server',
      environment: 'node',
      include: ['**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**']
    }
  },
  // Tools tests
  {
    test: {
      name: 'tools',
      root: './tools',
      environment: 'node',
      include: ['**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**']
    }
  }
])