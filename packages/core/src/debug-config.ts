#!/usr/bin/env tsx

/**
 * Debug configuration loading
 */

import { config } from './shared/config/ConfigManager';
import { defaultLogger } from './shared/logger/Logger';

const logger = defaultLogger.child({ component: 'ConfigDebug' });

function debugConfig() {
  logger.info('🔍 Debugging Configuration...');
  
  try {
    // Check environment variables first
    logger.info('Environment Variables:');
    logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '[SET]' : '[NOT SET]'}`);
    
    if (process.env.ANTHROPIC_API_KEY) {
      const key = process.env.ANTHROPIC_API_KEY;
      logger.info(`API Key length: ${key.length}`);
      logger.info(`API Key starts with: ${key.substring(0, 7)}...`);
    }
    
    // Check config loading
    logger.info('Loading Config...');
    const aiConfig = config.getAIConfig();
    logger.info('AI Config:', {
      primaryProvider: aiConfig.primaryProvider,
      hasAnthropicConfig: !!aiConfig.anthropic,
      hasApiKey: !!aiConfig.anthropic?.apiKey,
      apiKeyLength: aiConfig.anthropic?.apiKey?.length || 0,
      model: aiConfig.anthropic?.model,
      temperature: aiConfig.anthropic?.temperature
    });
    
    // Check config validation
    const validation = config.validate();
    logger.info('Config Validation:', validation);
    
    logger.info('✅ Config debug complete');
    
  } catch (error) {
    logger.error('❌ Config debug failed:', error);
  }
}

debugConfig();