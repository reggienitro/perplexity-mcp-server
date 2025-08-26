#!/usr/bin/env node

/**
 * Test Research Router with Note-Taking System Query
 * Tests the exact use case: brain mapping note system with AI capabilities
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Test configuration
const TEST_QUERY = "I want to have a brain map note system. I have heard of notion and obsidian but have not looked into them yet. I need categories and ideally to be able to leverage AI";

async function testResearchRouter() {
  console.log('=== Research Router Note-Taking Test ===\n');
  console.log('Query:', TEST_QUERY);
  console.log('\n--- Starting MCP Server ---\n');

  const serverPath = path.join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    env: {
      ...process.env,
      PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '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',
      MCP_LOG_LEVEL: 'info'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';

  // Function to send JSON-RPC request
  const sendRequest = (request) => {
    const jsonRequest = JSON.stringify(request) + '\n';
    server.stdin.write(jsonRequest);
  };

  // Handle server output
  server.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          
          if (response.id === 1) {
            console.log('✅ Server initialized successfully\n');
            
            // Send research router request
            sendRequest({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'research_router',
                arguments: {
                  query: TEST_QUERY,
                  focus: 'tools',
                  budget_conscious: true,
                  include_reasoning: true,
                  max_models: 2
                }
              },
              id: 2
            });
          } else if (response.id === 2) {
            console.log('--- Research Router Response ---\n');
            
            if (response.result && response.result.content) {
              response.result.content.forEach((content, index) => {
                if (content.type === 'text') {
                  console.log(`Content ${index + 1}:`);
                  
                  // Parse and display key sections
                  const text = content.text;
                  const sections = text.split('##').filter(s => s.trim());
                  
                  sections.forEach(section => {
                    const lines = section.split('\n');
                    const title = lines[0].trim();
                    if (title) {
                      console.log(`\n## ${title}`);
                      console.log(lines.slice(1).join('\n').trim().substring(0, 500) + '...\n');
                    }
                  });
                }
              });
            }
            
            // Extract metadata
            if (response.result && response.result.content) {
              const metadataContent = response.result.content.find(c => 
                c.text && c.text.includes('Research Metadata')
              );
              
              if (metadataContent) {
                console.log('\n--- Research Metadata ---');
                const metadataMatch = metadataContent.text.match(/\{[\s\S]*\}/);
                if (metadataMatch) {
                  try {
                    const metadata = JSON.parse(metadataMatch[0]);
                    console.log(JSON.stringify(metadata, null, 2));
                  } catch (e) {
                    console.log('Could not parse metadata');
                  }
                }
              }
            }
            
            console.log('\n✅ Test completed successfully!');
            process.exit(0);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    }
  });

  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });

  // Initialize server
  sendRequest({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    },
    id: 1
  });

  // Timeout after 60 seconds
  setTimeout(() => {
    console.log('\n❌ Test timed out after 60 seconds');
    server.kill();
    process.exit(1);
  }, 60000);
}

// Run test
testResearchRouter().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});