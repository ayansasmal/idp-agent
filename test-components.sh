#!/bin/bash

# AI-IDP Component Testing Script
# Tests each component independently and integration scenarios

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
WEB_APP_URL="http://localhost:3002"

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
        if [ -n "$body" ] && [ "$body" != "null" ]; then
            echo "   Response: $(echo "$body" | jq -r '.message // .healthy // .success // "Response received"' 2>/dev/null || echo "Response received")"
        fi
    else
        error "$test_name (Expected: $expected_status, Got: $http_code)"
        if [ -n "$body" ]; then
            echo "   Error: $(echo "$body" | jq -r '.error // .message // .' 2>/dev/null || echo "$body")"
        fi
    fi
}

# Health check tests
test_health_checks() {
    echo -e "\n${YELLOW}🔍 Health Check Tests${NC}"
    echo "================================="
    
    test_endpoint "Meta Agent Health" "GET" "$META_AGENT_URL/health"
    test_endpoint "Infrastructure Agent Health" "GET" "$INFRASTRUCTURE_AGENT_URL/health" 
    test_endpoint "Web App Health" "GET" "$WEB_APP_URL/api/health" "" "200"
}

# Infrastructure Agent direct tests
test_infrastructure_agent_direct() {
    echo -e "\n${YELLOW}🏗️  Infrastructure Agent Direct Tests${NC}"
    echo "=========================================="
    
    test_endpoint "Infrastructure Capabilities" "GET" "$INFRASTRUCTURE_AGENT_URL/capabilities"
    
    # Test direct tool calls
    local deploy_data='{
        "resourceName": "test-nginx",
        "containerImage": "nginx:latest",
        "namespace": "default",
        "replicas": 1,
        "context": {
            "conversationId": "test-direct",
            "userId": "test-user",
            "sessionId": "test-session",
            "history": [],
            "metadata": {"source": "cli-test"}
        }
    }'
    
    test_endpoint "Deploy Application (Direct)" "POST" "$INFRASTRUCTURE_AGENT_URL/tools/deployApplication" "$deploy_data"
    
    local status_data='{
        "resourceName": "test-nginx",
        "namespace": "default", 
        "context": {
            "conversationId": "test-direct",
            "userId": "test-user",
            "sessionId": "test-session",
            "history": [],
            "metadata": {"source": "cli-test"}
        }
    }'
    
    test_endpoint "Get Resource Status (Direct)" "POST" "$INFRASTRUCTURE_AGENT_URL/tools/getResourceStatus" "$status_data"
    
    # Test scaling
    local scale_data='{
        "resourceName": "test-nginx",
        "replicas": 2,
        "namespace": "default",
        "context": {
            "conversationId": "test-direct",
            "userId": "test-user", 
            "sessionId": "test-session",
            "history": [],
            "metadata": {"source": "cli-test"}
        }
    }'
    
    test_endpoint "Scale Resource (Direct)" "POST" "$INFRASTRUCTURE_AGENT_URL/tools/scaleResource" "$scale_data"
}

# Meta Agent tests
test_meta_agent() {
    echo -e "\n${YELLOW}🧠 Meta Agent Tests${NC}"
    echo "========================"
    
    local simple_chat='{
        "userInput": "Hello, what can you help me with?",
        "context": {
            "conversationId": "test-meta-001",
            "userId": "test-user",
            "sessionId": "test-session", 
            "history": [],
            "metadata": {"source": "cli-test"}
        }
    }'
    
    test_endpoint "Simple Chat Request" "POST" "$META_AGENT_URL/chat" "$simple_chat"
    
    local infra_chat='{
        "userInput": "list pods in default namespace", 
        "context": {
            "conversationId": "test-meta-002",
            "userId": "test-user",
            "sessionId": "test-session",
            "history": [],
            "metadata": {"source": "cli-test"}
        }
    }'
    
    test_endpoint "Infrastructure Request via Meta Agent" "POST" "$META_AGENT_URL/chat" "$infra_chat"
    
    # Test approvals endpoint
    test_endpoint "Get Approvals" "GET" "$META_AGENT_URL/approvals"
}

# Integration tests
test_integration_scenarios() {
    echo -e "\n${YELLOW}🔗 Integration Test Scenarios${NC}"
    echo "===================================="
    
    # End-to-end deployment through Meta Agent
    local e2e_deploy='{
        "userInput": "deploy nginx with 2 replicas to default namespace",
        "context": {
            "conversationId": "test-e2e-001", 
            "userId": "test-user",
            "sessionId": "test-session",
            "history": [],
            "metadata": {"source": "cli-integration-test"}
        }
    }'
    
    test_endpoint "E2E Deployment Flow" "POST" "$META_AGENT_URL/chat" "$e2e_deploy"
    
    # Status check through Meta Agent
    local e2e_status='{
        "userInput": "show me the status of nginx deployment",
        "context": {
            "conversationId": "test-e2e-002",
            "userId": "test-user", 
            "sessionId": "test-session",
            "history": [],
            "metadata": {"source": "cli-integration-test"}
        }
    }'
    
    test_endpoint "E2E Status Check" "POST" "$META_AGENT_URL/chat" "$e2e_status"
}

# Kubernetes direct validation
test_kubernetes_validation() {
    echo -e "\n${YELLOW}☸️  Kubernetes Validation Tests${NC}"
    echo "===================================="
    
    log "Checking Kubernetes cluster connectivity"
    if kubectl cluster-info >/dev/null 2>&1; then
        success "Kubernetes cluster is accessible"
        
        log "Checking for test deployments"
        if kubectl get deployment test-nginx -n default >/dev/null 2>&1; then
            success "Test deployment 'test-nginx' exists"
            kubectl get deployment test-nginx -n default -o wide
        else
            warning "Test deployment 'test-nginx' not found (this is expected for first run)"
        fi
        
        log "Listing all deployments in default namespace"
        kubectl get deployments -n default
        
    else
        error "Kubernetes cluster not accessible"
    fi
}

# Cleanup test resources
cleanup_test_resources() {
    echo -e "\n${YELLOW}🧹 Cleanup Test Resources${NC}"
    echo "=============================="
    
    log "Cleaning up test deployments"
    if kubectl delete deployment test-nginx -n default >/dev/null 2>&1; then
        success "Deleted test deployment 'test-nginx'"
    else
        warning "Test deployment 'test-nginx' not found or already deleted"
    fi
    
    if kubectl delete service test-nginx -n default >/dev/null 2>&1; then
        success "Deleted test service 'test-nginx'"
    else
        warning "Test service 'test-nginx' not found or already deleted"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║         AI-IDP Component Test Suite            ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
    
    log "Starting comprehensive component tests..."
    
    # Check if services are running
    log "Checking service availability..."
    if ! curl -s "$META_AGENT_URL/health" >/dev/null 2>&1; then
        warning "Meta Agent not accessible at $META_AGENT_URL"
    fi
    
    if ! curl -s "$INFRASTRUCTURE_AGENT_URL/health" >/dev/null 2>&1; then
        warning "Infrastructure Agent not accessible at $INFRASTRUCTURE_AGENT_URL"
    fi
    
    # Run test suites
    test_health_checks
    test_infrastructure_agent_direct
    test_meta_agent
    test_integration_scenarios
    test_kubernetes_validation
    
    # Show results
    echo -e "\n${BLUE}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                Test Results                    ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
    
    echo -e "Total Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}💥 Some tests failed. Check the output above for details.${NC}"
        exit 1
    fi
}

# Parse command line arguments
case "${1:-}" in
    "health")
        test_health_checks
        ;;
    "infrastructure")
        test_infrastructure_agent_direct
        ;;
    "meta")
        test_meta_agent
        ;;
    "integration")
        test_integration_scenarios
        ;;
    "k8s")
        test_kubernetes_validation
        ;; 
    "cleanup")
        cleanup_test_resources
        ;;
    *)
        main
        ;;
esac