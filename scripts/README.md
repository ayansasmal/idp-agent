# AI-IDP Process Management

This directory contains scripts for managing the multi-agent AI-IDP services with proper PID tracking and graceful shutdown capabilities.

## Files

- **`process-manager.js`** - Main process management script with PID tracking
- **`cleanup.sh`** - Emergency cleanup script for stuck processes  
- **`../.pids.json`** - Runtime PID tracking file (auto-generated, git-ignored)

## Usage

### Start All Services
```bash
npm run dev
# or
node scripts/process-manager.js start
```

This will start services in order:
1. Infrastructure Agent (port from `INFRASTRUCTURE_AGENT_PORT`)
2. Meta-Agent (port from `META_AGENT_PORT`) 
3. Web App (port from `WEB_PORT`) - starts after 8-second delay

### Stop All Services
```bash
npm run stop
# or
node scripts/process-manager.js stop
```

Gracefully stops all tracked services with 10-second timeout before force-kill.

### Check Service Status
```bash
npm run status
# or  
node scripts/process-manager.js status
```

Shows running status and port usage for all tracked services.

### Restart All Services
```bash
npm run restart
# or
node scripts/process-manager.js restart
```

Stops all services, waits 2 seconds, then starts them again.

### Emergency Cleanup
```bash
npm run cleanup
# or
./scripts/cleanup.sh
```

Force-kills processes by port and cleans up PID files. Use if normal stop doesn't work.

## PID Tracking

The system maintains a `.pids.json` file that tracks:
- Process IDs (PIDs)
- Port assignments
- Start times
- Command used to start each service
- Running status

Example `.pids.json`:
```json
{
  "infrastructure-agent": {
    "pid": 12345,
    "port": 3003,
    "command": "npm run dev",
    "startTime": "2025-08-28T10:30:00.000Z",
    "status": "running"
  },
  "meta-agent": {
    "pid": 12346, 
    "port": 3000,
    "command": "npm run dev",
    "startTime": "2025-08-28T10:30:02.000Z",
    "status": "running"
  }
}
```

## Features

✅ **PID Tracking** - All service processes tracked in `.pids.json`  
✅ **Port Management** - Tracks which service uses which port  
✅ **Graceful Shutdown** - SIGTERM followed by SIGKILL after timeout  
✅ **Status Monitoring** - Real-time process and port status  
✅ **Auto Cleanup** - Dead processes removed from tracking  
✅ **Environment Integration** - Uses ports from `.env` file  
✅ **Logging** - Clear output showing service lifecycle  
✅ **Signal Handling** - Ctrl+C triggers graceful shutdown  

## Troubleshooting

### Service Won't Start
1. Check if port is already in use: `npm run status`
2. Run cleanup: `npm run cleanup`
3. Try starting again: `npm run dev`

### Can't Stop Services  
1. Try normal stop: `npm run stop`
2. If that fails, use cleanup: `npm run cleanup`
3. Manually check ports: `lsof -i :3000 -i :3001 -i :3002 -i :3003`

### PID File Corruption
1. Stop all services: `npm run stop`
2. Delete PID file: `rm .pids.json` 
3. Start services: `npm run dev`

## Environment Variables

The process manager uses these environment variables from `.env`:
- `META_AGENT_PORT` - Port for Meta-Agent (default: 3000)
- `INFRASTRUCTURE_AGENT_PORT` - Port for Infrastructure Agent (default: 3003) 
- `WEB_PORT` - Port for Web App (default: 3002)

## Legacy Mode

The old concurrently-based startup is still available:
```bash
npm run dev:legacy
```

This bypasses PID tracking and uses the original startup method.