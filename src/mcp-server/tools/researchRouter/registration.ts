/**
 * @fileoverview Handles registration and error handling for the `research_router` tool.
 * @module src/mcp-server/tools/researchRouter/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import {
  ResearchRouterRequest,
  ResearchRouterRequestSchema,
  executeResearchRouter,
} from "./logic.js";
import { McpError } from "../../../types-global/errors.js";

/**
 * Registers the 'research_router' tool with the MCP server instance.
 * @param server - The MCP server instance.
 */
export const registerResearchRouterTool = async (server: McpServer): Promise<void> => {
  const toolName = "research_router";
  const toolDescription = `
Multi-model research router that intelligently routes research queries to appropriate AI models and synthesizes comprehensive responses.

Features:
- Automatic query classification (product research, technical analysis, tutorials, tool discovery, general)
- Multi-model orchestration (Perplexity AI primary, Claude analysis secondary)  
- Personalized recommendations based on user context (tech stack, budget, preferences)
- Intelligent response synthesis with structured outputs
- Cost tracking and performance monitoring

Perfect for: Product comparisons, technical alternatives analysis, setup guides, app discovery, and comprehensive research tasks.
(Ex. 'I need a note-taking app with brain mapping features', 'What are alternatives to Supabase for my data lake?')`.trim();

  server.registerTool(
    toolName,
    {
      title: "Multi-Model Research Router",
      description: toolDescription,
      inputSchema: ResearchRouterRequestSchema.shape,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
    },
    async (params: ResearchRouterRequest) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName,
      });

      try {
        logger.info(`Research router called with query: "${params.query}"`, handlerContext);
        
        const result = await executeResearchRouter(params, handlerContext);
        
        logger.info('Research router completed successfully', {
          ...handlerContext,
          query: params.query,
          modelsUsed: result.metadata.models_used.length,
          processingTime: result.metadata.total_processing_time_ms
        });

        return {
          content: [
            {
              type: "text",
              text: result.synthesized_response,
            },
            {
              type: "text", 
              text: `\n\n---\n**Research Metadata:**\n${JSON.stringify({
                routing_decision: result.routing_decision,
                models_used: result.metadata.models_used,
                processing_time: `${result.metadata.total_processing_time_ms}ms`,
                user_context_applied: result.user_context_applied
              }, null, 2)}`,
            }
          ]
        };
      } catch (error) {
        return await ErrorHandler.tryCatch(
          () => {
            throw error;
          },
          {
            operation: toolName,
            context: handlerContext,
          },
        );
      }
    },
  );

  logger.info(`Registered tool: ${toolName}`, {
    toolName,
    description: toolDescription.slice(0, 100) + "...",
    requestId: 'registration',
    timestamp: new Date().toISOString(),
  });
};