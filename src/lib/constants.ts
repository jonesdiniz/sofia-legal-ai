/**
 * Constantes centralizadas do projeto Sofia Legal AI
 */

/**
 * ID da organização usado para filtrar documentos RAG no Supabase.
 * Este valor identifica o contexto de conhecimento da Sofia.
 */
export const SOFIA_ORG_ID = "b4c42a5e-ee6c-449c-965f-1139a1d8ce77";

/**
 * Chave do localStorage para persistir o ID da conversa atual.
 */
export const CONVERSATION_STORAGE_KEY = "sofia_conversation_id";

/**
 * Configurações para simular comportamento humano de digitação.
 * Ajuste esses valores para controlar a velocidade e naturalidade das respostas.
 */
export const TYPING_CONFIG = {
  // Para a primeira mensagem (após receber resposta da IA)
  firstMessage: {
    minTotalDelay: 900,    // Mínimo total de "pensando + digitando" (ms)
    maxTotalDelay: 4500,   // Máximo total de "pensando + digitando" (ms)
    msPerChar: 18,         // Base de tempo por caractere (ms)
    jitterRange: 200,      // Variação aleatória (±ms)
  },
  // Para mensagens subsequentes (chunks seguintes)
  subsequentMessages: {
    baseDelay: 300,        // Delay base mínimo (ms)
    minDelay: 500,         // Delay mínimo total (ms)
    maxDelay: 3000,        // Delay máximo total (ms)
    msPerChar: 12,         // Base de tempo por caractere (ms)
    jitterRange: 150,      // Variação aleatória (±ms)
  },
  // Tamanho ideal dos chunks de texto
  chunkSize: {
    min: 50,               // Tamanho mínimo para considerar quebra
    max: 200,              // Tamanho máximo do chunk
  }
} as const;
