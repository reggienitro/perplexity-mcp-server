#!/usr/bin/env node
/**
 * Test script for the research router MCP server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Start the MCP server
const serverPath = path.join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// MCP initialization messages
const initMessage = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {
      roots: { listChanged: false },
      sampling: {}
    },
    clientInfo: { name: "test-client", version: "1.0.0" }
  }
};

const listToolsMessage = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {}
};

const testQueryMessage = {
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "research_router",
    arguments: {
      query: "I want to have a brain map note system. I have heard of notion and obsidian but have not looked into them yet. I need categories and ideally to be able to leverage AI",
      focus: "tools",
      budget_conscious: true,
      include_reasoning: true
    }
  }
};

let responseCount = 0;

// Handle server responses
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      responseCount++;
      
      console.log(`\n--- Response ${responseCount} ---`);
      console.log(JSON.stringify(response, null, 2));
      
      // Send next message based on response
      if (response.id === 1 && response.result) {
        // Send initialized notification then list tools
        server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + '\n');
        server.stdin.write(JSON.stringify(listToolsMessage) + '\n');
      } else if (response.id === 2 && response.result) {
        console.log('\n=== Available Tools ===');
        response.result.tools.forEach(tool => {
          console.log(`- ${tool.name}: ${tool.description.slice(0, 100)}...`);
        });
        
        // Now test our research router
        console.log('\n=== Testing Research Router ===');
        server.stdin.write(JSON.stringify(testQueryMessage) + '\n');
      } else if (response.id === 3) {
        console.log('\n=== Research Router Result ===');
        if (response.result && response.result.content) {
          response.result.content.forEach((item, index) => {
            console.log(`\n--- Content ${index + 1} ---`);
            console.log(item.text);
          });
        }
        
        // Test complete
        console.log('\n=== Test Complete ===');
        server.kill();
        process.exit(0);
      }
    } catch (err) {
      // Ignore non-JSON lines
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('Server Error:', data.toString());
});

server.on('close', (code) => {
  console.log(`\nServer exited with code ${code}`);
  process.exit(code);
});

// Start the test
console.log('=== Starting MCP Research Router Test ===');
server.stdin.write(JSON.stringify(initMessage) + '\n');