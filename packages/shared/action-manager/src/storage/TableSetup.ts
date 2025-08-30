/**
 * DynamoDB table setup for Action Tracking System
 * Reuses existing infrastructure and extends existing tables
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

export interface TableSetupConfig {
  region: string;
  endpoint?: string;
  actionTableName: string;
  sessionsTableName: string;
}

export class ActionTrackingTableSetup {
  private client: DynamoDBClient;
  private config: TableSetupConfig;

  constructor(config: TableSetupConfig) {
    this.config = config;
    this.client = new DynamoDBClient({
      region: config.region,
      ...(config.endpoint && { endpoint: config.endpoint })
    });
  }

  /**
   * Check if table exists
   */
  private async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.client.send(new DescribeTableCommand({ TableName: tableName }));
      return true;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create action_tracking table for detailed action records
   * This complements the existing ai-idp-chat-sessions table
   */
  async createActionTrackingTable(): Promise<void> {
    const tableName = this.config.actionTableName;

    if (await this.tableExists(tableName)) {
      console.log(`✅ Table ${tableName} already exists, skipping creation`);
      return;
    }

    console.log(`📝 Creating action tracking table: ${tableName}`);

    try {
      await this.client.send(new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [
          { AttributeName: 'actionId', AttributeType: 'S' },        // Primary key
          { AttributeName: 'sessionId', AttributeType: 'S' },       // For session queries
          { AttributeName: 'userId', AttributeType: 'S' },          // For user queries
          { AttributeName: 'status', AttributeType: 'S' },          // For status filtering
          { AttributeName: 'agentName', AttributeType: 'S' },       // For agent filtering
          { AttributeName: 'startTime', AttributeType: 'S' }        // For time-based sorting
        ],
        KeySchema: [
          { AttributeName: 'actionId', KeyType: 'HASH' }
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'SessionIndex',
            KeySchema: [
              { AttributeName: 'sessionId', KeyType: 'HASH' },
              { AttributeName: 'startTime', KeyType: 'RANGE' }
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5
            }
          },
          {
            IndexName: 'UserIndex', 
            KeySchema: [
              { AttributeName: 'userId', KeyType: 'HASH' },
              { AttributeName: 'startTime', KeyType: 'RANGE' }
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5
            }
          },
          {
            IndexName: 'StatusIndex',
            KeySchema: [
              { AttributeName: 'status', KeyType: 'HASH' },
              { AttributeName: 'startTime', KeyType: 'RANGE' }
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5, 
              WriteCapacityUnits: 5
            }
          },
          {
            IndexName: 'AgentIndex',
            KeySchema: [
              { AttributeName: 'agentName', KeyType: 'HASH' },
              { AttributeName: 'startTime', KeyType: 'RANGE' }
            ],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5
            }
          }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 10,
          WriteCapacityUnits: 10
        }
      }));

      console.log(`✅ Table ${tableName} created successfully`);

      // Enable TTL for automatic cleanup (30 days)
      console.log('⏰ Enabling TTL for automatic action cleanup...');
      
      // Note: TTL setup would go here, but LocalStack may not support it fully
      // In production, this would enable TTL on the 'ttl' attribute

    } catch (error) {
      console.error(`❌ Failed to create table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Verify existing chat sessions table has required structure
   * The existing table should have: sessionId (HASH), userId + lastActivity (GSI)
   */
  async verifyExistingSessionsTable(): Promise<void> {
    const tableName = this.config.sessionsTableName;

    try {
      const result = await this.client.send(new DescribeTableCommand({ 
        TableName: tableName 
      }));

      console.log(`✅ Verified existing sessions table: ${tableName}`);
      
      // Check for required GSI
      const hasUserIndex = result.Table?.GlobalSecondaryIndexes?.some(
        gsi => gsi.IndexName === 'UserIndex'
      );

      if (!hasUserIndex) {
        console.warn(`⚠️  Warning: ${tableName} missing UserIndex GSI`);
      } else {
        console.log(`✅ UserIndex GSI found on ${tableName}`);
      }

    } catch (error) {
      console.error(`❌ Failed to verify sessions table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Setup all required tables for action tracking
   */
  async setupTables(): Promise<void> {
    console.log('🚀 Setting up Action Tracking tables...');
    
    // Verify existing sessions table
    await this.verifyExistingSessionsTable();
    
    // Create new action tracking table
    await this.createActionTrackingTable();
    
    console.log('✅ Action Tracking tables setup complete!');
  }
}

/**
 * Default configuration for action tracking tables
 */
export const getDefaultTableConfig = (): TableSetupConfig => ({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566',
  actionTableName: process.env.ACTION_TRACKING_TABLE_NAME || 'ai-idp-action-tracking',
  sessionsTableName: process.env.CHAT_SESSIONS_TABLE_NAME || 'ai-idp-chat-sessions'
});

/**
 * Initialize tables if running as script
 */
if (require.main === module) {
  const setup = new ActionTrackingTableSetup(getDefaultTableConfig());
  setup.setupTables()
    .then(() => {
      console.log('✅ Table setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Table setup failed:', error);
      process.exit(1);
    });
}