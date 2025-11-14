# Production Deployment Guide 🚀

## **Complete Production Setup for AI-IDP Multi-Agent System**

**Last Updated**: 2025-09-12  
**Target Environment**: Production-ready distributed infrastructure with HTTP MCP transport  
**Prerequisites**: Docker, Kubernetes cluster, AWS/LocalStack setup

---

## 1. Overview & Requirements

### **System Components for Production**
- ✅ **Meta-Agent**: Central orchestrator with HTTP MCP communication and WebSocket UI server
- ✅ **Infrastructure Agent**: K8s operations with AI integration (HTTP MCP server)
- ✅ **Observability Agent**: SLM-powered monitoring (HTTP MCP server)
- ✅ **Web Application**: Next.js frontend with real-time WebSocket updates
- ✅ **Action Manager**: Distributed tracking system
- ✅ **Supporting Services**: DynamoDB, Qdrant, Redis, Ollama

### **Infrastructure Requirements**
| Component | CPU | Memory | Storage | Network |
|-----------|-----|---------|----------|----------|
| Meta-Agent | 2 vCPU | 4GB RAM | 10GB | Port 3000 (WebSocket UI + HTTP API) |
| Infrastructure Agent | 2 vCPU | 4GB RAM | 10GB | Port 3003 (HTTP MCP Server) |
| Observability Agent | 4 vCPU | 8GB RAM | 20GB | Port 3005 (HTTP MCP Server) |
| Web Application | 1 vCPU | 2GB RAM | 5GB | Port 3002 |
| DynamoDB Local | 1 vCPU | 2GB RAM | 50GB | Port 8000 |
| Qdrant | 2 vCPU | 4GB RAM | 100GB | Port 6333 |
| Ollama | 4 vCPU | 8GB RAM | 50GB | Port 11434 |
| Redis | 1 vCPU | 2GB RAM | 10GB | Port 6379 |

---

## 1.1 Architecture Migration: WebSocket → HTTP MCP Transport

### **Communication Layer Changes**

**Previous Architecture (WebSocket + JSON-RPC):**
- Meta-Agent ↔ Infrastructure Agent: WebSocket + JSON-RPC 2.0
- Meta-Agent ↔ Observability Agent: WebSocket + JSON-RPC 2.0
- Web UI ↔ Meta-Agent: WebSocket (real-time updates)

**Current Architecture (HTTP MCP + WebSocket UI):**
- **Agent-to-Agent Communication**: HTTP MCP transport (ports 3003, 3005)
- **UI Real-time Updates**: WebSocket (unchanged, port 3000)
- **API Endpoints**: HTTP REST API (unchanged)

### **Key Benefits of HTTP MCP Transport**
- ✅ **Simplified Deployment**: Standard HTTP load balancing and proxying
- ✅ **Better Monitoring**: HTTP metrics and logging out of the box
- ✅ **Improved Reliability**: HTTP retry mechanisms and connection pooling
- ✅ **Easier Debugging**: Standard HTTP tools (curl, Postman, browser dev tools)
- ✅ **Cloud-Native**: Works seamlessly with service meshes and API gateways

### **Migration Impact**
- **No UI Changes**: WebSocket real-time updates preserved for user experience
- **Enhanced Monitoring**: HTTP MCP endpoints provide better observability
- **Improved Scalability**: HTTP load balancing for agent communication
- **Simplified Configuration**: Standard HTTP environment variables

---

## 2. Production Docker Compose

### **2.1 Complete docker-compose.prod.yml**

```yaml
version: '3.8'

services:
  # ===============================
  # Core AI-IDP Services
  # ===============================
  
  meta-agent:
    build:
      context: ./packages/meta-agent
      dockerfile: Dockerfile.prod
    ports:
      - "3000:3000"  # WebSocket UI + HTTP API
    environment:
      # Action Manager Configuration
      - ACTION_MANAGER_ENABLED=true
      - WEBSOCKET_ENABLED=true
      - NODE_ENV=production
      
      # AI Provider Configuration  
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      
      # Database Configuration
      - DYNAMODB_ENDPOINT=http://dynamodb:8000
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333
      
      # Agent Communication (HTTP MCP)
      - INFRASTRUCTURE_AGENT_MCP_URL=http://infrastructure-agent:3003/mcp
      - OBSERVABILITY_AGENT_MCP_URL=http://observability-agent:3005/mcp
      - INFRASTRUCTURE_AGENT_URL=http://infrastructure-agent:3003
      - OBSERVABILITY_AGENT_URL=http://observability-agent:3005
      
      # Security
      - JWT_SECRET=${JWT_SECRET}
      - API_KEY=${API_KEY}
      
      # Monitoring
      - LOG_LEVEL=info
      - METRICS_ENABLED=true
    depends_on:
      - dynamodb
      - redis
      - qdrant
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - ai-idp-network

  infrastructure-agent:
    build:
      context: ./packages/agents/infrastructure
      dockerfile: Dockerfile.prod
    ports:
      - "3003:3003"  # HTTP MCP Server
    environment:
      - NODE_ENV=production
      - OLLAMA_BASE_URL=http://ollama:11434
      - KUBECONFIG=/app/.kube/config
      - LOG_LEVEL=info
      - MCP_ENABLED=true
      - MCP_TRANSPORT=http
      - MCP_HTTP_PORT=3003
    volumes:
      - ${KUBECONFIG_PATH}:/app/.kube/config:ro
      - ./data/infrastructure-logs:/app/logs
    depends_on:
      - ollama
      - qdrant
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - ai-idp-network

  observability-agent:
    build:
      context: ./packages/agents/observability
      dockerfile: Dockerfile.prod
    ports:
      - "3005:3005"  # HTTP MCP Server
    environment:
      - NODE_ENV=production
      - OLLAMA_BASE_URL=http://ollama:11434
      - QDRANT_URL=http://qdrant:6333
      - LOG_LEVEL=info
      - MCP_ENABLED=true
      - MCP_TRANSPORT=http
      - MCP_HTTP_PORT=3005
    volumes:
      - ./data/observability-logs:/app/logs
    depends_on:
      - ollama
      - qdrant
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3005/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - ai-idp-network

  web-app:
    build:
      context: ./packages/web-app
      dockerfile: Dockerfile.prod
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_META_AGENT_URL=ws://meta-agent:3000
      - NEXT_PUBLIC_ENABLE_ACTION_TRACKING=true
      - NEXT_PUBLIC_WEBSOCKET_RECONNECT_INTERVAL=5000
    depends_on:
      - meta-agent
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - ai-idp-network

  # ===============================
  # Supporting Services
  # ===============================

  dynamodb:
    image: amazon/dynamodb-local:latest
    ports:
      - "8000:8000"
    command: ["-jar", "DynamoDBLocal.jar", "-sharedDb", "-dbPath", "/home/dynamodblocal/data"]
    volumes:
      - ./data/dynamodb:/home/dynamodblocal/data
      - ./scripts/dynamodb-init:/docker-entrypoint-initdb.d
    restart: unless-stopped
    networks:
      - ai-idp-network

  qdrant:
    image: qdrant/qdrant:v1.7.4
    ports:
      - "6333:6333"
    volumes:
      - ./data/qdrant:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__LOG_LEVEL=INFO
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - ai-idp-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis:/data
    command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - ai-idp-network

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ./data/ollama:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0
      - OLLAMA_NUM_PARALLEL=4
      - OLLAMA_MAX_LOADED_MODELS=3
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/version"]
      interval: 60s
      timeout: 30s
      retries: 3
    networks:
      - ai-idp-network

  # ===============================
  # Monitoring & Observability  
  # ===============================

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./data/prometheus:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
    restart: unless-stopped
    networks:
      - ai-idp-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - ./data/grafana:/var/lib/grafana
      - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./config/grafana/datasources:/etc/grafana/provisioning/datasources
    restart: unless-stopped
    networks:
      - ai-idp-network

  # ===============================
  # Reverse Proxy & SSL
  # ===============================

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf
      - ./config/ssl:/etc/nginx/ssl
      - ./data/nginx-logs:/var/log/nginx
    depends_on:
      - web-app
      - meta-agent
    restart: unless-stopped
    networks:
      - ai-idp-network

networks:
  ai-idp-network:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: 172.20.0.0/16

volumes:
  dynamodb-data:
  qdrant-data:
  redis-data:
  ollama-data:
  prometheus-data:
  grafana-data:
```

### **2.2 Environment Configuration (.env.prod)**

```bash
# ===============================
# Production Environment Variables
# ===============================

# AI Provider API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Security
JWT_SECRET=your_super_secure_jwt_secret_minimum_32_chars
API_KEY=your_api_key_for_service_authentication

# Monitoring
GRAFANA_ADMIN_PASSWORD=your_secure_grafana_password

# Kubernetes Configuration
KUBECONFIG_PATH=/path/to/your/kubeconfig

# Database URLs (for external services if not using docker-compose)
DYNAMODB_ENDPOINT=http://localhost:8000
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
OLLAMA_BASE_URL=http://localhost:11434

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
METRICS_ENABLED=true

# Agent Communication (HTTP MCP)
INFRASTRUCTURE_AGENT_MCP_URL=http://localhost:3003/mcp
OBSERVABILITY_AGENT_MCP_URL=http://localhost:3005/mcp
INFRASTRUCTURE_AGENT_URL=http://localhost:3003
OBSERVABILITY_AGENT_URL=http://localhost:3005
MCP_TRANSPORT=http

# WebSocket Configuration (UI Real-time Updates)
WEBSOCKET_ENABLED=true
WEBSOCKET_RECONNECT_INTERVAL=5000
WEBSOCKET_MAX_CONNECTIONS=1000

# Action Manager Configuration
ACTION_MANAGER_ENABLED=true
```

---

## 3. Production Dockerfiles

### **3.1 Meta-Agent Dockerfile.prod**

```dockerfile
# packages/meta-agent/Dockerfile.prod
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace setup
COPY package*.json ./
COPY packages/meta-agent/package*.json ./packages/meta-agent/
COPY packages/shared ./packages/shared

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY packages/meta-agent ./packages/meta-agent

# Build the application
WORKDIR /app/packages/meta-agent
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built application and dependencies
COPY --from=builder /app/packages/meta-agent/dist ./dist
COPY --from=builder /app/packages/meta-agent/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S meta-agent -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R meta-agent:nodejs /app
USER meta-agent

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

### **3.2 Infrastructure Agent Dockerfile.prod**

```dockerfile
# packages/agents/infrastructure/Dockerfile.prod
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace dependencies
COPY package*.json ./
COPY packages/agents/infrastructure/package*.json ./packages/agents/infrastructure/
COPY packages/shared ./packages/shared

RUN npm ci --only=production

# Copy and build
COPY packages/agents/infrastructure ./packages/agents/infrastructure
WORKDIR /app/packages/agents/infrastructure
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Install kubectl and curl
RUN apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

# Copy built application
COPY --from=builder /app/packages/agents/infrastructure/dist ./dist
COPY --from=builder /app/packages/agents/infrastructure/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared

# Create directories and user
RUN mkdir -p /app/.kube /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S infrastructure -u 1001 -G nodejs && \
    chown -R infrastructure:nodejs /app

USER infrastructure

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

CMD ["node", "dist/index.js"]
```

### **3.3 Web App Dockerfile.prod**

```dockerfile
# packages/web-app/Dockerfile.prod
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY packages/web-app/package*.json ./packages/web-app/
COPY packages/shared ./packages/shared

RUN npm ci --only=production

# Copy and build web app
COPY packages/web-app ./packages/web-app
WORKDIR /app/packages/web-app

# Build Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache curl

# Copy built Next.js app
COPY --from=builder /app/packages/web-app/.next/standalone ./
COPY --from=builder /app/packages/web-app/.next/static ./.next/static
COPY --from=builder /app/packages/web-app/public ./public

# Create user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

CMD ["node", "server.js"]
```

---

## 4. Configuration Files

### **4.1 Nginx Configuration (config/nginx.conf)**

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=websocket:10m rate=5r/s;

    # Upstream servers
    upstream web-app {
        server web-app:3002;
    }

    upstream meta-agent {
        server meta-agent:3000;
    }

    upstream infrastructure-agent {
        server infrastructure-agent:3003;
    }

    upstream observability-agent {
        server observability-agent:3005;
    }

    upstream grafana {
        server grafana:3000;
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # Main HTTPS server
    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

        # Main web application
        location / {
            proxy_pass http://web-app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API endpoints
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://meta-agent;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket connections (UI real-time updates)
        location /ws {
            limit_req zone=websocket burst=10 nodelay;
            proxy_pass http://meta-agent;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400;
        }

        # HTTP MCP endpoints for agent communication
        location /mcp/infrastructure/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://infrastructure-agent/mcp/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300;
        }

        location /mcp/observability/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://observability-agent/mcp/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300;
        }

        # Monitoring dashboard
        location /monitoring/ {
            proxy_pass http://grafana/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### **4.2 Prometheus Configuration (config/prometheus.yml)**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  # AI-IDP Services
  - job_name: 'meta-agent'
    static_configs:
      - targets: ['meta-agent:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'infrastructure-agent'
    static_configs:
      - targets: ['infrastructure-agent:3003']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'infrastructure-agent-mcp'
    static_configs:
      - targets: ['infrastructure-agent:3003']
    metrics_path: '/mcp/metrics'
    scrape_interval: 30s

  - job_name: 'observability-agent'
    static_configs:
      - targets: ['observability-agent:3005']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'observability-agent-mcp'
    static_configs:
      - targets: ['observability-agent:3005']
    metrics_path: '/mcp/metrics'
    scrape_interval: 30s

  - job_name: 'web-app'
    static_configs:
      - targets: ['web-app:3002']
    metrics_path: '/api/metrics'
    scrape_interval: 30s

  # System metrics
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

---

## 5. Initialization Scripts

### **5.1 DynamoDB Table Setup (scripts/dynamodb-init/create-tables.sh)**

```bash
#!/bin/bash

# Wait for DynamoDB to be ready
echo "Waiting for DynamoDB to be ready..."
until curl -s http://localhost:8000/health > /dev/null; do
    sleep 2
done

echo "Creating DynamoDB tables..."

# Create action_tracking table
aws dynamodb create-table \
    --endpoint-url http://localhost:8000 \
    --table-name action_tracking \
    --attribute-definitions \
        AttributeName=actionId,AttributeType=S \
        AttributeName=userId,AttributeType=S \
        AttributeName=sessionId,AttributeType=S \
        AttributeName=status,AttributeType=S \
        AttributeName=agentName,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
    --key-schema \
        AttributeName=actionId,KeyType=HASH \
    --global-secondary-indexes \
        'IndexName=UserIndex,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        'IndexName=SessionIndex,KeySchema=[{AttributeName=sessionId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        'IndexName=StatusIndex,KeySchema=[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        'IndexName=AgentIndex,KeySchema=[{AttributeName=agentName,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=10,WriteCapacityUnits=10 \
    --region us-west-2

# Create chat_sessions table  
aws dynamodb create-table \
    --endpoint-url http://localhost:8000 \
    --table-name chat_sessions \
    --attribute-definitions \
        AttributeName=sessionId,AttributeType=S \
        AttributeName=userId,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
    --key-schema \
        AttributeName=sessionId,KeyType=HASH \
    --global-secondary-indexes \
        'IndexName=UserSessionsIndex,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region us-west-2

echo "DynamoDB tables created successfully!"
```

### **5.2 Ollama Model Setup (scripts/ollama-init/setup-models.sh)**

```bash
#!/bin/bash

echo "Waiting for Ollama to be ready..."
until curl -s http://localhost:11434/api/version > /dev/null; do
    sleep 5
done

echo "Setting up AI models..."

# Pull required models
echo "Pulling Llama 3.2:3b for observability agent..."
curl -X POST http://localhost:11434/api/pull \
    -H "Content-Type: application/json" \
    -d '{"name": "llama3.2:3b"}'

echo "Pulling Kubernetes operator model for infrastructure agent..."
curl -X POST http://localhost:11434/api/pull \
    -H "Content-Type: application/json" \
    -d '{"name": "kubernetes_operator_3b_peft_gguf"}'

echo "Models setup complete!"
```

---

## 6. Production Deployment Steps

### **6.1 Pre-deployment Checklist**

```bash
# 1. Verify system requirements
docker --version
docker-compose --version
kubectl version --client

# 2. Prepare directories
mkdir -p data/{dynamodb,qdrant,redis,ollama,prometheus,grafana,nginx-logs}
mkdir -p config/{ssl,grafana/{dashboards,datasources}}

# 3. Set environment variables
cp .env.example .env.prod
# Edit .env.prod with production values

# 4. Generate SSL certificates (Let's Encrypt example)
certbot certonly --standalone -d your-domain.com
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem config/ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem config/ssl/

# 5. Verify kubeconfig
export KUBECONFIG=/path/to/your/kubeconfig
kubectl cluster-info
```

### **6.2 Deployment Commands**

```bash
# 1. Build and start all services
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# 2. Initialize databases
docker-compose -f docker-compose.prod.yml exec dynamodb /docker-entrypoint-initdb.d/create-tables.sh

# 3. Setup AI models
docker-compose -f docker-compose.prod.yml exec ollama /setup-models.sh

# 4. Verify all services are healthy
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs --tail=50
```

### **6.3 Health Check Verification**

```bash
# Core services health checks
curl -f http://localhost:3000/health  # Meta-Agent (WebSocket UI + HTTP API)
curl -f http://localhost:3003/health  # Infrastructure Agent (HTTP MCP Server)
curl -f http://localhost:3003/mcp/health  # Infrastructure Agent MCP endpoint
curl -f http://localhost:3005/health  # Observability Agent (HTTP MCP Server)
curl -f http://localhost:3005/mcp/health  # Observability Agent MCP endpoint
curl -f http://localhost:3002/api/health  # Web App

# Supporting services
curl -f http://localhost:8000/health  # DynamoDB
curl -f http://localhost:6333/health  # Qdrant
redis-cli ping  # Redis
curl -f http://localhost:11434/api/version  # Ollama

# Monitoring
curl -f http://localhost:9090/-/healthy  # Prometheus
curl -f http://localhost:3001/api/health  # Grafana
```

---

## 7. Monitoring & Logging

### **7.1 Log Management**

```bash
# Centralized logging with Docker
docker-compose -f docker-compose.prod.yml logs -f --tail=100

# Service-specific logs
docker-compose -f docker-compose.prod.yml logs -f meta-agent
docker-compose -f docker-compose.prod.yml logs -f infrastructure-agent
docker-compose -f docker-compose.prod.yml logs -f observability-agent

# Log rotation configuration
# Add to docker-compose.prod.yml for each service:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### **7.2 Monitoring Setup**

Access monitoring dashboards:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/password from .env.prod)
- **Application**: https://your-domain.com
- **Action Dashboard**: https://your-domain.com/dashboard

### **7.3 Key Metrics to Monitor**

| Metric Category | Key Metrics | Alert Thresholds |
|----------------|-------------|------------------|
| **Action Tracking** | Action creation rate, completion rate, failure rate | >20% failure rate |
| **Performance** | Response time, throughput, queue depth | >5s response time |
| **Resources** | CPU usage, memory usage, disk usage | >80% utilization |
| **AI Models** | Model response time, error rate | >10s response time |
| **HTTP MCP** | Request rate, response time, error rate | >5s MCP response time |
| **WebSocket (UI)** | Connection count, message rate, reconnections | >100 reconnections/min |

---

## 8. Backup & Recovery

### **8.1 Backup Strategy**

```bash
#!/bin/bash
# backup.sh - Daily backup script

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/$DATE"

mkdir -p "$BACKUP_DIR"

# Backup DynamoDB tables
docker-compose -f docker-compose.prod.yml exec dynamodb \
    aws dynamodb scan --table-name action_tracking --endpoint-url http://localhost:8000 \
    > "$BACKUP_DIR/action_tracking.json"

docker-compose -f docker-compose.prod.yml exec dynamodb \
    aws dynamodb scan --table-name chat_sessions --endpoint-url http://localhost:8000 \
    > "$BACKUP_DIR/chat_sessions.json"

# Backup Qdrant vector data
docker cp ai-idp_qdrant_1:/qdrant/storage "$BACKUP_DIR/qdrant"

# Backup configuration files
cp -r config "$BACKUP_DIR/"
cp .env.prod "$BACKUP_DIR/"

# Compress backup
tar -czf "backup_$DATE.tar.gz" -C /backups "$DATE"

echo "Backup completed: backup_$DATE.tar.gz"
```

### **8.2 Recovery Procedure**

```bash
#!/bin/bash
# restore.sh - Restore from backup

BACKUP_FILE="$1"
if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.tar.gz>"
    exit 1
fi

# Extract backup
tar -xzf "$BACKUP_FILE" -C /tmp/restore

# Stop services
docker-compose -f docker-compose.prod.yml down

# Restore data
cp -r /tmp/restore/*/data/* ./data/
cp -r /tmp/restore/*/config/* ./config/
cp /tmp/restore/*/.env.prod ./

# Restart services
docker-compose -f docker-compose.prod.yml up -d

echo "Restore completed from $BACKUP_FILE"
```

---

## 9. Security Hardening

### **9.1 Network Security**

```bash
# Firewall configuration (Ubuntu/Debian)
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw deny 3000:3005  # Block direct access to internal services
ufw enable

# Docker network isolation
# Internal services are isolated in ai-idp-network
# Only nginx has external access
```

### **9.2 SSL/TLS Configuration**

```bash
# Automatic SSL renewal with Let's Encrypt
echo "0 2 * * 1 /usr/bin/certbot renew --quiet && docker-compose -f docker-compose.prod.yml restart nginx" | crontab -
```

### **9.3 Secrets Management**

```bash
# Use Docker secrets for sensitive data
echo "your_anthropic_api_key" | docker secret create anthropic_api_key -
echo "your_jwt_secret" | docker secret create jwt_secret -

# Update docker-compose.prod.yml to use secrets:
secrets:
  - anthropic_api_key
  - jwt_secret

environment:
  - ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key
```

---

## 10. Performance Optimization

### **10.1 Resource Limits**

Add to each service in docker-compose.prod.yml:
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
    reservations:
      cpus: '1.0'
      memory: 2G
```

### **10.2 Caching Strategy**

```bash
# Redis configuration optimization
# Add to redis service in docker-compose
command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru --save 900 1 --appendonly yes
```

### **10.3 Database Optimization**

```bash
# DynamoDB optimization
# Consider switching to AWS DynamoDB for production
# Configure auto-scaling and backup policies
```

---

## 10.1 HTTP MCP Transport Troubleshooting

### **MCP Communication Debug Commands**

```bash
# Test HTTP MCP endpoints directly
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}'

curl -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}'

# Check MCP endpoint health
curl -f http://localhost:3003/mcp/health
curl -f http://localhost:3005/mcp/health

# Test tool discovery
curl -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 2}'

# Monitor MCP request/response
docker-compose -f docker-compose.prod.yml logs -f infrastructure-agent | grep -E "MCP|HTTP"
docker-compose -f docker-compose.prod.yml logs -f observability-agent | grep -E "MCP|HTTP"
```

### **Common MCP Issues & Solutions**

| Problem | Symptoms | Diagnosis | Solution |
|---------|----------|-----------|----------|
| **MCP Server Not Starting** | 404 on /mcp endpoints | Port binding issues | Check `MCP_HTTP_PORT` environment variable |
| **MCP Request Timeout** | Meta-Agent logs show timeouts | Network/performance issues | Increase nginx proxy_read_timeout |
| **Tool Discovery Fails** | Empty tool lists returned | Agent initialization problems | Restart agents, check Ollama connectivity |
| **JSON-RPC Format Errors** | 400/500 responses from MCP | Malformed requests | Check request format, enable debug logging |
| **Connection Refused** | ECONNREFUSED errors | Agent not ready | Wait for health checks to pass |

### **Performance Tuning for HTTP MCP**

```bash
# Add to nginx.conf for MCP endpoints
location /mcp/ {
    # Connection pooling
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    
    # Timeouts for long-running operations
    proxy_connect_timeout 10s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    # Buffer configuration
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    
    # Enable keep-alive
    proxy_set_header Connection "keep-alive";
}
```

---

## 11. Troubleshooting

### **11.1 Common Issues**

| Issue | Symptoms | Solution |
|-------|----------|----------|
| Service won't start | Exit code 1 | Check logs, verify environment variables |
| WebSocket UI disconnects | Connection errors in browser | Check nginx WebSocket config, firewall |
| HTTP MCP communication fails | Agent timeouts, 502/504 errors | Verify MCP endpoints, check agent health |
| AI models not loading | 404 errors from agents | Verify Ollama setup, model downloads |
| DynamoDB errors | Action creation fails | Check table creation, permissions |
| High memory usage | System slowdown | Implement resource limits, monitoring |
| MCP endpoint not found | 404 on /mcp paths | Check agent MCP server startup, port binding |

### **11.2 Debug Commands**

```bash
# Service logs
docker-compose -f docker-compose.prod.yml logs -f [service_name]

# Service shell access
docker-compose -f docker-compose.prod.yml exec [service_name] sh

# Network debugging
docker network ls
docker network inspect ai-idp_ai-idp-network

# Resource usage
docker stats

# Health check status
docker-compose -f docker-compose.prod.yml ps

# HTTP MCP specific debugging
curl -v http://localhost:3003/mcp/health  # Verbose HTTP MCP health check
curl -v http://localhost:3005/mcp/health  # Verbose HTTP MCP health check

# Test agent communication paths
curl -X POST http://localhost:3000/api/agents/infrastructure/health
curl -X POST http://localhost:3000/api/agents/observability/health
```

---

## 12. Scaling & High Availability

### **12.1 Horizontal Scaling with HTTP MCP**

```yaml
# Scale specific services
docker-compose -f docker-compose.prod.yml up -d --scale meta-agent=3 --scale infrastructure-agent=2 --scale observability-agent=2

# Load balancer configuration (add to nginx.conf)
upstream meta-agent-cluster {
    server meta-agent:3000;
    server meta-agent:3000;
    server meta-agent:3000;
}

upstream infrastructure-agent-cluster {
    server infrastructure-agent:3003;
    server infrastructure-agent:3003;
    # Add more instances as needed
}

upstream observability-agent-cluster {
    server observability-agent:3005;
    server observability-agent:3005;
    # Add more instances as needed
}

# Update MCP proxy locations
location /mcp/infrastructure/ {
    proxy_pass http://infrastructure-agent-cluster/mcp/;
    # HTTP load balancing for MCP requests
}

location /mcp/observability/ {
    proxy_pass http://observability-agent-cluster/mcp/;
    # HTTP load balancing for MCP requests
}
```

### **HTTP MCP Load Balancing Benefits**
- ✅ **Stateless Communication**: HTTP MCP requests can be load balanced easily
- ✅ **Connection Pooling**: Better resource utilization vs WebSocket connections
- ✅ **Health Check Integration**: Standard HTTP health checks work with load balancers
- ✅ **Graceful Degradation**: Failed agents don't affect persistent connections

### **12.2 Database Scaling**

```bash
# Consider migration to managed services for production:
# - AWS DynamoDB with auto-scaling
# - Qdrant Cloud for vector storage
# - AWS ElastiCache for Redis
```

---

**🎉 Your AI-IDP Multi-Agent System is now production-ready with HTTP MCP transport, comprehensive monitoring, security, and scalability features!**

**Architecture Highlights:**
- ✅ **HTTP MCP Transport**: Simplified agent-to-agent communication with better monitoring
- ✅ **WebSocket UI Updates**: Preserved real-time user experience
- ✅ **Load Balancer Ready**: Standard HTTP scaling and health checks
- ✅ **Cloud-Native**: Service mesh and API gateway compatible
- ✅ **Enhanced Observability**: HTTP metrics, logs, and debugging tools

**Next Steps:**
1. Deploy using the updated HTTP MCP configuration
2. Monitor both HTTP MCP metrics and WebSocket UI metrics via Grafana
3. Test agent communication via HTTP MCP endpoints
4. Verify WebSocket real-time updates still function
5. Set up HTTP-specific alerting for MCP transport
6. Plan for HTTP load balancing based on agent usage patterns

**Migration Validation Checklist:**
- [ ] All agents start with HTTP MCP servers on ports 3003, 3005
- [ ] Meta-Agent can communicate with agents via HTTP MCP
- [ ] WebSocket UI updates continue to work on port 3000
- [ ] MCP health endpoints respond: `/mcp/health`
- [ ] Nginx routes HTTP MCP traffic correctly
- [ ] Prometheus scrapes HTTP MCP metrics
- [ ] Load balancing works for scaled agent instances