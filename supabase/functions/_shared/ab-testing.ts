/**
 * A/B Testing Framework - Helper Functions
 *
 * Sistema de testes A/B para otimização científica da Sofia
 * Permite testar variações de prompts, features e configurações
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface ExperimentConfig {
  systemPromptOverride?: string;
  useQuickResponses?: boolean;
  useReranking?: boolean;
  abandonmentThreshold?: number;
  ragChunksLimit?: number;
  temperature?: number;
  [key: string]: any;
}

export interface ExperimentVariant {
  variant: 'A' | 'B';
  config: ExperimentConfig;
}

export interface ExperimentResults {
  variant_a: {
    conversations: number;
    leads: number;
    conversion_rate: number;
    avg_lead_score: number;
    platinum_leads: number;
    avg_response_time_ms: number;
    avg_messages: number;
  };
  variant_b: {
    conversations: number;
    leads: number;
    conversion_rate: number;
    avg_lead_score: number;
    platinum_leads: number;
    avg_response_time_ms: number;
    avg_messages: number;
  };
  calculated_at: string;
}

/**
 * Atribui uma variante (A ou B) para uma conversa
 * Faz balanceamento automático 50/50
 */
export async function assignVariant(
  supabase: SupabaseClient,
  experimentId: string,
  conversationId: string
): Promise<'A' | 'B'> {
  const { data, error } = await supabase.rpc('assign_experiment_variant', {
    p_experiment_id: experimentId,
    p_conversation_id: conversationId,
  });

  if (error) {
    console.error('[A/B Testing] Erro ao atribuir variante:', error);
    // Fallback: retorna 'A' (controle) se falhar
    return 'A';
  }

  return data as 'A' | 'B';
}

/**
 * Obtém a configuração da variante atribuída para uma conversa
 */
export async function getExperimentConfig(
  supabase: SupabaseClient,
  experimentId: string,
  conversationId: string
): Promise<ExperimentConfig | null> {
  const { data, error } = await supabase.rpc('get_experiment_config', {
    p_experiment_id: experimentId,
    p_conversation_id: conversationId,
  });

  if (error) {
    console.error('[A/B Testing] Erro ao obter config:', error);
    return null;
  }

  return data as ExperimentConfig;
}

/**
 * Lista todos os experimentos ativos para uma organização
 */
export async function getActiveExperiments(
  supabase: SupabaseClient,
  orgId?: string
): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_active_experiments', {
    p_org_id: orgId || null,
  });

  if (error) {
    console.error('[A/B Testing] Erro ao listar experimentos:', error);
    return [];
  }

  return data || [];
}

/**
 * Calcula e atualiza resultados de um experimento
 */
export async function calculateResults(
  supabase: SupabaseClient,
  experimentId: string
): Promise<ExperimentResults | null> {
  const { data, error } = await supabase.rpc('calculate_experiment_results', {
    p_experiment_id: experimentId,
  });

  if (error) {
    console.error('[A/B Testing] Erro ao calcular resultados:', error);
    return null;
  }

  return data as ExperimentResults;
}

/**
 * Aplica configuração de experimento ao sistema
 * Mescla config base com override do experimento
 */
export function applyExperimentConfig(
  baseConfig: any,
  experimentConfig: ExperimentConfig | null
): any {
  if (!experimentConfig) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    ...experimentConfig,
  };
}

/**
 * Helper para criar novo experimento
 */
export async function createExperiment(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  description: string,
  hypothesis: string,
  variantA: ExperimentConfig,
  variantB: ExperimentConfig,
  targetSampleSize: number = 100
): Promise<string | null> {
  const { data, error } = await supabase
    .from('experiments')
    .insert({
      org_id: orgId,
      name,
      description,
      hypothesis,
      variant_a: variantA,
      variant_b: variantB,
      target_sample_size: targetSampleSize,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[A/B Testing] Erro ao criar experimento:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Inicia um experimento (muda status para 'running')
 */
export async function startExperiment(
  supabase: SupabaseClient,
  experimentId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('experiments')
    .update({
      status: 'running',
      start_date: new Date().toISOString(),
    })
    .eq('id', experimentId);

  if (error) {
    console.error('[A/B Testing] Erro ao iniciar experimento:', error);
    return false;
  }

  return true;
}

/**
 * Finaliza um experimento (muda status para 'completed')
 */
export async function completeExperiment(
  supabase: SupabaseClient,
  experimentId: string,
  winner: 'A' | 'B' | 'no_difference',
  confidenceLevel: number
): Promise<boolean> {
  // Primeiro calcula resultados finais
  await calculateResults(supabase, experimentId);

  // Depois marca como completo
  const { error } = await supabase
    .from('experiments')
    .update({
      status: 'completed',
      end_date: new Date().toISOString(),
      winner,
      confidence_level: confidenceLevel,
    })
    .eq('id', experimentId);

  if (error) {
    console.error('[A/B Testing] Erro ao finalizar experimento:', error);
    return false;
  }

  return true;
}

/**
 * Exemplo de uso completo:
 *
 * // 1. Criar experimento
 * const experimentId = await createExperiment(
 *   supabase,
 *   orgId,
 *   'Teste Quick Responses',
 *   'Testar se quick responses aumentam conversão',
 *   'Quick responses aumentam conversão em 15%',
 *   { useQuickResponses: false }, // Variante A (controle)
 *   { useQuickResponses: true },  // Variante B (teste)
 *   200 // 200 conversas por variante
 * );
 *
 * // 2. Iniciar experimento
 * await startExperiment(supabase, experimentId);
 *
 * // 3. Durante conversa, atribuir variante
 * const variant = await assignVariant(supabase, experimentId, conversationId);
 * const config = await getExperimentConfig(supabase, experimentId, conversationId);
 *
 * // 4. Aplicar configuração
 * const finalConfig = applyExperimentConfig(baseConfig, config);
 *
 * // 5. Após atingir sample size, calcular resultados
 * const results = await calculateResults(supabase, experimentId);
 *
 * // 6. Analisar e finalizar
 * await completeExperiment(supabase, experimentId, 'B', 0.95);
 */
