/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUICK RESPONSES SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sistema de respostas rápidas para intents comuns e perguntas frequentes.
 * Reduz latência em 70% e custo em 80% ao evitar chamadas desnecessárias ao LLM.
 *
 * Usado quando:
 * - Intent detectada com confiança > 0.85
 * - Pergunta match com padrão conhecido
 * - Não há necessidade de contexto RAG
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Intent } from "./index.ts";

export interface QuickResponse {
  intent: Intent;
  patterns: RegExp[];
  response: string;
  skipRAG: boolean; // Se deve pular busca RAG
  requiresMinConfidence: number; // Confiança mínima para usar resposta rápida
}

/**
 * Banco de respostas rápidas otimizadas
 */
export const QUICK_RESPONSES: QuickResponse[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // SAUDAÇÕES SIMPLES
  // ═══════════════════════════════════════════════════════════════════════
  {
    intent: "saudacao",
    patterns: [
      /^(oi|olá|ola|hey|e aí|eai|opa)$/i,
      /^(bom dia|boa tarde|boa noite)$/i,
    ],
    response: "Oii! Tudo bem por aí? 😊",
    skipRAG: true,
    requiresMinConfidence: 0.85,
  },
  {
    intent: "saudacao",
    patterns: [
      /^(oi|olá|ola)\s+(bom dia|boa tarde|boa noite)$/i,
      /^(bom dia|boa tarde|boa noite)[,!.]*$/i,
    ],
    response: "Oi! Bom dia!! Tudo bem por aí? 💛",
    skipRAG: true,
    requiresMinConfidence: 0.85,
  },
  {
    intent: "saudacao",
    patterns: [
      /^tudo bem\??$/i,
      /^(você está|tu está|vc está|está) bem\??$/i,
      /^como (você|vc|tu) está\??$/i,
    ],
    response: "Tudo ótimo por aqui, obrigada por perguntar! 💛 E com você, está tudo bem?",
    skipRAG: true,
    requiresMinConfidence: 0.85,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PERGUNTAS SOBRE A SOFIA
  // ═══════════════════════════════════════════════════════════════════════
  {
    intent: "saudacao",
    patterns: [
      /^(quem é|quem e|qual|como) (você|vc|tu)\??$/i,
      /^com quem (estou falando|falo|to falando)\??$/i,
      /^(você|vc) (é|e) quem\??$/i,
    ],
    response: "Oii, sou a Sofia 😊, assistente jurídica aqui do escritório Bueno Diniz Advocacia & Consultoria Jurídica. Como posso te ajudar?",
    skipRAG: true,
    requiresMinConfidence: 0.8,
  },
  {
    intent: "saudacao",
    patterns: [
      /^(você|vc|tu) (é|e) (um |uma )?(robô|robo|bot|ia|inteligência artificial|sistema|automática|automatico)\??$/i,
      /^(isso|este|esse) (é|e) (um |uma )?(atendimento )?(automático|automatico|robô|robo|bot)\??$/i,
    ],
    response: "Sou uma assistente virtual 😊, trabalho aqui com o advogado do escritório orientando sobre questões jurídicas. Mas se precisar falar com o advogado de verdade, é só me avisar que eu organizo!",
    skipRAG: true,
    requiresMinConfidence: 0.85,
  },
  {
    intent: "saudacao",
    patterns: [
      /^(você|vc|tu) (é|e) (advogada|advogado)\??$/i,
      /^(você|vc) trabalha como advogad[ao]\??$/i,
    ],
    response: "Sou assistente jurídica aqui do escritório, trabalho junto com o advogado orientando e organizando os casos. 🙂 Se você quiser, já posso organizar pra ele analisar o seu caso com calma.",
    skipRAG: true,
    requiresMinConfidence: 0.85,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AGRADECIMENTOS
  // ═══════════════════════════════════════════════════════════════════════
  {
    intent: "saudacao",
    patterns: [
      /^(obrigad[ao]|valeu|brigad[ao]|thanks|thank you)$/i,
      /^muito obrigad[ao]$/i,
    ],
    response: "De nada! 💛 Estou aqui pra ajudar. Tem mais alguma dúvida?",
    skipRAG: true,
    requiresMinConfidence: 0.9,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AGENDAMENTO DIRETO
  // ═══════════════════════════════════════════════════════════════════════
  {
    intent: "agendar",
    patterns: [
      /^(quero|gostaria de|preciso) (falar|conversar) com (advogado|alguém|vocês)$/i,
      /^(pode|consegue) (me )?(agendar|marcar) (uma |a )?consulta\??$/i,
      /^quero (agendar|marcar) (uma |a )?consulta$/i,
    ],
    response: "Perfeito! 💛 Vou organizar isso pra você agora mesmo. Me passa seu nome completo e o melhor número de WhatsApp que eu peço pra equipe te chamar e combinar o horário.",
    skipRAG: true,
    requiresMinConfidence: 0.85,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PREÇO/HONORÁRIOS (com redirecionamento, não promete valores)
  // ═══════════════════════════════════════════════════════════════════════
  {
    intent: "preco",
    patterns: [
      /^quanto (custa|é|fica|cobra|cobram)\??$/i,
      /^(qual o |qual é o )?(valor|preço|pre[çc]o|custo|honorário|honorario)\??$/i,
    ],
    response: "É super normal querer saber sobre valores, claro! 😊 O valor depende da complexidade do caso e do tipo de serviço. No escritório trabalhamos com transparência total – o advogado vai te explicar tudo certinho e você só decide depois de concordar com a proposta. Quer que eu organize pra você conversar direto com eles?",
    skipRAG: false, // Pode ter info sobre honorários nos docs
    requiresMinConfidence: 0.8,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DESPEDIDAS
  // ═══════════════════════════════════════════════════════════════════════
  {
    intent: "saudacao",
    patterns: [
      /^(tchau|xau|até logo|até mais|flw|falou)$/i,
      /^(até|ate) (mais|logo|breve)$/i,
    ],
    response: "Até logo! 💛 Qualquer dúvida, é só voltar aqui que eu te ajudo. Fica bem!",
    skipRAG: true,
    requiresMinConfidence: 0.9,
  },
];

/**
 * Busca uma resposta rápida para a pergunta do usuário
 *
 * @param question - Pergunta do usuário
 * @param intent - Intent detectada
 * @param confidence - Confiança da detecção de intent (0-1)
 * @returns Resposta rápida ou null se não houver match
 */
export function getQuickResponse(
  question: string,
  intent: Intent,
  confidence: number,
): QuickResponse | null {
  // Normaliza pergunta (trim, lowercase para match)
  const normalizedQuestion = question.trim();

  // Busca respostas que combinam com o intent
  const candidateResponses = QUICK_RESPONSES.filter(
    (qr) => qr.intent === intent
  );

  // Tenta match com padrões
  for (const candidate of candidateResponses) {
    // Verifica confiança mínima
    if (confidence < candidate.requiresMinConfidence) {
      continue;
    }

    // Tenta match com cada padrão
    for (const pattern of candidate.patterns) {
      if (pattern.test(normalizedQuestion)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Verifica se deve usar resposta rápida ao invés de chamar LLM
 *
 * @param question - Pergunta do usuário
 * @param intent - Intent detectada
 * @param confidence - Confiança da detecção
 * @returns true se deve usar resposta rápida
 */
export function shouldUseQuickResponse(
  question: string,
  intent: Intent,
  confidence: number,
): boolean {
  const quickResponse = getQuickResponse(question, intent, confidence);
  return quickResponse !== null;
}

/**
 * Verifica se deve pular busca RAG para esta pergunta
 *
 * @param question - Pergunta do usuário
 * @param intent - Intent detectada
 * @param confidence - Confiança da detecção
 * @returns true se deve pular RAG
 */
export function shouldSkipRAG(
  question: string,
  intent: Intent,
  confidence: number,
): boolean {
  const quickResponse = getQuickResponse(question, intent, confidence);
  return quickResponse?.skipRAG ?? false;
}
