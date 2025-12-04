/**
 * OpenAI Cost Tracking Helpers
 *
 * Funções auxiliares para tracking de custos da API OpenAI
 * Permite monitoramento de ROI e identificação de oportunidades de otimização
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Preços OpenAI (por 1M tokens) - Janeiro 2025
export const OPENAI_PRICING = {
  "gpt-4o": {
    prompt: 2.50,
    completion: 10.00,
  },
  "gpt-4o-mini": {
    prompt: 0.150,
    completion: 0.600,
  },
  "text-embedding-3-small": {
    prompt: 0.020,
    completion: 0,
  },
  "text-embedding-3-large": {
    prompt: 0.130,
    completion: 0,
  },
} as const;

export type OpenAIModel = keyof typeof OPENAI_PRICING;
export type OperationType = 'chat' | 'embedding' | 'rerank' | 'sentiment' | 'intent';

/**
 * Calcula custo em USD baseado em tokens e modelo
 */
export function calculateCost(
  model: OpenAIModel,
  promptTokens: number,
  completionTokens: number = 0
): number {
  const pricing = OPENAI_PRICING[model] || OPENAI_PRICING["gpt-4o"];

  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;

  return parseFloat((promptCost + completionCost).toFixed(6));
}

/**
 * Registra uso da API OpenAI no banco de dados
 */
export async function trackOpenAIUsage(
  supabase: SupabaseClient,
  params: {
    conversationId?: string;
    orgId?: string;
    operationType: OperationType;
    model: OpenAIModel;
    promptTokens: number;
    completionTokens?: number;
    cached?: boolean;
  }
): Promise<boolean> {
  const totalTokens = params.promptTokens + (params.completionTokens || 0);
  const cost = calculateCost(
    params.model,
    params.promptTokens,
    params.completionTokens || 0
  );

  const { error } = await supabase.from("openai_usage").insert({
    conversation_id: params.conversationId || null,
    org_id: params.orgId || null,
    operation_type: params.operationType,
    model: params.model,
    prompt_tokens: params.promptTokens,
    completion_tokens: params.completionTokens || 0,
    total_tokens: totalTokens,
    estimated_cost_usd: cost,
    cached: params.cached || false,
  });

  if (error) {
    console.error("[Cost Tracking] Erro ao registrar uso:", error);
    return false;
  }

  console.log(`[Cost Tracking] Registrado: ${params.model} | ${totalTokens} tokens | $${cost}`);
  return true;
}

/**
 * Wrapper para rastrear custos de chamadas OpenAI automaticamente
 */
export async function trackOpenAICall<T>(
  supabase: SupabaseClient,
  params: {
    conversationId?: string;
    orgId?: string;
    operationType: OperationType;
    model: OpenAIModel;
    cached?: boolean;
  },
  apiCall: () => Promise<{ result: T; usage: { prompt_tokens: number; completion_tokens: number } }>
): Promise<T> {
  const { result, usage } = await apiCall();

  // Registra uso em background (não bloqueia resposta)
  trackOpenAIUsage(supabase, {
    ...params,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
  }).catch(console.error);

  return result;
}

/**
 * Verifica e atualiza cache de embeddings
 */
export async function getCachedEmbedding(
  supabase: SupabaseClient,
  text: string
): Promise<number[] | null> {
  // Gera hash do texto
  const textHash = await hashText(text);

  const { data, error } = await supabase
    .from("embedding_cache")
    .select("embedding, id")
    .eq("text_hash", textHash)
    .single();

  if (error || !data) {
    return null;
  }

  // Atualiza hit count e last_used_at
  await supabase
    .from("embedding_cache")
    .update({
      hit_count: supabase.rpc("increment", { row_id: data.id }),
      last_used_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  console.log("[Cache] Embedding encontrado no cache (economia de $0.00002)");
  return data.embedding;
}

/**
 * Armazena embedding no cache
 */
export async function cacheEmbedding(
  supabase: SupabaseClient,
  text: string,
  embedding: number[],
  model: string = "text-embedding-3-small"
): Promise<void> {
  const textHash = await hashText(text);
  const preview = text.substring(0, 100);

  await supabase.from("embedding_cache").insert({
    text_hash: textHash,
    text_preview: preview,
    embedding: embedding,
    model: model,
    hit_count: 0,
  });

  console.log("[Cache] Embedding armazenado no cache");
}

/**
 * Gera hash MD5 de um texto (para indexação de cache)
 */
async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Obtém análise de custos diários
 */
export async function getDailyCostAnalysis(
  supabase: SupabaseClient,
  startDate?: string,
  endDate?: string
): Promise<any[]> {
  const { data, error } = await supabase.rpc("get_daily_cost_analysis", {
    start_date: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    end_date: endDate || new Date().toISOString(),
  });

  if (error) {
    console.error("[Cost Tracking] Erro ao buscar análise:", error);
    return [];
  }

  return data || [];
}

/**
 * Obtém performance do cache
 */
export async function getCachePerformance(
  supabase: SupabaseClient
): Promise<any> {
  const { data, error } = await supabase.rpc("get_cache_performance", {
    time_window: "7 days",
  });

  if (error) {
    console.error("[Cost Tracking] Erro ao buscar cache performance:", error);
    return null;
  }

  return data;
}

/**
 * Calcula ROI de conversas
 */
export async function getConversationROI(
  supabase: SupabaseClient,
  leadValueUSD: number = 500
): Promise<any[]> {
  const { data, error } = await supabase.rpc("calculate_conversation_roi", {
    lead_value_usd: leadValueUSD,
  });

  if (error) {
    console.error("[Cost Tracking] Erro ao calcular ROI:", error);
    return [];
  }

  return data || [];
}

/**
 * Exemplo de uso completo:
 *
 * // 1. Tracking manual de custos
 * await trackOpenAIUsage(supabase, {
 *   conversationId: "...",
 *   orgId: "...",
 *   operationType: "chat",
 *   model: "gpt-4o",
 *   promptTokens: 1500,
 *   completionTokens: 500,
 *   cached: false
 * });
 *
 * // 2. Tracking automático com wrapper
 * const response = await trackOpenAICall(
 *   supabase,
 *   {
 *     conversationId,
 *     operationType: "chat",
 *     model: "gpt-4o"
 *   },
 *   async () => {
 *     const result = await openai.chat.completions.create({...});
 *     return {
 *       result: result.choices[0].message,
 *       usage: {
 *         prompt_tokens: result.usage.prompt_tokens,
 *         completion_tokens: result.usage.completion_tokens
 *       }
 *     };
 *   }
 * );
 *
 * // 3. Usar cache de embeddings
 * let embedding = await getCachedEmbedding(supabase, questionText);
 * if (!embedding) {
 *   const response = await openai.embeddings.create({...});
 *   embedding = response.data[0].embedding;
 *   await cacheEmbedding(supabase, questionText, embedding);
 *   await trackOpenAIUsage(supabase, {...}); // Registra custo
 * } else {
 *   await trackOpenAIUsage(supabase, {..., cached: true}); // Registra economia
 * }
 *
 * // 4. Análise de custos
 * const costAnalysis = await getDailyCostAnalysis(supabase);
 * const cachePerf = await getCachePerformance(supabase);
 * const roi = await getConversationROI(supabase, 500);
 */
