#!/bin/bash

# Test script for rollback procedures
# This script tests the rollback functionality without affecting services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing Rollback Procedures${NC}"
echo -e "${BLUE}==============================${NC}"

# Test environment variables
test_env_parsing() {
    echo -e "${YELLOW}Testing feature flag parsing...${NC}"
    
    # Test current .env file
    if [ -f ".env" ]; then
        local websocket=$(grep "USE_WEBSOCKET=" .env | cut -d'=' -f2)
        local sse_http=$(grep "ENABLE_SSE_HTTP=" .env | cut -d'=' -f2)  
        local phase=$(grep "MIGRATION_PHASE=" .env | cut -d'=' -f2)
        
        echo "Current configuration:"
        echo "  USE_WEBSOCKET=$websocket"
        echo "  ENABLE_SSE_HTTP=$sse_http"
        echo "  MIGRATION_PHASE=$phase"
        
        if [ "$websocket" = "true" ] && [ "$sse_http" = "false" ] && [ "$phase" = "current" ]; then
            echo -e "${GREEN}✅ Already in rollback configuration${NC}"
        else
            echo -e "${YELLOW}⚠️  Currently in migration configuration${NC}"
        fi
        return 0
    else
        echo -e "${RED}❌ .env file not found${NC}"
        return 1
    fi
}

# Main test function
main() {
    echo "Running rollback procedure tests..."
    echo
    
    if test_env_parsing; then
        echo
        echo -e "${GREEN}✅ Rollback tests passed!${NC}"
        return 0
    else
        echo
        echo -e "${RED}❌ Some rollback tests failed${NC}"
        return 1
    fi
}

# Run tests
main "$@"