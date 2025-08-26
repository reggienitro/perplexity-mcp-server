#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Your EXACT original query
const ORIGINAL_QUERY = "I want to have a brain map note system. I have heard of notion and obsidian but have not looked into them yet. I need categories and ideally to be able to leverage AI";

async function testOriginalQuery() {
  console.log('=== Testing Your Original Query ===\n');
  console.log('Query:', ORIGINAL_QUERY);
  console.log('\n--- Starting server ---\n');

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

  const sendRequest = (request) => {
    const jsonRequest = JSON.stringify(request) + '\n';
    server.stdin.write(jsonRequest);
  };

  server.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          
          if (response.id === 1) {
            console.log('✅ Server initialized\n');
            
            // Send your original query
            sendRequest({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'research_router',
                arguments: {
                  query: ORIGINAL_QUERY,
                  focus: 'tools',
                  budget_conscious: true
                }
              },
              id: 2
            });
          } else if (response.id === 2) {
            console.log('--- FULL RESPONSE ---\n');
            
            if (response.result && response.result.content) {
              response.result.content.forEach((content) => {
                if (content.type === 'text') {
                  // Print the full response
                  console.log(content.text);
                }
              });
            }
            
            console.log('\n✅ Query completed!');
            server.kill();
            process.exit(0);
          }
        } catch (e) {
          // Not JSON
        }
      }
    }
  });

  server.stderr.on('data', (data) => {
    console.error('Error:', data.toString());
  });

  // Initialize
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

  setTimeout(() => {
    console.log('\n❌ Timeout');
    server.kill();
    process.exit(1);
  }, 30000);
}

testOriginalQuery().catch(console.error);