#!/usr/bin/env node

/**
 * Process Manager for AI-IDP Services
 * 
 * Tracks PIDs and ports for all running services to enable clean shutdown
 * and process management across the multi-agent architecture.
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

// PID file location
const PID_FILE = path.join(__dirname, '..', '.pids.json');

/**
 * Load existing PIDs from file
 */
function loadPids() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const data = fs.readFileSync(PID_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Failed to load PID file:', error.message);
  }
  return {};
}

/**
 * Save PIDs to file
 */
function savePids(pids) {
  try {
    fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
    console.log(`✅ PIDs saved to ${PID_FILE}`);
  } catch (error) {
    console.error('Failed to save PID file:', error.message);
  }
}

/**
 * Register a process with PID tracking
 */
function registerProcess(name, pid, port, command) {
  const pids = loadPids();
  pids[name] = {
    pid,
    port,
    command,
    startTime: new Date().toISOString(),
    status: 'running'
  };
  savePids(pids);
  console.log(`📝 Registered ${name} (PID: ${pid}, Port: ${port})`);
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0); // Signal 0 just checks if process exists
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a port is in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    exec(`lsof -i :${port}`, (error, stdout) => {
      resolve(!error && stdout.trim().length > 0);
    });
  });
}

/**
 * Kill a process by PID
 */
function killProcess(pid, signal = 'SIGTERM') {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    console.warn(`Failed to kill process ${pid}:`, error.message);
    return false;
  }
}

/**
 * Clean up dead processes from PID file
 */
async function cleanupDeadProcesses() {
  const pids = loadPids();
  let changed = false;

  for (const [name, info] of Object.entries(pids)) {
    if (!isProcessRunning(info.pid)) {
      console.log(`🗑️  Removing dead process ${name} (PID: ${info.pid})`);
      delete pids[name];
      changed = true;
    }
  }

  if (changed) {
    savePids(pids);
  }
}

/**
 * Start a service with PID tracking
 */
function startService(name, command, port, cwd = process.cwd()) {
  console.log(`🚀 Starting ${name}...`);
  
  // Create environment with service-specific PORT for backward compatibility  
  const serviceEnv = { ...process.env };
  if (name === 'infrastructure-agent') {
    serviceEnv.PORT = process.env.INFRASTRUCTURE_AGENT_PORT || 3003;
  } else if (name === 'meta-agent') {
    serviceEnv.PORT = process.env.META_AGENT_PORT || 3000;
  } else if (name === 'web-app') {
    serviceEnv.PORT = process.env.WEB_PORT || 3002;
  }

  const child = spawn('sh', ['-c', command], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: serviceEnv,
    detached: false
  });

  // Register the process
  registerProcess(name, child.pid, port, command);

  // Handle output
  child.stdout.on('data', (data) => {
    console.log(`[${name}] ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[${name}] ${data.toString().trim()}`);
  });

  child.on('close', (code) => {
    console.log(`[${name}] Process exited with code ${code}`);
    
    // Remove from PID tracking
    const pids = loadPids();
    delete pids[name];
    savePids(pids);
  });

  child.on('error', (error) => {
    console.error(`[${name}] Failed to start:`, error.message);
  });

  return child;
}

/**
 * Stop all services
 */
async function stopAllServices(signal = 'SIGTERM') {
  console.log('🛑 Stopping all services...');
  
  const pids = loadPids();
  const promises = [];

  for (const [name, info] of Object.entries(pids)) {
    if (isProcessRunning(info.pid)) {
      console.log(`Stopping ${name} (PID: ${info.pid})...`);
      killProcess(info.pid, signal);
      
      // Wait a bit for graceful shutdown
      promises.push(new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!isProcessRunning(info.pid)) {
            console.log(`✅ ${name} stopped gracefully`);
            clearInterval(checkInterval);
            resolve();
          }
        }, 500);
        
        // Force kill after 10 seconds
        setTimeout(() => {
          if (isProcessRunning(info.pid)) {
            console.log(`⚠️  Force killing ${name} (PID: ${info.pid})`);
            killProcess(info.pid, 'SIGKILL');
          }
          clearInterval(checkInterval);
          resolve();
        }, 10000);
      }));
    }
  }

  await Promise.all(promises);
  
  // Clear PID file
  fs.writeFileSync(PID_FILE, '{}');
  console.log('✅ All services stopped and PID file cleared');
}

/**
 * Show status of all services
 */
async function showStatus() {
  const pids = loadPids();
  
  if (Object.keys(pids).length === 0) {
    console.log('No services registered');
    return;
  }

  console.log('\n📊 Service Status:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const [name, info] of Object.entries(pids)) {
    const running = isProcessRunning(info.pid);
    const portInUse = await isPortInUse(info.port);
    const status = running ? '🟢 Running' : '🔴 Stopped';
    const portStatus = portInUse ? `Port ${info.port} 🟢` : `Port ${info.port} 🔴`;
    
    console.log(`${name.padEnd(20)} │ PID: ${info.pid.toString().padEnd(8)} │ ${portStatus.padEnd(12)} │ ${status}`);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Start all AI-IDP services
 */
async function startAllServices() {
  console.log('🚀 Starting AI-IDP services...');
  
  // Load environment variables from root .env
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  
  const services = [
    {
      name: 'infrastructure-agent',
      command: 'npm run dev',
      port: process.env.INFRASTRUCTURE_AGENT_PORT || 3003,
      cwd: path.join(__dirname, '../packages/agents/infrastructure')
    },
    {
      name: 'meta-agent', 
      command: 'npm run dev',
      port: process.env.META_AGENT_PORT || 3000,
      cwd: path.join(__dirname, '../packages/meta-agent')
    }
  ];

  // Start services in order with delays
  for (const service of services) {
    startService(service.name, service.command, service.port, service.cwd);
    
    // Wait 2 seconds between service starts
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Wait for agents to initialize, then start web app
  setTimeout(() => {
    startService('web-app', 'npm run dev', process.env.WEB_PORT || 3002, path.join(__dirname, '../packages/web-app'));
  }, 8000); // 8 second delay as per original script

  console.log('✅ All services started with PID tracking');
}

// CLI Interface
const command = process.argv[2];

async function main() {
  switch (command) {
    case 'start':
      await startAllServices();
      break;
    case 'stop':
      await stopAllServices();
      break;
    case 'status':
      await showStatus();
      break;
    case 'cleanup':
      await cleanupDeadProcesses();
      break;
    case 'restart':
      await stopAllServices();
      setTimeout(startAllServices, 2000);
      break;
    default:
      console.log(`
AI-IDP Process Manager

Usage:
  node scripts/process-manager.js <command>

Commands:
  start     Start all AI-IDP services with PID tracking
  stop      Stop all running services gracefully
  status    Show status of all services
  cleanup   Remove dead processes from PID file
  restart   Stop and restart all services

PID file location: ${PID_FILE}
      `);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, stopping all services...');
  await stopAllServices();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, stopping all services...');
  await stopAllServices();
  process.exit(0);
});

main().catch(console.error);