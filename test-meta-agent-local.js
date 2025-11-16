
import { createMetaAgent } from './packages/meta-agent/dist/index.js';

console.log('Testing Meta-Agent with local embeddings...');
console.log('Environment check:');
console.log('- ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ Present' : '❌ Missing');
console.log('- QDRANT_URL:', process.env.QDRANT_URL);
console.log('- QDRANT_API_KEY:', process.env.QDRANT_API_KEY ? '✅ Present' : '❌ Missing');
console.log('');

async function testMetaAgent() {
  try {
    const metaAgent = createMetaAgent();
    console.log('✅ Meta-Agent created successfully');
    
    console.log('Initializing Meta-Agent (this may take time to download embedding model)...');
    await metaAgent.initialize();
    console.log('🎉 Meta-Agent initialized successfully with local embeddings!');
    
  } catch (error) {
    console.error('❌ Meta-Agent test failed:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack?.split('
').slice(0, 5).join('
'));
  }
}

testMetaAgent();

