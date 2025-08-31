/**
 * DynamoDB Client Factory
 * 
 * Creates configured DynamoDB clients for both LocalStack (development) 
 * and AWS (production) environments.
 */

import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';

/**
 * Configuration options for DynamoDB client creation
 */
export interface DynamoDBFactoryConfig {
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  forcePathStyle?: boolean;
}

/**
 * Factory class for creating DynamoDB clients
 */
export class DynamoDBClientFactory {
  /**
   * Create DynamoDB client for LocalStack development environment
   * @param config - Optional configuration overrides
   * @returns Configured DynamoDB client for LocalStack
   */
  static createLocalStackClient(config?: Partial<DynamoDBFactoryConfig>): DynamoDBClient {
    const clientConfig: DynamoDBClientConfig = {
      region: config?.region || process.env.AWS_DEFAULT_REGION || 'us-east-1',
      endpoint: config?.endpoint || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
      credentials: config?.credentials || {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      },
      // forcePathStyle: config?.forcePathStyle ?? true  // Removed for AWS SDK v3
    };

    return new DynamoDBClient(clientConfig);
  }

  /**
   * Create DynamoDB client for AWS production environment
   * @param config - Optional configuration overrides
   * @returns Configured DynamoDB client for AWS
   */
  static createAWSClient(config?: Partial<DynamoDBFactoryConfig>): DynamoDBClient {
    const clientConfig: DynamoDBClientConfig = {
      region: config?.region || process.env.AWS_DEFAULT_REGION || 'us-east-1'
    };

    // Add credentials if provided (otherwise use default credential chain)
    if (config?.credentials) {
      clientConfig.credentials = config.credentials;
    }

    return new DynamoDBClient(clientConfig);
  }

  /**
   * Create DynamoDB client based on environment
   * Automatically detects LocalStack vs AWS based on environment variables
   * @param config - Optional configuration overrides
   * @returns Configured DynamoDB client
   */
  static createClient(config?: Partial<DynamoDBFactoryConfig>): DynamoDBClient {
    const isLocalStack = process.env.NODE_ENV === 'development' || 
                        process.env.USE_LOCALSTACK === 'true' ||
                        process.env.LOCALSTACK_ENDPOINT !== undefined;

    if (isLocalStack) {
      console.log('Creating DynamoDB client for LocalStack environment');
      return this.createLocalStackClient(config);
    } else {
      console.log('Creating DynamoDB client for AWS environment');
      return this.createAWSClient(config);
    }
  }

  /**
   * Test DynamoDB client connectivity
   * @param client - DynamoDB client to test
   * @returns Promise resolving to connection status
   */
  static async testConnection(client: DynamoDBClient): Promise<{
    connected: boolean;
    endpoint?: string;
    region?: string;
    error?: string;
  }> {
    try {
      // Use ListTables as a simple connectivity test
      const { ListTablesCommand } = await import('@aws-sdk/client-dynamodb');
      const command = new ListTablesCommand({ Limit: 1 });
      
      await client.send(command);
      
      const config = await client.config.region?.() || 'unknown';
      const endpoint = await client.config.endpoint?.() || { hostname: 'unknown' };
      
      return {
        connected: true,
        region: typeof config === 'string' ? config : 'unknown',
        endpoint: endpoint?.hostname || 'unknown'
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Convenience function to create and test DynamoDB client
 * @param config - Optional configuration
 * @returns Promise resolving to client and connection status
 */
export async function createAndTestDynamoDBClient(config?: Partial<DynamoDBFactoryConfig>) {
  const client = DynamoDBClientFactory.createClient(config);
  const connectionStatus = await DynamoDBClientFactory.testConnection(client);
  
  return {
    client,
    connectionStatus
  };
}