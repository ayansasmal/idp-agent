#!/usr/bin/env tsx

/**
 * Direct test of Anthropic API connection
 */

import { AnthropicProvider } from './ai/providers/AnthropicProvider';
import { config } from './shared/config/ConfigManager';
import { defaultLogger } from './shared/logger/Logger';

const logger = defaultLogger.child({ component: 'AnthropicTest' });

async function testAnthropicDirect() {
  logger.info('🧪 Testing Anthropic API Connection...');
  
  try {
    const aiConfig = config.getAIConfig();
    logger.info('AI Config loaded:', {
      hasApiKey: !!aiConfig.anthropic?.apiKey,
      apiKeyLength: aiConfig.anthropic?.apiKey?.length || 0,
      model: aiConfig.anthropic?.model
    });
    
    if (!aiConfig.anthropic?.apiKey) {
      logger.error('❌ No API key found in config');
      return;
    }
    
    logger.info('Creating Anthropic provider...');
    const provider = new AnthropicProvider(
      aiConfig.anthropic.apiKey,
      aiConfig.anthropic.model || 'claude-sonnet-4-20250514',
      {
        temperature: aiConfig.anthropic.temperature,
        maxTokens: aiConfig.anthropic.maxTokens,
        maxRetries: aiConfig.anthropic.maxRetries,
      }
    );
    
    logger.info('Testing API key validation...');
    
    // Test with detailed error handling
    try {
      const isValid = await provider.validateApiKey();
      
      if (isValid) {
        logger.info('✅ Anthropic API key is valid!');
        
        // Test basic chat
        logger.info('Testing basic chat...');
        const response = await provider.chat('Hello, can you respond with just "API test successful"?');
        logger.info('Chat response:', { response });
        
      } else {
        logger.error('❌ Anthropic API key validation failed');
      }
    } catch (validationError) {
      logger.error('❌ API key validation threw error:', validationError);
    }
    
  } catch (error) {
    logger.error('❌ Anthropic test failed:', error);
  }
}

testAnthropicDirect();