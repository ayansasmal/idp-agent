#!/bin/bash

# AI-IDP Migration Monitoring Dashboard
# Real-time monitoring for WebSocket to SSE+HTTP migration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REFRESH_INTERVAL=5
LOG_FILE="logs/migration-metrics.log"
METRICS_FILE="logs/migration-metrics.json"

echo -e "${BLUE}🔍 AI-IDP Migration Monitoring Dashboard${NC}"
echo -e "${BLUE}=======================================${NC}"

# Ensure logs directory exists
mkdir -p logs

# Function to get service health
get_service_health() {
    local port=$1
    local name=$2
    
    local response=$(curl -s -w "%{http_code}" "http://localhost:$port/health" 2>/dev/null || echo "000")
    local http_code=${response: -3}
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ $name${NC}"
    else
        echo -e "${RED}❌ $name${NC}"
    fi
}

# Function to get connection counts
get_connection_count() {
    local port=$1
    # This would need to be implemented in each service
    # For now, return a placeholder
    echo "0"
}

# Function to get metrics from services
collect_metrics() {
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    
    # Collect from each service (placeholder implementation)
    local meta_agent_metrics="{\"connections\": $(get_connection_count 3000), \"method\": \"websocket\"}"
    local infra_agent_metrics="{\"connections\": $(get_connection_count 3003), \"method\": \"mcp\"}"
    local web_app_metrics="{\"connections\": $(get_connection_count 3002), \"method\": \"websocket\"}"
    
    # Create metrics JSON
    cat > "$METRICS_FILE" << EOF
{
  "timestamp": "$timestamp",
  "services": {
    "meta_agent": $meta_agent_metrics,
    "infrastructure_agent": $infra_agent_metrics,
    "web_app": $web_app_metrics
  },
  "migration_phase": "$(grep MIGRATION_PHASE .env | cut -d'=' -f2)",
  "websocket_enabled": "$(grep USE_WEBSOCKET .env | cut -d'=' -f2)",
  "sse_http_enabled": "$(grep ENABLE_SSE_HTTP .env | cut -d'=' -f2)"
}
EOF
    
    # Append to log file
    echo "$timestamp - $(cat "$METRICS_FILE")" >> "$LOG_FILE"
}

# Function to display dashboard
display_dashboard() {
    clear
    echo -e "${BLUE}🔍 AI-IDP Migration Monitoring Dashboard${NC}"
    echo -e "${BLUE}=======================================${NC}"
    echo -e "$(date) | Refresh: ${REFRESH_INTERVAL}s | Ctrl+C to exit"
    echo

    # Service Health Status
    echo -e "${CYAN}📊 Service Health Status${NC}"
    echo -e "${CYAN}------------------------${NC}"
    get_service_health "3000" "Meta-Agent        (port 3000)"
    get_service_health "3003" "Infrastructure    (port 3003)"
    get_service_health "3005" "Observability     (port 3005)"
    get_service_health "3002" "Web Application   (port 3002)"
    echo

    # Feature Flags Status
    echo -e "${CYAN}🏗️  Feature Flags Configuration${NC}"
    echo -e "${CYAN}-------------------------------${NC}"
    local websocket=$(grep "USE_WEBSOCKET=" .env 2>/dev/null | cut -d'=' -f2 | head -1)
    local sse_http=$(grep "ENABLE_SSE_HTTP=" .env 2>/dev/null | cut -d'=' -f2 | head -1) 
    local phase=$(grep "MIGRATION_PHASE=" .env 2>/dev/null | cut -d'=' -f2 | head -1)
    
    if [ "$websocket" = "true" ]; then
        echo -e "WebSocket:        ${GREEN}✅ Enabled${NC}"
    else
        echo -e "WebSocket:        ${RED}❌ Disabled${NC}"
    fi
    
    if [ "$sse_http" = "true" ]; then
        echo -e "SSE + HTTP:       ${GREEN}✅ Enabled${NC}"
    else
        echo -e "SSE + HTTP:       ${RED}❌ Disabled${NC}"
    fi
    
    echo -e "Migration Phase:  ${YELLOW}$phase${NC}"
    echo

    # Architecture Status
    echo -e "${CYAN}🏗️  Current Architecture${NC}"
    echo -e "${CYAN}------------------------${NC}"
    case "$phase" in
        "current")
            echo -e "Architecture:     ${GREEN}WebSocket Only${NC}"
            echo -e "Status:           ${GREEN}Stable${NC}"
            ;;
        "testing")
            echo -e "Architecture:     ${YELLOW}Hybrid (WebSocket + SSE+HTTP)${NC}"
            echo -e "Status:           ${YELLOW}Testing Phase${NC}"
            ;;
        "production")
            echo -e "Architecture:     ${GREEN}SSE + HTTP${NC}"
            echo -e "Status:           ${GREEN}Production${NC}"
            ;;
        *)
            echo -e "Architecture:     ${RED}Unknown${NC}"
            echo -e "Status:           ${RED}Check Configuration${NC}"
            ;;
    esac
    echo

    # Connection Statistics (placeholder - would need real implementation)
    echo -e "${CYAN}📈 Connection Statistics${NC}"
    echo -e "${CYAN}------------------------${NC}"
    if [ -f "$METRICS_FILE" ]; then
        echo "Last Updated:     $(grep timestamp "$METRICS_FILE" | cut -d'"' -f4)"
        echo "WebSocket Conns:  N/A (implementation needed)"
        echo "SSE+HTTP Conns:   N/A (implementation needed)"
        echo "Total Messages:   N/A (implementation needed)"
        echo "Error Rate:       N/A (implementation needed)"
    else
        echo "No metrics available yet..."
    fi
    echo

    # Recent Logs
    echo -e "${CYAN}📝 Recent Activity${NC}"
    echo -e "${CYAN}------------------${NC}"
    if [ -f "$LOG_FILE" ]; then
        tail -5 "$LOG_FILE" | while read line; do
            echo -e "${YELLOW}• $(echo "$line" | cut -d' ' -f1-2)${NC} - Activity logged"
        done
    else
        echo "No activity logs yet..."
    fi
    echo

    # Quick Actions
    echo -e "${CYAN}⚡ Quick Actions${NC}"
    echo -e "${CYAN}----------------${NC}"
    echo -e "${YELLOW}r${NC} - Refresh now"
    echo -e "${YELLOW}b${NC} - View backup status"  
    echo -e "${YELLOW}l${NC} - View logs"
    echo -e "${YELLOW}m${NC} - Export metrics"
    echo -e "${YELLOW}q${NC} - Quit"
    echo
}

# Function to show backup status
show_backup_status() {
    echo -e "${BLUE}📦 Backup Status${NC}"
    echo -e "${BLUE}================${NC}"
    
    if [ -d "backups" ]; then
        echo "Available backups:"
        ls -la backups/ | grep -E "websocket-stable|rollback" | while read backup; do
            echo "  • $backup"
        done
        echo
        
        if [ -f "scripts/rollback-websocket.sh" ]; then
            echo -e "${GREEN}✅ Rollback script available${NC}: ./scripts/rollback-websocket.sh"
        else
            echo -e "${RED}❌ Rollback script not found${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No backups directory found${NC}"
    fi
    
    echo
    echo "Press any key to return..."
    read -n 1
}

# Function to view logs
view_logs() {
    echo -e "${BLUE}📋 Recent Logs${NC}"
    echo -e "${BLUE}===============${NC}"
    
    if [ -f "$LOG_FILE" ]; then
        tail -20 "$LOG_FILE"
    else
        echo "No logs available yet."
    fi
    
    echo
    echo "Press any key to return..."
    read -n 1
}

# Function to export metrics
export_metrics() {
    local export_file="migration-metrics-$(date +%Y%m%d_%H%M%S).json"
    
    if [ -f "$METRICS_FILE" ]; then
        cp "$METRICS_FILE" "$export_file"
        echo -e "${GREEN}✅ Metrics exported to: $export_file${NC}"
    else
        echo -e "${RED}❌ No metrics file found${NC}"
    fi
    
    echo "Press any key to return..."
    read -n 1
}

# Main monitoring loop
main() {
    # Handle interruption
    trap 'echo -e "\n${YELLOW}Monitoring stopped by user${NC}"; exit 0' INT
    
    echo -e "${GREEN}Starting migration monitoring...${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop monitoring${NC}"
    sleep 2
    
    while true; do
        # Collect current metrics
        collect_metrics
        
        # Display dashboard
        display_dashboard
        
        # Check for user input (non-blocking)
        read -t $REFRESH_INTERVAL -n 1 key || true
        
        case "$key" in
            r|R)
                # Force refresh
                continue
                ;;
            b|B)
                show_backup_status
                ;;
            l|L)
                view_logs
                ;;
            m|M)
                export_metrics
                ;;
            q|Q)
                echo -e "\n${GREEN}Monitoring stopped${NC}"
                exit 0
                ;;
        esac
    done
}

# Show usage if help requested
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  --interval N   Set refresh interval in seconds (default: 5)"
    echo
    echo "Interactive Commands:"
    echo "  r - Refresh now"
    echo "  b - View backup status"
    echo "  l - View logs"
    echo "  m - Export metrics"
    echo "  q - Quit"
    exit 0
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --interval)
            REFRESH_INTERVAL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Start monitoring
main