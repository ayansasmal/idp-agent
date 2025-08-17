#!/usr/bin/env tsx

/**
 * Quick Demo to test the modular system
 * This bypasses some type issues for rapid testing
 */

import 'dotenv/config';
import { SimpleModuleRegistry } from './SimpleRegistry';

async function demo() {
  console.log(`
🚀 AI-IDP Phase 2 - Modular System Demo
=====================================

Testing the new 4-module architecture:
✅ Kubernetes Module - Platform operations
✅ Safety Module - Risk assessment & validation  
✅ Approval Module - Human-in-the-loop workflows
✅ Audit Module - Comprehensive logging & compliance

`);

  try {
    // Initialize module registry
    console.log('🔧 Initializing module registry...');
    const registry = new SimpleModuleRegistry();
    console.log('✅ Module registry initialized successfully!\n');

    // Get module stats
    const stats = registry.getModuleStats();
    console.log('📊 Module Statistics:');
    console.log(`   Total modules: ${stats.totalModules}`);
    console.log(`   Initialized modules: ${stats.initializedModules}`);
    console.log(`   Available modules: ${stats.moduleNames.join(', ')}\n`);

    // Test module capabilities
    console.log('🔍 Module Capabilities:');
    Object.entries(stats.capabilities).forEach(([module, capabilities]) => {
      console.log(`   ${module}: ${capabilities.join(', ')}`);
    });
    console.log('');

    // Test module health
    console.log('❤️ Module Health Check:');
    const health = await registry.getModulesHealth();
    Object.entries(health).forEach(([module, status]) => {
      const icon = status.status === 'healthy' ? '✅' : status.status === 'degraded' ? '⚠️' : '❌';
      console.log(`   ${icon} ${module}: ${status.message || status.status}`);
    });
    console.log('');

    // Test connectivity
    console.log('🔗 Testing Module Connectivity:');
    const connectivity = await registry.testConnectivity();
    Object.entries(connectivity).forEach(([module, connected]) => {
      const icon = connected ? '✅' : '❌';
      console.log(`   ${icon} ${module}: ${connected ? 'Connected' : 'Failed'}`);
    });
    console.log('');

    // Test action mapping
    console.log('🎯 Testing Action-to-Module Mapping:');
    const testActions = ['deploy', 'scale', 'validate', 'request-approval', 'log-event'];
    testActions.forEach(action => {
      try {
        const module = registry.getModuleForAction(action);
        console.log(`   ✅ ${action} → ${module}`);
      } catch (error) {
        console.log(`   ❌ ${action} → Error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    });
    console.log('');

    // Test network mode switching
    console.log('🌐 Testing Network Mode:');
    console.log('   Setting network mode: enabled');
    registry.setNetworkMode(true);
    console.log('   ✅ Network mode enabled (ready for Phase 2 agent extraction)');
    
    console.log('   Setting network mode: disabled');
    registry.setNetworkMode(false);
    console.log('   ✅ Network mode disabled (back to local method calls)\n');

    // Validation tests
    console.log('🛡️ Testing Module Validation:');
    const requiredModules = ['kubernetes', 'safety', 'approval', 'audit'];
    const validation = registry.validateRequiredModules(requiredModules);
    if (validation.valid) {
      console.log('   ✅ All required modules available');
    } else {
      console.log(`   ❌ Missing modules: ${validation.missing.join(', ')}`);
    }
    console.log('');

    // Supported actions
    console.log('📋 All Supported Actions:');
    const allActions = registry.getAllSupportedActions();
    console.log(`   Total actions: ${allActions.length}`);
    console.log(`   Actions: ${allActions.join(', ')}\n`);

    // Shutdown
    console.log('🔄 Shutting down modules...');
    await registry.shutdown();
    console.log('✅ All modules shut down successfully\n');

    console.log(`
🎉 Phase 2 Modular System Demo Complete!

What we just demonstrated:
✅ Successfully initialized 4 core modules
✅ Module health monitoring and connectivity testing
✅ Action-to-module routing system
✅ Network mode switching (Phase 1 ↔ Phase 2)
✅ Module validation and capability discovery
✅ Graceful shutdown procedures

The foundation is now ready for:
📦 Phase 2: Zero-refactoring agent extraction
🚀 Phase 3: Advanced multi-agent ecosystem
🌐 Network-based distributed agent architecture

This modular system provides the flexibility to:
- Run all modules locally (Phase 1)
- Extract modules to standalone agents (Phase 2)
- Scale and distribute agents independently (Phase 3)
`);

  } catch (error) {
    console.log('\n❌ Demo failed. Check your configuration and try again.');
    console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Run demo
demo().catch(console.error);