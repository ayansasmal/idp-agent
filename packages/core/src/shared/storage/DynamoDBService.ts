import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";
import { config } from '../config/ConfigManager';
import { Logger } from '../logger/Logger';

/**
 * DynamoDB Service - Handles all DynamoDB operations for the AI-IDP platform
 * Supports both local development (LocalStack) and production AWS DynamoDB
 */
export class DynamoDBService {
  private client: DynamoDBClient;
  private docClient: DynamoDBDocumentClient;
  private logger = new Logger('DynamoDBService');
  private isInitialized = false;

  constructor() {
    const awsConfig = config.getAWSConfig();
    
    // Create DynamoDB client with appropriate configuration
    this.client = new DynamoDBClient({
      region: awsConfig.region,
      endpoint: awsConfig.endpoint,
      credentials: awsConfig.credentials ? {
        accessKeyId: awsConfig.credentials.accessKeyId,
        secretAccessKey: awsConfig.credentials.secretAccessKey,
      } : undefined,
    });

    // Create document client for easier JSON operations
    this.docClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: {
        // Convert empty strings to null
        convertEmptyValues: false,
        // Remove undefined values
        removeUndefinedValues: true,
        // Convert class instances to map attributes
        convertClassInstanceToMap: true,
      },
      unmarshallOptions: {
        // Return numbers as numbers instead of strings
        wrapNumbers: false,
      },
    });

    this.logger.info('DynamoDB service initialized', {
      region: awsConfig.region,
      endpoint: awsConfig.endpoint,
      isLocal: !!awsConfig.endpoint
    });
  }

  /**
   * Initialize and validate DynamoDB connection
   */
  async initialize(): Promise<void> {
    try {
      // Test connection by listing tables
      await this.client.send(new (await import('@aws-sdk/client-dynamodb')).ListTablesCommand({}));
      
      this.isInitialized = true;
      this.logger.info('DynamoDB connection verified successfully');
    } catch (error) {
      this.logger.error('Failed to initialize DynamoDB connection', error);
      throw new Error(`DynamoDB initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Put an item into a DynamoDB table
   */
  async putItem(tableName: string, item: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    try {
      await this.docClient.send(new PutCommand({
        TableName: tableName,
        Item: item,
      }));

      this.logger.debug('Item stored successfully', { tableName, itemId: item.id });
    } catch (error) {
      this.logger.error('Failed to put item', error, { tableName, item });
      throw new Error(`Failed to store item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get an item from a DynamoDB table by primary key
   */
  async getItem(tableName: string, key: Record<string, any>): Promise<Record<string, any> | null> {
    this.ensureInitialized();

    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: tableName,
        Key: key,
      }));

      this.logger.debug('Item retrieved', { tableName, key, found: !!result.Item });
      return result.Item || null;
    } catch (error) {
      this.logger.error('Failed to get item', error, { tableName, key });
      throw new Error(`Failed to retrieve item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an item in a DynamoDB table
   */
  async updateItem(
    tableName: string, 
    key: Record<string, any>, 
    updateExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<Record<string, any> | null> {
    this.ensureInitialized();

    try {
      const result = await this.docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: 'ALL_NEW',
      }));

      this.logger.debug('Item updated successfully', { tableName, key });
      return result.Attributes || null;
    } catch (error) {
      this.logger.error('Failed to update item', error, { tableName, key });
      throw new Error(`Failed to update item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete an item from a DynamoDB table
   */
  async deleteItem(tableName: string, key: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    try {
      await this.docClient.send(new DeleteCommand({
        TableName: tableName,
        Key: key,
      }));

      this.logger.debug('Item deleted successfully', { tableName, key });
    } catch (error) {
      this.logger.error('Failed to delete item', error, { tableName, key });
      throw new Error(`Failed to delete item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Query items from a DynamoDB table using a GSI or primary key
   */
  async queryItems(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    options: {
      indexName?: string;
      filterExpression?: string;
      expressionAttributeNames?: Record<string, string>;
      limit?: number;
      scanIndexForward?: boolean;
    } = {}
  ): Promise<Record<string, any>[]> {
    this.ensureInitialized();

    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: tableName,
        IndexName: options.indexName,
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: options.filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: options.expressionAttributeNames,
        Limit: options.limit,
        ScanIndexForward: options.scanIndexForward,
      }));

      this.logger.debug('Query completed', { 
        tableName, 
        indexName: options.indexName,
        itemCount: result.Items?.length || 0 
      });

      return result.Items || [];
    } catch (error) {
      this.logger.error('Failed to query items', error, { tableName, options });
      throw new Error(`Failed to query items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Scan all items from a DynamoDB table (use with caution)
   */
  async scanItems(
    tableName: string,
    options: {
      filterExpression?: string;
      expressionAttributeValues?: Record<string, any>;
      expressionAttributeNames?: Record<string, string>;
      limit?: number;
    } = {}
  ): Promise<Record<string, any>[]> {
    this.ensureInitialized();

    try {
      const result = await this.docClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: options.filterExpression,
        ExpressionAttributeValues: options.expressionAttributeValues,
        ExpressionAttributeNames: options.expressionAttributeNames,
        Limit: options.limit,
      }));

      this.logger.debug('Scan completed', { 
        tableName, 
        itemCount: result.Items?.length || 0 
      });

      return result.Items || [];
    } catch (error) {
      this.logger.error('Failed to scan items', error, { tableName });
      throw new Error(`Failed to scan items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get DynamoDB service health status
   */
  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    try {
      if (!this.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'DynamoDB service not initialized'
        };
      }

      // Test connection by listing tables
      await this.client.send(new (await import('@aws-sdk/client-dynamodb')).ListTablesCommand({}));
      
      return {
        status: 'healthy',
        message: 'DynamoDB connection active'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `DynamoDB connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Ensure the service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('DynamoDB service not initialized. Call initialize() first.');
    }
  }

  /**
   * Close DynamoDB connection (cleanup)
   */
  async shutdown(): Promise<void> {
    try {
      this.client.destroy();
      this.isInitialized = false;
      this.logger.info('DynamoDB service shut down successfully');
    } catch (error) {
      this.logger.error('Error during DynamoDB shutdown', error);
    }
  }
}

// Singleton instance
export const dynamoDBService = new DynamoDBService();