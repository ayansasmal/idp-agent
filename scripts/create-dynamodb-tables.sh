#!/bin/bash

# Script to create DynamoDB tables for AI-IDP using awslocal (LocalStack)
# This script supports both local development and production environments

set -e

# Load environment variables
if [ -f .env ]; then
  # Remove lines starting with # and remove inline comments after variables
  export $(cat .env | grep -v '^#' | sed 's/#.*//' | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | xargs)
fi

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ENDPOINT=${AWS_ENDPOINT:-http://localhost:4566}
APPROVALS_TABLE_NAME=${APPROVALS_TABLE_NAME:-ai-idp-approvals}
CHAT_SESSIONS_TABLE_NAME=${CHAT_SESSIONS_TABLE_NAME:-ai-idp-chat-sessions}
ACTION_TRACKING_TABLE_NAME=${ACTION_TRACKING_TABLE_NAME:-ai-idp-action-tracking}

# Use awslocal for local development, aws for production
if [ "${NODE_ENV}" = "production" ]; then
  AWS_CMD="aws"
  echo "🌍 Creating DynamoDB tables in PRODUCTION environment"
else
  AWS_CMD="awslocal"
  echo "🏠 Creating DynamoDB tables in LOCAL development environment"
fi

echo "📋 Configuration:"
echo "  - AWS Region: ${AWS_REGION}"
echo "  - AWS Endpoint: ${AWS_ENDPOINT}"
echo "  - Approvals Table: ${APPROVALS_TABLE_NAME}"
echo "  - Chat Sessions Table: ${CHAT_SESSIONS_TABLE_NAME}"
echo "  - Action Tracking Table: ${ACTION_TRACKING_TABLE_NAME}"
echo ""

# Function to check if table exists
table_exists() {
  local table_name=$1
  if $AWS_CMD dynamodb describe-table --table-name "${table_name}" --region "${AWS_REGION}" --endpoint-url "${AWS_ENDPOINT}" >/dev/null 2>&1; then
    return 0  # Table exists
  else
    return 1  # Table does not exist
  fi
}

# Function to create approval table
create_approvals_table() {
  echo "🔄 Checking approvals table: ${APPROVALS_TABLE_NAME}"
  
  # Check if table already exists
  if table_exists "${APPROVALS_TABLE_NAME}"; then
    echo "✅ Table ${APPROVALS_TABLE_NAME} already exists, skipping creation"
    return 0
  fi

  echo "📝 Creating approvals table: ${APPROVALS_TABLE_NAME}"
  
  # Create the table
  $AWS_CMD dynamodb create-table \
    --table-name "${APPROVALS_TABLE_NAME}" \
    --attribute-definitions \
      AttributeName=id,AttributeType=S \
      AttributeName=status,AttributeType=S \
      AttributeName=createdAt,AttributeType=S \
      AttributeName=userId,AttributeType=S \
    --key-schema \
      AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
      IndexName=StatusIndex,KeySchema="[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]",Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=5,WriteCapacityUnits=5}" \
      IndexName=UserIndex,KeySchema="[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}]",Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=5,WriteCapacityUnits=5}" \
    --provisioned-throughput \
      ReadCapacityUnits=10,WriteCapacityUnits=10 \
    --region "${AWS_REGION}" \
    --endpoint-url "${AWS_ENDPOINT}"

  if [ $? -eq 0 ]; then
    echo "✅ Table ${APPROVALS_TABLE_NAME} created successfully"
  else
    echo "❌ Failed to create table ${APPROVALS_TABLE_NAME}"
    return 1
  fi
}

# Function to create chat sessions table
create_chat_sessions_table() {
  echo "🔄 Checking chat sessions table: ${CHAT_SESSIONS_TABLE_NAME}"
  
  # Check if table already exists
  if table_exists "${CHAT_SESSIONS_TABLE_NAME}"; then
    echo "✅ Table ${CHAT_SESSIONS_TABLE_NAME} already exists, skipping creation"
    return 0
  fi

  echo "📝 Creating chat sessions table: ${CHAT_SESSIONS_TABLE_NAME}"

  # Create the table with proper schema for persistent chat sessions
  $AWS_CMD dynamodb create-table \
    --table-name "${CHAT_SESSIONS_TABLE_NAME}" \
    --attribute-definitions \
      AttributeName=sessionId,AttributeType=S \
      AttributeName=userId,AttributeType=S \
      AttributeName=lastActivity,AttributeType=S \
    --key-schema \
      AttributeName=sessionId,KeyType=HASH \
    --global-secondary-indexes \
      IndexName=UserIndex,KeySchema="[{AttributeName=userId,KeyType=HASH},{AttributeName=lastActivity,KeyType=RANGE}]",Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=5,WriteCapacityUnits=5}" \
    --provisioned-throughput \
      ReadCapacityUnits=10,WriteCapacityUnits=10 \
    --region "${AWS_REGION}" \
    --endpoint-url "${AWS_ENDPOINT}"

  if [ $? -eq 0 ]; then
    echo "✅ Table ${CHAT_SESSIONS_TABLE_NAME} created successfully"
    
    # Enable TTL for automatic cleanup of old sessions
    echo "⏰ Enabling TTL for automatic session cleanup..."
    $AWS_CMD dynamodb update-time-to-live \
      --table-name "${CHAT_SESSIONS_TABLE_NAME}" \
      --time-to-live-specification Enabled=true,AttributeName=ttl \
      --region "${AWS_REGION}" \
      --endpoint-url "${AWS_ENDPOINT}" >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
      echo "✅ TTL enabled for ${CHAT_SESSIONS_TABLE_NAME}"
    else
      echo "⚠️  Warning: Failed to enable TTL for ${CHAT_SESSIONS_TABLE_NAME}"
    fi
  else
    echo "❌ Failed to create table ${CHAT_SESSIONS_TABLE_NAME}"
    return 1
  fi
}

# Create action tracking table for distributed action management
create_action_tracking_table() {
  echo "🔄 Checking action tracking table: ${ACTION_TRACKING_TABLE_NAME}"
  
  # Check if table already exists
  if table_exists "${ACTION_TRACKING_TABLE_NAME}"; then
    echo "✅ Table ${ACTION_TRACKING_TABLE_NAME} already exists, skipping creation"
    return 0
  fi

  echo "📝 Creating action tracking table: ${ACTION_TRACKING_TABLE_NAME}"

  # Create the table with proper schema for distributed action tracking
  $AWS_CMD dynamodb create-table \
    --table-name "${ACTION_TRACKING_TABLE_NAME}" \
    --attribute-definitions \
      AttributeName=actionId,AttributeType=S \
      AttributeName=sessionId,AttributeType=S \
      AttributeName=userId,AttributeType=S \
      AttributeName=status,AttributeType=S \
      AttributeName=agentName,AttributeType=S \
      AttributeName=startTime,AttributeType=S \
    --key-schema \
      AttributeName=actionId,KeyType=HASH \
    --global-secondary-indexes \
      IndexName=SessionIndex,KeySchema="[{AttributeName=sessionId,KeyType=HASH},{AttributeName=startTime,KeyType=RANGE}]",Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=5,WriteCapacityUnits=5}" \
      IndexName=UserIndex,KeySchema="[{AttributeName=userId,KeyType=HASH},{AttributeName=startTime,KeyType=RANGE}]",Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=5,WriteCapacityUnits=5}" \
      IndexName=StatusIndex,KeySchema="[{AttributeName=status,KeyType=HASH},{AttributeName=startTime,KeyType=RANGE}]",Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=5,WriteCapacityUnits=5}" \
      IndexName=AgentIndex,KeySchema="[{AttributeName=agentName,KeyType=HASH},{AttributeName=startTime,KeyType=RANGE}]",Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=5,WriteCapacityUnits=5}" \
    --provisioned-throughput \
      ReadCapacityUnits=10,WriteCapacityUnits=10 \
    --region "${AWS_REGION}" \
    --endpoint-url "${AWS_ENDPOINT}"

  if [ $? -eq 0 ]; then
    echo "✅ Table ${ACTION_TRACKING_TABLE_NAME} created successfully"
    
    # Enable TTL for automatic cleanup of old actions
    echo "⏰ Enabling TTL for automatic action cleanup..."
    $AWS_CMD dynamodb update-time-to-live \
      --table-name "${ACTION_TRACKING_TABLE_NAME}" \
      --time-to-live-specification Enabled=true,AttributeName=ttl \
      --region "${AWS_REGION}" \
      --endpoint-url "${AWS_ENDPOINT}" >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
      echo "✅ TTL enabled for ${ACTION_TRACKING_TABLE_NAME}"
    else
      echo "⚠️  Warning: Failed to enable TTL for ${ACTION_TRACKING_TABLE_NAME}"
    fi
  else
    echo "❌ Failed to create table ${ACTION_TRACKING_TABLE_NAME}"
    return 1
  fi
}

# Function to wait for table to be active
wait_for_table() {
  local table_name=$1
  
  # Skip waiting if table already exists and is active
  if table_exists "${table_name}"; then
    local status=$($AWS_CMD dynamodb describe-table --table-name "${table_name}" --region "${AWS_REGION}" --endpoint-url "${AWS_ENDPOINT}" --query 'Table.TableStatus' --output text 2>/dev/null)
    
    if [ "$status" = "ACTIVE" ]; then
      echo "✅ Table ${table_name} is already active"
      return 0
    fi
  fi
  
  echo "⏳ Waiting for table ${table_name} to become active..."
  
  local max_attempts=30  # Maximum 60 seconds wait
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    status=$($AWS_CMD dynamodb describe-table --table-name "${table_name}" --region "${AWS_REGION}" --endpoint-url "${AWS_ENDPOINT}" --query 'Table.TableStatus' --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$status" = "ACTIVE" ]; then
      echo "✅ Table ${table_name} is now active"
      return 0
    elif [ "$status" = "NOT_FOUND" ]; then
      echo "❌ Table ${table_name} not found"
      return 1
    else
      echo "   Status: ${status} - waiting... (attempt $((attempt + 1))/${max_attempts})"
      sleep 2
      attempt=$((attempt + 1))
    fi
  done
  
  echo "❌ Timeout waiting for table ${table_name} to become active"
  return 1
}

# Function to seed test data (development only)
seed_test_data() {
  if [ "${NODE_ENV}" = "production" ]; then
    echo "🚫 Skipping test data seeding in production"
    return 0
  fi

  echo "🌱 Checking if test data needs to be seeded..."
  
  # Check if test data already exists
  local test_item=$($AWS_CMD dynamodb get-item \
    --table-name "${APPROVALS_TABLE_NAME}" \
    --key '{"id": {"S": "approval-test-123"}}' \
    --region "${AWS_REGION}" \
    --endpoint-url "${AWS_ENDPOINT}" \
    --query 'Item.id.S' \
    --output text 2>/dev/null)
  
  if [ "$test_item" = "approval-test-123" ]; then
    echo "✅ Test data already exists, skipping seeding"
    return 0
  fi
  
  echo "📝 Seeding test data for development..."
  
  # Example approval request
  $AWS_CMD dynamodb put-item \
    --table-name "${APPROVALS_TABLE_NAME}" \
    --item '{
      "id": {"S": "approval-test-123"},
      "status": {"S": "pending"},
      "createdAt": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"},
      "expiresAt": {"S": "'$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%S.%3NZ)'"},
      "userId": {"S": "test-user"},
      "sessionId": {"S": "test-session-123"},
      "contextEnvironment": {"S": "staging"},
      "contextPermissions": {"L": [{"S": "read"}, {"S": "write"}, {"S": "deploy"}]},
      "platformAction": {"M": {
        "action": {"S": "deploy"},
        "resourceType": {"S": "application"},
        "resourceName": {"S": "test-app"},
        "environment": {"S": "staging"},
        "parameters": {"M": {}},
        "explanation": {"S": "Test deployment for approval workflow testing"},
        "rollbackPlan": {"S": "kubectl rollout undo deployment/test-app"},
        "riskLevel": {"S": "medium"},
        "estimatedImpact": {"S": "Temporary downtime during deployment"}
      }},
      "riskLevel": {"S": "medium"},
      "justification": {"S": "Test deployment for approval workflow testing"},
      "urgency": {"S": "normal"},
      "confidence": {"N": "0.85"},
      "requirements": {"M": {
        "requiredCount": {"N": "1"},
        "approvers": {"L": [{"S": "dev-lead"}]},
        "timeoutMinutes": {"N": "60"}
      }},
      "approvals": {"L": []},
      "rejections": {"L": []},
      "metadata": {"M": {
        "userAgent": {"S": "AI-IDP"},
        "ipAddress": {"S": "127.0.0.1"},
        "sessionId": {"S": "test-session-123"}
      }},
      "updatedAt": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}
    }' \
    --region "${AWS_REGION}" \
    --endpoint-url "${AWS_ENDPOINT}"

  if [ $? -eq 0 ]; then
    echo "✅ Test data seeded successfully"
  else
    echo "❌ Failed to seed test data"
    return 1
  fi
}

# Main execution
main() {
  echo "🚀 Starting DynamoDB table creation for AI-IDP"
  echo ""

  # Create tables
  create_approvals_table
  wait_for_table "${APPROVALS_TABLE_NAME}"
  echo ""

  # Create chat sessions table for persistent conversations
  create_chat_sessions_table
  wait_for_table "${CHAT_SESSIONS_TABLE_NAME}"
  echo ""

  # Create action tracking table for distributed action management
  create_action_tracking_table
  wait_for_table "${ACTION_TRACKING_TABLE_NAME}"
  echo ""

  # Seed test data for development
  seed_test_data
  echo ""

  echo "🎉 DynamoDB setup completed successfully!"
  echo ""
  echo "📋 Summary:"
  echo "  ✅ Approvals table: ${APPROVALS_TABLE_NAME}"
  echo "  ✅ Chat sessions table: ${CHAT_SESSIONS_TABLE_NAME}"
  echo "  ✅ Action tracking table: ${ACTION_TRACKING_TABLE_NAME}"
  echo ""
  echo "🔧 Environment variables to set:"
  echo "  APPROVALS_TABLE_NAME=${APPROVALS_TABLE_NAME}"
  echo "  CHAT_SESSIONS_TABLE_NAME=${CHAT_SESSIONS_TABLE_NAME}"
  echo "  ACTION_TRACKING_TABLE_NAME=${ACTION_TRACKING_TABLE_NAME}"
  echo "  AWS_REGION=${AWS_REGION}"
  echo "  AWS_ENDPOINT=${AWS_ENDPOINT}"
  echo ""
  echo "💡 Run this to verify tables:"
  echo "  ${AWS_CMD} dynamodb list-tables --endpoint-url ${AWS_ENDPOINT}"
}

# Execute main function
main "$@"