#!/usr/bin/env node

/**
 * Test Cache Functionality
 * Verifies that the cache service is working correctly
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const TEST_QUERY = "What are the best note-taking apps with AI features?";

async function testCache() {
  console.log('=== Cache Test ===\n');
  
  // Check cache directory
  const cacheDir = path.join(__dirname, 'cache');
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    console.log('✅ Cache directory ready:', cacheDir);
  } catch (error) {
    console.error('❌ Failed to create cache directory:', error);
  }

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
  let testPhase = 'first';
  let firstResponseTime = 0;
  let secondResponseTime = 0;

  const sendRequest = (request) => {
    const jsonRequest = JSON.stringify(request) + '\n';
    server.stdin.write(jsonRequest);
  };

  const makeResearchQuery = (requestId) => {
    const startTime = Date.now();
    sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'research_router',
        arguments: {
          query: TEST_QUERY,
          focus: 'tools',
          budget_conscious: true
        }
      },
      id: requestId
    });
    return startTime;
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
            console.log('--- First Query (should miss cache) ---');
            firstResponseTime = makeResearchQuery(2);
          } else if (response.id === 2) {
            const elapsed = Date.now() - firstResponseTime;
            console.log(`✅ First response received in ${elapsed}ms\n`);
            
            // Wait a bit then make the same query again
            console.log('--- Second Query (should hit cache) ---');
            setTimeout(() => {
              secondResponseTime = makeResearchQuery(3);
            }, 1000);
          } else if (response.id === 3) {
            const elapsed = Date.now() - secondResponseTime;
            console.log(`✅ Second response received in ${elapsed}ms\n`);
            
            // Check cache stats
            const statsFile = path.join(cacheDir, 'stats.json');
            fs.readFile(statsFile, 'utf-8')
              .then(data => {
                const stats = JSON.parse(data);
                console.log('--- Cache Statistics ---');
                console.log(`Total Hits: ${stats.totalHits}`);
                console.log(`Total Misses: ${stats.totalMisses}`);
                console.log(`Total Saved: ${stats.totalSaved}`);
                console.log(`Estimated Cost Savings: $${stats.estimatedCostSavings.toFixed(3)}`);
                console.log(`Hit Rate: ${stats.totalHits > 0 ? ((stats.totalHits / (stats.totalHits + stats.totalMisses)) * 100).toFixed(1) : 0}%`);
                
                if (stats.totalHits > 0) {
                  console.log('\n✅ Cache is working correctly!');
                } else {
                  console.log('\n⚠️ Cache hits not detected - check logs');
                }
              })
              .catch(err => {
                console.log('⚠️ Could not read cache stats:', err.message);
              })
              .finally(() => {
                server.kill();
                process.exit(0);
              });
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
      clientInfo: { name: 'cache-test', version: '1.0.0' }
    },
    id: 1
  });

  // Timeout
  setTimeout(() => {
    console.log('\n❌ Test timed out');
    server.kill();
    process.exit(1);
  }, 60000);
}

// Check logs for cache activity
async function checkLogs() {
  try {
    const logFile = path.join(__dirname, 'logs', 'info.log');
    const logs = await fs.readFile(logFile, 'utf-8');
    const lines = logs.split('\n').slice(-20);
    
    console.log('\n--- Recent Log Activity ---');
    lines.forEach(line => {
      if (line.includes('Cache')) {
        try {
          const log = JSON.parse(line);
          console.log(`[${log.timestamp}] ${log.message}`);
        } catch {
          // Not JSON
        }
      }
    });
  } catch (error) {
    console.log('Could not read logs');
  }
}

// Run test
testCache().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});