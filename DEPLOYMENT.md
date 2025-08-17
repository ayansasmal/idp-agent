# AI-IDP Deployment Guide

## 🚀 Deployment Options

The AI-IDP web application is a standard Next.js application that can be deployed to various platforms. This guide covers multiple deployment scenarios from local development to production environments.

## 📋 Prerequisites

- **Node.js**: 20.0.0 or higher
- **npm**: 10.0.0 or higher
- **Environment Variables**: ANTHROPIC_API_KEY (optional for demo mode)

## 🏠 Local Development

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd ai-idp

# Install dependencies
npm install

# Start web application
cd packages/web-app
npm run dev

# Visit http://localhost:3002
```

### Environment Setup
```bash
# Create environment file
cd packages/web-app
cp .env.example .env.local

# Edit environment variables
# ANTHROPIC_API_KEY=your_key_here  # Optional for real AI
# NODE_ENV=development
```

### Development Features
- **Hot Reload**: Automatic code reloading
- **Error Overlay**: Detailed error information
- **Mock Agent**: Built-in mock for testing
- **API Testing**: All endpoints available locally

## ☁️ Cloud Platform Deployment

### Vercel (Recommended)

**Why Vercel?**
- Built for Next.js applications
- Zero-configuration deployment
- Automatic HTTPS and CDN
- Environment variable management
- Preview deployments for branches

**Deployment Steps:**
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from project root
cd packages/web-app
vercel

# Follow interactive prompts:
# - Link to existing project or create new
# - Set environment variables
# - Deploy
```

**Environment Variables in Vercel:**
1. Go to Vercel dashboard → Project → Settings → Environment Variables
2. Add variables:
   ```
   ANTHROPIC_API_KEY=your_key_here
   NODE_ENV=production
   ```

**Custom Domain:**
1. In Vercel dashboard → Project → Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

### Netlify

**Deployment Steps:**
```bash
# Build application
cd packages/web-app
npm run build

# Deploy to Netlify (multiple options):

# Option 1: Drag and drop .next folder to Netlify

# Option 2: Netlify CLI
npm install -g netlify-cli
netlify deploy --dir=.next --prod

# Option 3: Git integration
# Connect GitHub repository to Netlify
# Set build command: npm run build
# Set publish directory: .next
```

**Netlify Configuration:**
Create `netlify.toml` in web-app directory:
```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_ENV = "production"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### AWS (Amazon Web Services)

#### AWS Amplify
```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify
amplify init

# Add hosting
amplify add hosting

# Deploy
amplify publish
```

#### AWS S3 + CloudFront
```bash
# Build application
npm run build

# Upload to S3 bucket
aws s3 sync .next s3://your-bucket-name

# Configure CloudFront distribution
# Point to S3 bucket with appropriate cache settings
```

### Google Cloud Platform

#### Google Cloud Run
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3002
CMD ["npm", "start"]
```

```bash
# Build and deploy
docker build -t ai-idp-web .
docker tag ai-idp-web gcr.io/PROJECT-ID/ai-idp-web
docker push gcr.io/PROJECT-ID/ai-idp-web

gcloud run deploy ai-idp-web \
  --image gcr.io/PROJECT-ID/ai-idp-web \
  --platform managed \
  --port 3002
```

### Microsoft Azure

#### Azure Static Web Apps
```bash
# Install Azure CLI
az login

# Create resource group
az group create --name ai-idp-rg --location eastus

# Deploy static web app
az staticwebapp create \
  --name ai-idp-web \
  --resource-group ai-idp-rg \
  --source https://github.com/your-repo \
  --location eastus \
  --branch main \
  --app-location "packages/web-app" \
  --output-location ".next"
```

## 🐳 Docker Deployment

### Dockerfile
```dockerfile
# packages/web-app/Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3002

ENV PORT 3002
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  ai-idp-web:
    build:
      context: ./packages/web-app
      dockerfile: Dockerfile
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    restart: unless-stopped

  # Optional: Add database, cache, etc.
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ai_idp
      POSTGRES_USER: ai_idp
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

### Docker Commands
```bash
# Build image
docker build -t ai-idp-web packages/web-app

# Run container
docker run -p 3002:3002 -e NODE_ENV=production ai-idp-web

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f ai-idp-web
```

## 🔧 Kubernetes Deployment

### Kubernetes Manifests

#### Deployment
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-idp-web
  labels:
    app: ai-idp-web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-idp-web
  template:
    metadata:
      labels:
        app: ai-idp-web
    spec:
      containers:
      - name: ai-idp-web
        image: ai-idp-web:latest
        ports:
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: "production"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-idp-secrets
              key: anthropic-api-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/agent
            port: 3002
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/agent
            port: 3002
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### Service
```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ai-idp-web-service
spec:
  selector:
    app: ai-idp-web
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3002
  type: ClusterIP
```

#### Ingress
```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ai-idp-web-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - ai-idp.yourdomain.com
    secretName: ai-idp-tls
  rules:
  - host: ai-idp.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ai-idp-web-service
            port:
              number: 80
```

#### Secrets
```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-idp-secrets
type: Opaque
data:
  anthropic-api-key: <base64-encoded-key>
```

### Deployment Commands
```bash
# Create namespace
kubectl create namespace ai-idp

# Apply secrets
kubectl apply -f k8s/secrets.yaml -n ai-idp

# Apply all manifests
kubectl apply -f k8s/ -n ai-idp

# Check deployment status
kubectl get pods -n ai-idp
kubectl get services -n ai-idp
kubectl get ingress -n ai-idp

# View logs
kubectl logs -f deployment/ai-idp-web -n ai-idp
```

## 🔐 Security Configuration

### Environment Variables
```bash
# Required for production
ANTHROPIC_API_KEY=your_key_here

# Optional security headers
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Database (if using)
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis (if using)
REDIS_URL=redis://host:6379
```

### Security Headers
Add to `next.config.ts`:
```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};
```

### HTTPS Configuration
- **Vercel/Netlify**: Automatic HTTPS
- **Custom Domain**: Use Let's Encrypt or commercial certificates
- **Load Balancer**: Configure SSL termination

## 📊 Monitoring & Observability

### Health Checks
The application provides health check endpoints:
```bash
# Health check
curl https://yourdomain.com/api/agent

# Expected response
{
  "status": "healthy",
  "timestamp": "2025-08-17T20:00:00.000Z",
  "agentReady": true,
  "modules": ["mock-agent"]
}
```

### Logging
- **Development**: Console logging with detailed errors
- **Production**: Structured JSON logging
- **External**: Integrate with logging services (Datadog, LogRocket, etc.)

### Performance Monitoring
- **Built-in**: Next.js Web Vitals
- **External**: Integrate with Vercel Analytics, Google Analytics
- **APM**: New Relic, Datadog APM

### Error Tracking
```bash
# Install Sentry (example)
npm install @sentry/nextjs

# Configure in next.config.js
const { withSentryConfig } = require('@sentry/nextjs');
```

## 🔄 CI/CD Pipeline

### GitHub Actions
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm install
    
    - name: Build application
      run: |
        cd packages/web-app
        npm run build
    
    - name: Deploy to Vercel
      uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.ORG_ID }}
        vercel-project-id: ${{ secrets.PROJECT_ID }}
        working-directory: packages/web-app
        vercel-args: '--prod'
```

### GitLab CI
```yaml
# .gitlab-ci.yml
stages:
  - build
  - deploy

build:
  stage: build
  image: node:20
  script:
    - npm install
    - cd packages/web-app
    - npm run build
  artifacts:
    paths:
      - packages/web-app/.next

deploy:
  stage: deploy
  script:
    - # Your deployment script
  only:
    - main
```

## 🚨 Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next

# Check Node.js version
node --version  # Should be 20+
```

#### Runtime Errors
```bash
# Check environment variables
echo $ANTHROPIC_API_KEY

# Check application logs
npm run dev  # Development mode for detailed errors
```

#### Performance Issues
```bash
# Analyze bundle size
npm run build
npx @next/bundle-analyzer

# Check for memory leaks
node --inspect npm run start
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Next.js debug mode
NODE_OPTIONS='--inspect' npm run dev
```

## 📞 Support

### Production Support
- **Health Monitoring**: Monitor `/api/agent` endpoint
- **Error Tracking**: Implement error reporting
- **Performance**: Monitor Web Vitals and Core metrics
- **Scaling**: Monitor resource usage and scale accordingly

### Backup & Recovery
- **Code**: Git repository with proper branching
- **Data**: If using database, implement backup strategy
- **Environment**: Document all environment variables and configurations

---

**Last Updated**: August 17, 2025  
**Version**: Phase 2 Complete  
**Status**: Production Ready ✅

For additional support, refer to:
- [Main Documentation](./DOCUMENTATION.md)
- [Technical Guide](./CLAUDE.md)
- [Web App Summary](./WEB_APP_SUMMARY.md)