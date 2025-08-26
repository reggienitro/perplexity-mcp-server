#!/usr/bin/env node
/**
 * Direct test of Perplexity API connection
 */

import { config } from './dist/config/index.js';
import { perplexityApiService } from './dist/services/index.js';
import { requestContextService } from './dist/utils/index.js';

async function testPerplexityAPI() {
  console.log('=== Testing Perplexity API Direct Connection ===');
  
  // Create a test context
  const context = requestContextService.createRequestContext({
    operation: 'testPerplexityAPI',
  });
  
  console.log(`API Key configured: ${config.perplexityApiKey ? 'Yes' : 'No'}`);
  console.log(`API Key starts with: ${config.perplexityApiKey?.substring(0, 10)}...`);
  
  try {
    console.log('\n--- Testing Perplexity Chat Completion ---');
    
    const testRequest = {
      model: 'sonar',
      messages: [{ 
        role: 'user', 
        content: 'What are the best note-taking apps with AI integration in 2025?' 
      }],
      search_mode: 'web',
      search_recency_filter: 'last_month',
      return_related_questions: false,
      stream: false
    };
    
    console.log('Request payload:', JSON.stringify(testRequest, null, 2));
    
    const response = await perplexityApiService.chatCompletion(testRequest, context);
    
    console.log('\n--- Success! ---');
    console.log('Response ID:', response.id);
    console.log('Model:', response.model);
    console.log('Content length:', response.choices[0]?.message.content?.length || 0);
    console.log('Content preview:', response.choices[0]?.message.content?.substring(0, 200) + '...');
    console.log('Usage:', response.usage);
    
  } catch (error) {
    console.error('\n--- Error ---');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error details:', error.response?.data || error.stack);
  }
}

testPerplexityAPI();