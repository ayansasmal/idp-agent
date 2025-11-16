#!/usr/bin/env node

// Custom build script for web-app
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Set environment variables for the build
process.env.NODE_ENV = 'production';
process.env.NEXT_TELEMETRY_DISABLED = '1';

// Ensure the output directory exists
const outDir = path.resolve(__dirname, '../../dist/packages/web-app');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

try {
  // Clean up any existing .next directory
  const nextDir = path.resolve(__dirname, '.next');
  if (fs.existsSync(nextDir)) {
    console.log('Cleaning up existing .next directory...');
    fs.rmSync(nextDir, { recursive: true, force: true });
  }

  // Run the build command with Next.js directly
  console.log('Building Next.js application...');
  execSync('npx next build', {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_DISABLE_STATICGEN: '1', // Disable static generation
      NEXT_STATIC_GEN: 'false', // Another way to disable
      NEXT_TELEMETRY_DISABLED: '1', // Disable telemetry
      NEXT_REVALIDATE_PREFETCH: 'false', // Disable prefetch
    },
  });

  // Copy the build output to the dist directory
  console.log('Copying build output to dist directory...');
  execSync(`cp -R .next ${outDir}/.next`, {
    cwd: __dirname,
    stdio: 'inherit',
  });

  // Copy public directory if it exists
  const publicDir = path.resolve(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    console.log('Copying public directory...');
    execSync(`cp -R public ${outDir}/public`, {
      cwd: __dirname,
      stdio: 'inherit',
    });
  }

  // Copy package.json for deployment
  console.log('Copying package.json...');
  execSync(`cp package.json ${outDir}/package.json`, {
    cwd: __dirname,
    stdio: 'inherit',
  });

  // Create minimal next.config.js in output directory
  const minimalConfig = `
module.exports = {
  output: 'standalone',
  distDir: '.next'
};
`;
  fs.writeFileSync(path.join(outDir, 'next.config.js'), minimalConfig);

  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}