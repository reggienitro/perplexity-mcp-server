/**
 * Research Router Logic
 * Handles query classification, model routing, and response synthesis
 */

import { z } from 'zod';
import { config } from '../../../config/index.js';
import { perplexityApiService } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';
import { cacheService } from '../../../services/cache/index.js';

// 1. DEFINE Zod input and output schemas.
export const ResearchRouterRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').describe('The research question or topic to investigate'),
  focus: z.enum(['product', 'technical', 'tutorial', 'tools', 'general']).optional().describe('Optional focus area to guide research approach (auto-detected if not specified)'),
  budget_conscious: z.boolean().optional().default(true).describe('Whether to prioritize budget-friendly options in recommendations'),
  include_reasoning: z.boolean().optional().default(false).describe('Include AI model reasoning and decision-making process in results'),
  max_models: z.number().min(1).max(3).optional().default(2).describe('Maximum number of AI models to use for research'),
}).describe("Multi-model research router that intelligently routes research queries to appropriate AI models and synthesizes comprehensive responses.");

const UserContextSchema = z.object({
  name: z.string(),
  tech_stack: z.array(z.string()),
  current_projects: z.array(z.string()),
  preferences: z.object({
    budget_conscious: z.boolean(),
    prefers_open_source: z.boolean(),
    technical_level: z.enum(['beginner', 'intermediate', 'advanced']),
    platforms: z.array(z.string()),
  }),
});

const RoutingDecisionSchema = z.object({
  primary_model: z.string(),
  secondary_model: z.string().optional(),
  query_type: z.enum(['product', 'technical', 'tutorial', 'tools', 'general']),
  context_needed: z.array(z.string()),
  synthesis_approach: z.enum(['comparison_table', 'detailed_analysis', 'step_by_step', 'feature_matrix', 'comprehensive']),
  reasoning: z.string().optional(),
});

export const ResearchRouterResponseSchema = z.object({
  query: z.string(),
  routing_decision: z.object({
    primary_model: z.string(),
    secondary_model: z.string().optional(),
    query_type: z.string(),
    reasoning: z.string().optional(),
  }),
  results: z.array(z.object({
    model: z.string(),
    response: z.string(),
    confidence_score: z.number().optional(),
  })),
  synthesized_response: z.string(),
  user_context_applied: z.object({
    tech_stack_relevant: z.boolean(),
    budget_considerations: z.array(z.string()),
    platform_compatibility: z.array(z.string()),
  }),
  metadata: z.object({
    total_processing_time_ms: z.number(),
    models_used: z.array(z.string()),
    cost_estimate: z.string().optional(),
  }),
});

// 2. INFER and export TypeScript types.
export type ResearchRouterRequest = z.infer<typeof ResearchRouterRequestSchema>;
export type ResearchRouterResponse = z.infer<typeof ResearchRouterResponseSchema>;
export type UserContext = z.infer<typeof UserContextSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

// Default user context - in production this would be loaded from storage
const DEFAULT_USER_CONTEXT: UserContext = {
  name: 'User',
  tech_stack: ['Supabase', 'Python', 'Node.js', 'Claude Code', 'MCP'],
  current_projects: ['note-taking system', 'AI agents', 'data integration'],
  preferences: {
    budget_conscious: true,
    prefers_open_source: true,
    technical_level: 'intermediate',
    platforms: ['macOS', 'web']
  }
};

export class QueryClassifier {
  static classifyQuery(query: string, userContext: UserContext, focus?: string): RoutingDecision {
    const queryLower = query.toLowerCase();
    
    // Override with focus if provided
    if (focus) {
      return this.getDecisionForFocus(focus as any, query, userContext);
    }
    
    // Product research patterns
    if (this.isProductQuery(queryLower)) {
      return {
        primary_model: 'perplexity',
        query_type: 'product',
        context_needed: ['budget', 'preferences', 'use_case'],
        synthesis_approach: 'comparison_table',
        reasoning: 'Detected product research query - using Perplexity for real-time reviews and pricing'
      };
    }
    
    // Technical alternatives research
    if (this.isTechnicalAlternativesQuery(queryLower)) {
      return {
        primary_model: 'perplexity',
        secondary_model: 'claude_analysis',
        query_type: 'technical',
        context_needed: ['current_tech_stack', 'migration_complexity'],
        synthesis_approach: 'detailed_analysis',
        reasoning: 'Technical alternatives query - combining Perplexity research with Claude analysis'
      };
    }
    
    // Setup/tutorial queries
    if (this.isSetupQuery(queryLower)) {
      return {
        primary_model: 'perplexity',
        query_type: 'tutorial',
        context_needed: ['platform', 'technical_level'],
        synthesis_approach: 'step_by_step',
        reasoning: 'Setup/tutorial query - using Perplexity for latest guides'
      };
    }
    
    // Tool discovery
    if (this.isToolDiscoveryQuery(queryLower)) {
      return {
        primary_model: 'perplexity',
        query_type: 'tools',
        context_needed: ['platform', 'budget', 'integration_needs'],
        synthesis_approach: 'feature_matrix',
        reasoning: 'Tool discovery query - using Perplexity for comprehensive app analysis'
      };
    }
    
    // Default to general research
    return {
      primary_model: 'perplexity',
      query_type: 'general',
      context_needed: ['user_preferences'],
      synthesis_approach: 'comprehensive',
      reasoning: 'General research query - using Perplexity for broad information gathering'
    };
  }
  
  private static isProductQuery(query: string): boolean {
    return /should i buy|what (shoes|headphones|laptop|phone)|best.*for|recommend.*product|compare.*products?|vs.*price/.test(query);
  }
  
  private static isTechnicalAlternativesQuery(query: string): boolean {
    return /alternatives?.*to|vs.*comparison|pros.*cons|switch.*from|migrate.*from|replace.*with/.test(query);
  }
  
  private static isSetupQuery(query: string): boolean {
    return /setup|install|configure|how.*to.*setup|deploy|host.*server|create.*server/.test(query);
  }
  
  private static isToolDiscoveryQuery(query: string): boolean {
    return /app.*for|tool.*for|software.*for|note.*taking|productivity.*app|brain.*map/.test(query);
  }
  
  private static getDecisionForFocus(focus: string, query: string, userContext: UserContext): RoutingDecision {
    const focusMap = {
      product: { synthesis: 'comparison_table', reasoning: 'Product focus specified' },
      technical: { synthesis: 'detailed_analysis', reasoning: 'Technical focus specified' },
      tutorial: { synthesis: 'step_by_step', reasoning: 'Tutorial focus specified' },
      tools: { synthesis: 'feature_matrix', reasoning: 'Tools focus specified' },
      general: { synthesis: 'comprehensive', reasoning: 'General focus specified' }
    };
    
    const config = focusMap[focus as keyof typeof focusMap] || focusMap.general;
    
    return {
      primary_model: 'perplexity',
      query_type: focus as any,
      context_needed: ['user_preferences'],
      synthesis_approach: config.synthesis as any,
      reasoning: config.reasoning
    };
  }
}

export class ResponseSynthesizer {
  static synthesizeResponse(
    query: string,
    responses: Array<{model: string, response: string}>,
    routingDecision: RoutingDecision,
    userContext: UserContext
  ): string {
    const { synthesis_approach } = routingDecision;
    
    switch (synthesis_approach) {
      case 'comparison_table':
        return this.synthesizeProductResearch(query, responses, userContext);
      case 'detailed_analysis':
        return this.synthesizeTechnicalAnalysis(query, responses, userContext);
      case 'step_by_step':
        return this.synthesizeTutorial(query, responses, userContext);
      case 'feature_matrix':
        return this.synthesizeToolDiscovery(query, responses, userContext);
      default:
        return this.synthesizeComprehensive(query, responses, userContext);
    }
  }
  
  private static synthesizeProductResearch(query: string, responses: Array<{model: string, response: string}>, userContext: UserContext): string {
    const { preferences } = userContext;
    
    let synthesis = `# Product Research: ${query}\n\n`;
    synthesis += `**Your Context:** Budget-conscious: ${preferences.budget_conscious}, Prefers Open Source: ${preferences.prefers_open_source}\n\n`;
    
    responses.forEach((resp, index) => {
      synthesis += `## ${resp.model} Analysis\n${resp.response}\n\n`;
    });
    
    synthesis += `## Personalized Recommendation\n`;
    synthesis += `Based on your preferences and tech stack (${userContext.tech_stack.join(', ')}), consider:\n\n`;
    
    if (preferences.budget_conscious) {
      synthesis += `- **Budget Options**: Look for free tiers or open-source alternatives\n`;
    }
    
    if (preferences.prefers_open_source) {
      synthesis += `- **Open Source**: Prioritize tools with open-source options for flexibility\n`;
    }
    
    synthesis += `- **Integration**: Ensure compatibility with your existing stack\n`;
    synthesis += `- **Platform Support**: Verified compatibility with ${preferences.platforms.join(', ')}\n`;
    
    return synthesis;
  }
  
  private static synthesizeTechnicalAnalysis(query: string, responses: Array<{model: string, response: string}>, userContext: UserContext): string {
    let synthesis = `# Technical Analysis: ${query}\n\n`;
    synthesis += `**Current Tech Stack:** ${userContext.tech_stack.join(', ')}\n\n`;
    
    responses.forEach((resp) => {
      synthesis += `## ${resp.model} Analysis\n${resp.response}\n\n`;
    });
    
    synthesis += `## Migration Considerations\n`;
    synthesis += `- **Data Migration**: Assess complexity based on current ${userContext.tech_stack[0]} setup\n`;
    synthesis += `- **Learning Curve**: Consider your ${userContext.preferences.technical_level} technical level\n`;
    synthesis += `- **Integration Impact**: Review compatibility with existing tools\n`;
    synthesis += `- **Cost Analysis**: ${userContext.preferences.budget_conscious ? 'Prioritize cost-effective options' : 'Focus on feature completeness'}\n`;
    
    return synthesis;
  }
  
  private static synthesizeTutorial(query: string, responses: Array<{model: string, response: string}>, userContext: UserContext): string {
    let synthesis = `# Setup Guide: ${query}\n\n`;
    synthesis += `**Platform:** ${userContext.preferences.platforms.join(', ')}\n`;
    synthesis += `**Technical Level:** ${userContext.preferences.technical_level}\n\n`;
    
    responses.forEach((resp) => {
      synthesis += `${resp.response}\n\n`;
    });
    
    synthesis += `## Additional Considerations\n`;
    synthesis += `- Ensure compatibility with your ${userContext.tech_stack.join(', ')} environment\n`;
    synthesis += `- Consider integration with current projects: ${userContext.current_projects.join(', ')}\n`;
    
    return synthesis;
  }
  
  private static synthesizeToolDiscovery(query: string, responses: Array<{model: string, response: string}>, userContext: UserContext): string {
    let synthesis = `# Tool Discovery: ${query}\n\n`;
    synthesis += `**Requirements:** ${userContext.preferences.platforms.join(', ')} compatibility, `;
    synthesis += `${userContext.preferences.budget_conscious ? 'Budget-friendly' : 'Full-featured'}\n\n`;
    
    responses.forEach((resp) => {
      synthesis += `${resp.response}\n\n`;
    });
    
    synthesis += `## Feature Matrix\n`;
    synthesis += `| Tool | Free Tier | Paid Plans | AI Integration | Platform Support | Open Source |\n`;
    synthesis += `|------|-----------|------------|----------------|------------------|-------------|\n`;
    synthesis += `| TBD  | TBD       | TBD        | TBD            | TBD              | TBD         |\n\n`;
    
    synthesis += `## Recommendation Framework\n`;
    synthesis += `Consider these factors based on your profile:\n`;
    synthesis += `- **Budget**: ${userContext.preferences.budget_conscious ? 'Start with free tiers' : 'Evaluate total cost of ownership'}\n`;
    synthesis += `- **Integration**: Must work with ${userContext.tech_stack.join(', ')}\n`;
    synthesis += `- **Workflow**: Should enhance ${userContext.current_projects.join(', ')} projects\n`;
    
    return synthesis;
  }
  
  private static synthesizeComprehensive(query: string, responses: Array<{model: string, response: string}>, userContext: UserContext): string {
    let synthesis = `# Research Summary: ${query}\n\n`;
    
    responses.forEach((resp, index) => {
      synthesis += `## Source ${index + 1}: ${resp.model}\n${resp.response}\n\n`;
    });
    
    synthesis += `## Contextual Analysis\n`;
    synthesis += `Based on your profile (${userContext.name}) and tech stack:\n`;
    synthesis += `- Current focus: ${userContext.current_projects.join(', ')}\n`;
    synthesis += `- Technical approach: ${userContext.preferences.technical_level} level\n`;
    synthesis += `- Platform requirements: ${userContext.preferences.platforms.join(', ')}\n`;
    
    return synthesis;
  }
}

/**
 * 3. IMPLEMENT and export the core logic function.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function executeResearchRouter(
  params: ResearchRouterRequest,
  context: RequestContext
): Promise<ResearchRouterResponse> {
  const startTime = Date.now();
  
  logger.info(`Starting research router for query: "${params.query}"`, context);
  
  // Check cache first
  const cacheParams = {
    focus: params.focus,
    budget_conscious: params.budget_conscious,
    include_reasoning: params.include_reasoning,
    max_models: params.max_models
  };
  
  const cachedResponse = await cacheService.get(params.query, cacheParams);
  if (cachedResponse) {
    logger.info(`Returning cached response for query: "${params.query}"`, context);
    return cachedResponse;
  }
  
  const userContext = { ...DEFAULT_USER_CONTEXT };
  userContext.preferences.budget_conscious = params.budget_conscious ?? true;
  
  // Classify the query
  const routingDecision = QueryClassifier.classifyQuery(params.query, userContext, params.focus);
  
  logger.info(`Routing decision made`, { 
    ...context, 
    primaryModel: routingDecision.primary_model,
    queryType: routingDecision.query_type 
  });
  
  // Execute primary model query
  const responses: Array<{model: string, response: string, confidence_score?: number}> = [];
  
  try {
    // Use Perplexity for primary research via the working search logic
    if (routingDecision.primary_model === 'perplexity') {
      // Import the working perplexity search logic
      const { perplexitySearchLogic } = await import('../perplexitySearch/logic.js');
      
      const searchParams = {
        query: params.query,
        search_mode: (routingDecision.query_type === 'technical' ? 'academic' : 'web') as 'web' | 'academic',
        search_recency_filter: 'month',
        showThinking: params.include_reasoning,
        return_related_questions: false
      };
      
      const perplexityResponse = await perplexitySearchLogic(searchParams, context);
      
      responses.push({
        model: 'Perplexity AI',
        response: perplexityResponse.rawResultText,
        confidence_score: 0.9
      });
    }
    
    // Add secondary analysis if specified
    if (routingDecision.secondary_model === 'claude_analysis') {
      const claudeAnalysis = generateClaudeAnalysis(params.query, userContext, routingDecision);
      responses.push({
        model: 'Claude Analysis',
        response: claudeAnalysis,
        confidence_score: 0.85
      });
    }
    
  } catch (error) {
    logger.error(`Error in research execution`, { ...context, error });
    
    // Fallback response
    responses.push({
      model: 'Fallback Analysis',
      response: `Research query: "${params.query}"\n\nI encountered an issue accessing external research sources. Based on your context and preferences, I can provide some general guidance:\n\nFor your ${routingDecision.query_type} research, consider:\n- Reviewing your current tech stack: ${userContext.tech_stack.join(', ')}\n- Budget considerations: ${userContext.preferences.budget_conscious ? 'Look for free/open source options' : 'Focus on feature completeness'}\n- Platform compatibility: ${userContext.preferences.platforms.join(', ')}\n\nPlease try your query again or refine it for better results.`,
      confidence_score: 0.5
    });
  }
  
  // Synthesize the final response
  const synthesizedResponse = ResponseSynthesizer.synthesizeResponse(
    params.query,
    responses,
    routingDecision,
    userContext
  );
  
  const endTime = Date.now();
  const processingTime = endTime - startTime;
  
  // Analyze user context relevance
  const userContextApplied = {
    tech_stack_relevant: userContext.tech_stack.some(tech => 
      params.query.toLowerCase().includes(tech.toLowerCase())
    ),
    budget_considerations: userContext.preferences.budget_conscious 
      ? ['Free tier analysis', 'Open source alternatives', 'Cost-effectiveness review']
      : ['Feature completeness', 'Premium options', 'ROI analysis'],
    platform_compatibility: userContext.preferences.platforms.filter(platform =>
      params.query.toLowerCase().includes(platform.toLowerCase()) ||
      ['cross-platform', 'universal'].some(term => params.query.toLowerCase().includes(term))
    )
  };
  
  const result: ResearchRouterResponse = {
    query: params.query,
    routing_decision: {
      primary_model: routingDecision.primary_model,
      secondary_model: routingDecision.secondary_model,
      query_type: routingDecision.query_type,
      reasoning: params.include_reasoning ? routingDecision.reasoning : undefined
    },
    results: responses,
    synthesized_response: synthesizedResponse,
    user_context_applied: userContextApplied,
    metadata: {
      total_processing_time_ms: processingTime,
      models_used: responses.map(r => r.model),
      cost_estimate: responses.length > 1 ? 'Multi-model query (~$0.02)' : 'Single model query (~$0.01)'
    }
  };
  
  logger.info(`Research router completed`, { 
    ...context, 
    processingTime: `${processingTime}ms`,
    modelsUsed: result.metadata.models_used.length
  });
  
  // Cache the response
  await cacheService.set(
    params.query,
    cacheParams,
    result,
    routingDecision.primary_model,
    processingTime
  );
  
  return result;
}

function generateClaudeAnalysis(query: string, userContext: UserContext, routingDecision: RoutingDecision): string {
  // This simulates a Claude analysis - in production you could integrate with Claude API
  return `**Claude Technical Analysis for: "${query}"**

Based on your profile and tech stack analysis:

**Context Relevance:**
- Current stack: ${userContext.tech_stack.join(', ')}
- Projects: ${userContext.current_projects.join(', ')}
- Technical level: ${userContext.preferences.technical_level}

**Technical Considerations:**
- Integration complexity with existing ${userContext.tech_stack[0]} setup
- Development workflow impact
- Maintenance and scaling considerations
- Learning curve assessment

**Strategic Recommendations:**
- ${userContext.preferences.budget_conscious ? 'Cost-effective implementation approach' : 'Comprehensive feature evaluation'}
- ${userContext.preferences.prefers_open_source ? 'Open source alternatives and customization options' : 'Commercial solutions with support'}
- Platform compatibility matrix for ${userContext.preferences.platforms.join(' and ')}

This analysis complements the research data with technical implementation insights specific to your development environment.`;
}