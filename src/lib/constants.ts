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
  firstMessage: {
    minTotalDelay: 1200,
    maxTotalDelay: 5000,
    msPerChar: 20,
    jitterRange: 250,
  },
  subsequentMessages: {
    baseDelay: 900, // antes 300
    minDelay: 1200, // antes 500
    maxDelay: 4500, // antes 3000
    msPerChar: 16, // um pouco mais “lenta”
    jitterRange: 250,
  },
  chunkSize: {
    min: 120, // antes 50
    max: 260, // antes 200
  },
} as const;
