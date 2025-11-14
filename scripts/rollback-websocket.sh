#!/bin/bash

# AI-IDP Communication Architecture Rollback Script
# This script provides immediate rollback to WebSocket communication

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 AI-IDP Communication Architecture Rollback${NC}"
echo -e "${BLUE}================================================${NC}"

# Function to rollback environment variables
rollback_env_variables() {
    echo -e "${YELLOW}🔄 Rolling back to WebSocket configuration...${NC}"
    
    if [ -f ".env" ]; then
        # Update feature flags to rollback state
        sed -i.rollback "s/^USE_WEBSOCKET=.*/USE_WEBSOCKET=true/" .env
        sed -i.rollback "s/^ENABLE_SSE_HTTP=.*/ENABLE_SSE_HTTP=false/" .env
        sed -i.rollback "s/^MIGRATION_PHASE=.*/MIGRATION_PHASE=current/" .env
        
        echo -e "${GREEN}✅ Environment variables rolled back${NC}"
        echo -e "   USE_WEBSOCKET=true"
        echo -e "   ENABLE_SSE_HTTP=false" 
        echo -e "   MIGRATION_PHASE=current"
    else
        echo -e "${RED}ERROR: .env file not found!${NC}"
        exit 1
    fi
}

# Function to validate rollback
validate_rollback() {
    echo -e "${YELLOW}🔍 Validating rollback configuration...${NC}"
    
    if ! grep -q "USE_WEBSOCKET=true" .env; then
        echo -e "${RED}ERROR: USE_WEBSOCKET not set to true${NC}"
        return 1
    fi
    
    if ! grep -q "ENABLE_SSE_HTTP=false" .env; then
        echo -e "${RED}ERROR: ENABLE_SSE_HTTP not set to false${NC}"
        return 1
    fi
    
    if ! grep -q "MIGRATION_PHASE=current" .env; then
        echo -e "${RED}ERROR: MIGRATION_PHASE not set to current${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Rollback configuration validated${NC}"
}

# Main rollback procedure
main() {
    echo -e "${YELLOW}⚠️  This will rollback to WebSocket communication${NC}"
    echo
    
    # Confirmation prompt
    read -p "Continue with rollback? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Rollback cancelled by user${NC}"
        exit 0
    fi
    
    rollback_env_variables
    validate_rollback
    
    echo
    echo -e "${GREEN}✅ Rollback completed successfully!${NC}"
    echo -e "${YELLOW}Please restart services to apply changes${NC}"
}

# Run main function
main "$@"