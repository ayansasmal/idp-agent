#!/bin/bash

# MCP Registration Test Script
# Tests the specific MCP registration handshake between Meta Agent and Infrastructure Agent

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service URLs
META_AGENT_URL="http://localhost:3000"
INFRASTRUCTURE_AGENT_URL="http://localhost:3003"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_TESTS++))
}

error() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED_TESTS++))
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Test function wrapper
test_endpoint() {
    ((TOTAL_TESTS++))
    local test_name="$1"
    local method="$2" 
    local url="$3"
    local data="$4"
    local expected_status="${5:-200}"
    
    log "Testing: $test_name"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    fi
    
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed -E 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$http_code" = "$expected_status" ]; then
        success "$test_name (Status: $http_code)"
        echo "   $body" | head -3
        return 0
    else
        error "$test_name (Expected: $expected_status, Got: $http_code)"
        if [ -n "$body" ]; then
            echo "   Error: $body" | head -2
        fi
        return 1
    fi
}

# Check if both services are running
check_services() {
    echo -e "\n${YELLOW}🔍 Service Availability Check${NC}"
    echo "=================================="
    
    local meta_running=false
    local infra_running=false
    
    if curl -s "$META_AGENT_URL/health" >/dev/null 2>&1; then
        success "Meta Agent is running (port 3000)"
        meta_running=true
    else
        error "Meta Agent not accessible at $META_AGENT_URL"
    fi
    
    if curl -s "$INFRASTRUCTURE_AGENT_URL/health" >/dev/null 2>&1; then
        success "Infrastructure Agent is running (port 3003)"
        infra_running=true
    else
        error "Infrastructure Agent not accessible at $INFRASTRUCTURE_AGENT_URL"
    fi
    
    if [ "$meta_running" = false ] || [ "$infra_running" = false ]; then
        echo -e "\n${RED}💥 Services not running. Please start them first:${NC}"
        echo "npm run dev"
        exit 1
    fi
}

# Test MCP registration status
test_registration_status() {
    echo -e "\n${YELLOW}🔍 MCP Registration Status${NC}"
    echo "===================================="
    
    log "Checking Meta Agent health for registered agents"
    response=$(curl -s "$META_AGENT_URL/health" | jq '.')
    
    if [ $? -eq 0 ]; then
        registered_agents=$(echo "$response" | jq -r '.metaAgent.registeredAgents // 0')
        healthy_agents=$(echo "$response" | jq -r '.mcp.healthyAgents // 0')
        focused_agents=$(echo "$response" | jq -r '.focusedAgents | length' 2>/dev/null || echo "0")
        
        echo "   Registered Agents: $registered_agents"
        echo "   Healthy MCP Agents: $healthy_agents"
        echo "   Focused Agents: $focused_agents"
        
        if [ "$registered_agents" -gt 0 ] && [ "$healthy_agents" -gt 0 ]; then
            success "MCP Registration Status: Agents registered and healthy"
            return 0
        else
            error "MCP Registration Status: No agents registered (This is the bug!)"
            return 1
        fi
    else
        error "Failed to get Meta Agent health status"
        return 1
    fi
}

# Test Infrastructure Agent availability to Meta Agent
test_infrastructure_visibility() {
    echo -e "\n${YELLOW}🔍 Infrastructure Agent Visibility${NC}"
    echo "========================================"
    
    # Test direct health check
    test_endpoint "Infrastructure Agent Health (Direct)" "GET" "$INFRASTRUCTURE_AGENT_URL/health"
    
    # Test capabilities endpoint
    test_endpoint "Infrastructure Agent Capabilities" "GET" "$INFRASTRUCTURE_AGENT_URL/capabilities"
    
    # Test MCP endpoint availability
    log "Testing MCP endpoint availability"
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$INFRASTRUCTURE_AGENT_URL/mcp" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [ "$http_code" = "200" ]; then
        success "MCP endpoint is accessible"
    else
        error "MCP endpoint not accessible (Status: $http_code)"
    fi
}

# Test the exact registration handshake
test_mcp_handshake() {
    echo -e "\n${YELLOW}🤝 MCP Registration Handshake Test${NC}"
    echo "======================================="
    
    log "Step 1: Testing SSE connection to Infrastructure Agent MCP endpoint"
    # Test SSE connection (this simulates what Meta Agent does)
    timeout 5s curl -s -H "Accept: text/event-stream" "$INFRASTRUCTURE_AGENT_URL/mcp" > /tmp/sse_test.log 2>&1 &
    sleep 2
    
    if [ -s /tmp/sse_test.log ]; then
        success "SSE connection established (logs written to /tmp/sse_test.log)"
        echo "   SSE data: $(head -1 /tmp/sse_test.log)"
    else
        error "SSE connection failed - no data received"
    fi
    
    log "Step 2: Testing MCP tools/list request"
    mcp_request='{
        "jsonrpc": "2.0",
        "method": "tools/list",
        "id": "test-registration-001"
    }'
    
    if test_endpoint "MCP tools/list Request" "POST" "$INFRASTRUCTURE_AGENT_URL/mcp" "$mcp_request"; then
        log "MCP handshake communication is working"
    else
        error "MCP handshake failed at tools/list step"
    fi
}

# Test the actual failure: Meta Agent trying to use Infrastructure Agent
test_end_to_end_failure() {
    echo -e "\n${YELLOW}🚨 End-to-End Failure Replication${NC}"
    echo "====================================="
    
    log "Testing the exact failure scenario"
    
    chat_request='{
        "userInput": "deploy test-app with nginx:latest image",
        "context": {
            "conversationId": "test-registration-failure",
            "userId": "test-user",
            "sessionId": "test-session",
            "history": [],
            "metadata": {
                "source": "mcp-registration-test"
            }
        }
    }'
    
    log "Sending deployment request through Meta Agent"
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST -H "Content-Type: application/json" -d "$chat_request" "$META_AGENT_URL/chat" 2>/dev/null || echo "HTTPSTATUS:000")
    
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed -E 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$http_code" = "200" ]; then
        success_status=$(echo "$body" | jq -r '.success // false')
        message=$(echo "$body" | jq -r '.message // "No message"')
        
        echo "   Response: $message"
        
        if [ "$success_status" = "true" ]; then
            success "🎉 END-TO-END SUCCESS! MCP registration is working"
            return 0
        else
            if [[ "$message" == *"No agent registered for"* ]]; then
                error "🚨 CONFIRMED BUG: $message"
                warning "This is the exact MCP registration failure we need to fix"
            else
                warning "Different error: $message"
            fi
            return 1
        fi
    else
        error "Meta Agent request failed (Status: $http_code)"
        echo "   Error: $body"
        return 1
    fi
}

# Test direct Infrastructure Agent as control
test_direct_infrastructure_control() {
    echo -e "\n${YELLOW}✅ Direct Infrastructure Agent Test (Control)${NC}"
    echo "================================================"
    
    log "Testing direct Infrastructure Agent call to prove it works"
    
    direct_request='{
        "resourceName": "test-mcp-nginx",
        "containerImage": "nginx:latest",
        "namespace": "default",
        "replicas": 1,
        "context": {
            "conversationId": "test-mcp-direct",
            "userId": "test-user",
            "sessionId": "test-session",
            "history": [],
            "metadata": {"source": "mcp-test-direct"}
        }
    }'
    
    if test_endpoint "Direct Infrastructure Agent Call" "POST" "$INFRASTRUCTURE_AGENT_URL/tools/deployApplication" "$direct_request"; then
        log "✅ Control test passed - Infrastructure Agent works perfectly"
        log "The issue is definitely in MCP registration, not Infrastructure Agent functionality"
    else
        warning "Control test failed - there might be other issues too"
    fi
}

# Cleanup test resources
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleanup${NC}"
    echo "============"
    
    log "Cleaning up test deployments"
    kubectl delete deployment test-mcp-nginx -n default >/dev/null 2>&1 && success "Cleaned up test-mcp-nginx deployment" || warning "test-mcp-nginx deployment not found"
    kubectl delete service test-mcp-nginx -n default >/dev/null 2>&1 && success "Cleaned up test-mcp-nginx service" || warning "test-mcp-nginx service not found"
    
    rm -f /tmp/sse_test.log
}

# Main test execution
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           MCP Registration Test Suite          ║${NC}"
    echo -e "${BLUE}║         Replicates Registration Failure       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
    
    log "Testing MCP registration between Meta Agent and Infrastructure Agent"
    
    # Run test suite
    check_services
    test_infrastructure_visibility
    test_mcp_handshake
    test_registration_status
    test_end_to_end_failure
    test_direct_infrastructure_control
    
    # Show results
    echo -e "\n${BLUE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                Test Results                    ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
    
    echo -e "Total Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
    
    echo -e "\n${YELLOW}📋 Summary:${NC}"
    if [ $FAILED_TESTS -gt 0 ]; then
        echo -e "${RED}🚨 MCP Registration is broken${NC}"
        echo -e "Expected failure: Meta Agent cannot route to Infrastructure Agent"
        echo -e "Root cause: Agent registration handshake incomplete"
        echo -e "\nNext steps:"
        echo -e "1. Debug Meta Agent MCP registration logic"
        echo -e "2. Check MCP protocol implementation"
        echo -e "3. Add logging to pinpoint exact failure"
        exit 1
    else
        echo -e "${GREEN}🎉 MCP Registration is working!${NC}"
        echo -e "All tests passed - the bug has been fixed!"
        exit 0
    fi
}

# Parse command line arguments
case "${1:-}" in
    "services")
        check_services
        ;;
    "registration")
        test_registration_status
        ;;
    "handshake")
        test_mcp_handshake
        ;;
    "failure")
        test_end_to_end_failure
        ;;
    "direct")
        test_direct_infrastructure_control
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        main
        ;;
esac