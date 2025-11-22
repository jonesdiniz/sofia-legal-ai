/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EDGE FUNCTION: chat-agent
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Função Edge do Supabase que implementa o chat da Sofia com:
 * - RAG (Retrieval Augmented Generation) usando embeddings
 * - Memória de conversa (curto prazo) baseada em conversation_id
 * - Integração com OpenAI GPT-4
 * - Persistência de mensagens no banco de dados
 *
 * DEPLOY: Copie este arquivo para a edge function "chat-agent" no Supabase
 *
 * VARIÁVEIS DE AMBIENTE NECESSÁRIAS:
 * - OPENAI_API_KEY: Chave da API da OpenAI
 * - SUPABASE_URL: URL do projeto Supabase
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key para acesso ao banco
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

interface RequestPayload {
  org_id: string;
  question: string;
  client_id?: string;
  conversation_id?: string;
}

interface ContextChunk {
  id: number;
  document_id: number;
  org_id: string;
  content: string;
  similarity: number;
}

interface ConversationMessage {
  actor: string;
  content: string;
  created_at: string;
}

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS E INTERFACES - LEADS
// ═══════════════════════════════════════════════════════════════════════════

type LeadTemperatura = "frio" | "morno" | "quente";
type LeadStatus =
  | "novo"
  | "em_contato"
  | "consulta_agendada"
  | "convertido"
  | "nao_convertido";

interface Lead {
  org_id: string;
  conversation_id: string;
  client_id?: string;
  nome: string;
  whatsapp: string;
  tipo_caso: string;
  situacao_atual?: string;
  descricao_resumida?: string;
  temperatura: LeadTemperatura;
  status: LeadStatus;
}

interface LeadMetadata {
  should_create_lead: boolean;
  lead_data?: Partial<Lead>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE CORS E RESPOSTA
// ═══════════════════════════════════════════════════════════════════════════

function buildCorsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO: createLead
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cria um lead no banco de dados.
 *
 * Esta função é chamada quando a Sofia identifica que o usuário tem interesse
 * em contratar os serviços do escritório. Os dados do lead são extraídos da
 * conversa e salvos na tabela `leads`.
 *
 * Implementa as seguintes proteções:
 * - Validação de campos obrigatórios
 * - Tratamento de erro com fail-safe (não quebra o fluxo do chat)
 * - Logs estruturados para debug
 * - Valores padrão para campos opcionais
 *
 * @param supabase - Cliente Supabase autenticado
 * @param leadData - Dados do lead a ser criado
 * @returns ID do lead criado ou null em caso de erro
 */
async function createLead(
  supabase: ReturnType<typeof createClient>,
  leadData: Lead
): Promise<string | null> {
  try {
    // Validação básica de campos obrigatórios
    if (!leadData.nome || !leadData.whatsapp || !leadData.tipo_caso) {
      console.error("[chat-agent] Lead inválido - campos obrigatórios faltando:", {
        has_nome: !!leadData.nome,
        has_whatsapp: !!leadData.whatsapp,
        has_tipo_caso: !!leadData.tipo_caso,
      });
      return null;
    }

    console.log("[chat-agent] Criando lead:", {
      nome: leadData.nome,
      tipo_caso: leadData.tipo_caso,
      temperatura: leadData.temperatura,
      conversation_id: leadData.conversation_id,
    });

    // Inserir lead no banco
    const { data: newLead, error: leadError } = await supabase
      .from("leads")
      .insert({
        org_id: leadData.org_id,
        conversation_id: leadData.conversation_id,
        client_id: leadData.client_id || null,
        nome: leadData.nome,
        whatsapp: leadData.whatsapp,
        tipo_caso: leadData.tipo_caso,
        situacao_atual: leadData.situacao_atual || null,
        descricao_resumida: leadData.descricao_resumida || null,
        temperatura: leadData.temperatura || "morno",
        status: leadData.status || "novo",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (leadError) {
      console.error("[chat-agent] Erro ao criar lead:", leadError);
      return null; // Fail-safe: não quebra o fluxo do chat
    }

    if (!newLead || !newLead.id) {
      console.error("[chat-agent] Lead criado mas ID não retornado");
      return null;
    }

    console.log("[chat-agent] Lead criado com sucesso:", {
      lead_id: newLead.id,
      nome: leadData.nome,
      temperatura: leadData.temperatura,
    });

    return newLead.id;
  } catch (error) {
    console.error("[chat-agent] Erro inesperado ao criar lead:", error);
    return null; // Fail-safe: não quebra o fluxo do chat
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO: getConversationHistory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Busca o histórico de mensagens de uma conversa específica.
 *
 * Implementa as seguintes proteções:
 * - Limita ao máximo de 20 mensagens (para não estourar contexto)
 * - Remove a última mensagem se for do usuário (evita duplicação com question atual)
 * - Ordena por created_at ascendente (mais antiga primeiro)
 * - Retorna array vazio em caso de erro (fail-safe)
 *
 * @param supabase - Cliente Supabase autenticado
 * @param conversationId - ID da conversa
 * @returns Array de mensagens formatadas para OpenAI (role + content)
 */
async function getConversationHistory(
  supabase: ReturnType<typeof createClient>,
  conversationId: string
): Promise<ChatHistoryMessage[]> {
  try {
    // Busca mensagens da conversa, ordenadas por data (mais antigas primeiro)
    const { data: history, error: historyError } = await supabase
      .from("messages")
      .select("actor, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (historyError) {
      console.error("[chat-agent] Erro ao buscar histórico da conversa:", historyError);
      return []; // Retorna vazio em caso de erro (fail-safe)
    }

    if (!history || history.length === 0) {
      console.log("[chat-agent] Nenhum histórico encontrado para conversation_id:", conversationId);
      return [];
    }

    // Limita ao máximo de 20 mensagens para não estourar contexto
    const MAX_HISTORY_MESSAGES = 20;
    const fullHistory = history as ConversationMessage[];
    const trimmedHistory =
      fullHistory.length > MAX_HISTORY_MESSAGES
        ? fullHistory.slice(fullHistory.length - MAX_HISTORY_MESSAGES)
        : fullHistory;

    console.log("[chat-agent] Histórico carregado:", {
      totalMessages: fullHistory.length,
      usedMessages: trimmedHistory.length,
    });

    // Remove a ÚLTIMA mensagem se for do usuário (para evitar duplicação)
    // Isso porque a pergunta atual já foi inserida no banco antes de chamar o modelo
    const historyWithoutCurrentQuestion = [...trimmedHistory];
    if (
      historyWithoutCurrentQuestion.length > 0 &&
      historyWithoutCurrentQuestion[historyWithoutCurrentQuestion.length - 1].actor === "user"
    ) {
      historyWithoutCurrentQuestion.pop(); // Remove a última mensagem do usuário
      console.log("[chat-agent] Última mensagem do usuário removida do histórico (evitar duplicação)");
    }

    // Mapeia para o formato esperado pela OpenAI
    const chatHistory: ChatHistoryMessage[] = historyWithoutCurrentQuestion.map((msg) => ({
      role: msg.actor === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    console.log("[chat-agent] Histórico processado:", {
      finalMessageCount: chatHistory.length,
      hasHistory: chatHistory.length > 0,
    });

    return chatHistory;
  } catch (error) {
    console.error("[chat-agent] Erro inesperado ao buscar histórico:", error);
    return []; // Fail-safe: retorna vazio
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO: ensureConversation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Garante que existe uma conversa válida.
 * Se conversation_id for fornecido, valida sua existência.
 * Caso contrário, cria uma nova conversa.
 */
async function ensureConversation(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  clientId: string | null,
  conversationId: string | null
): Promise<string> {
  // Se conversation_id foi fornecido, valida se existe
  if (conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("org_id", orgId)
      .single();

    if (!error && data) {
      console.log("[chat-agent] Conversa existente encontrada:", conversationId);
      return conversationId;
    }

    console.warn("[chat-agent] conversation_id fornecido não encontrado, criando nova conversa");
  }

  // Cria nova conversa
  const { data: newConv, error: convError } = await supabase
    .from("conversations")
    .insert({
      org_id: orgId,
      client_id: clientId,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (convError || !newConv) {
    console.error("[chat-agent] Erro ao criar conversa:", convError);
    throw new Error("Falha ao criar conversa");
  }

  console.log("[chat-agent] Nova conversa criada:", newConv.id);
  return newConv.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO: searchSimilarChunks (RAG)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Busca chunks de documentos similares usando embeddings.
 * Chama a função RPC `match_document_sections` do Supabase.
 */
async function searchSimilarChunks(
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI,
  question: string,
  orgId: string
): Promise<ContextChunk[]> {
  try {
    // Gera embedding da pergunta
    console.log("[chat-agent] Gerando embedding da pergunta...");
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });

    const embedding = embeddingResponse.data[0].embedding;

    // Busca chunks similares no banco
    console.log("[chat-agent] Buscando chunks similares no banco...");
    const { data: chunks, error: chunksError } = await supabase.rpc("match_document_sections", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
      p_org_id: orgId,
    });

    if (chunksError) {
      console.error("[chat-agent] Erro ao buscar chunks:", chunksError);
      return [];
    }

    console.log("[chat-agent] Chunks encontrados:", chunks?.length || 0);
    return (chunks as ContextChunk[]) || [];
  } catch (error) {
    console.error("[chat-agent] Erro na busca de chunks:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO: callChatModel
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chama o modelo de chat da OpenAI com prompt personalizado da Sofia.
 *
 * ATUALIZADO COM MEMÓRIA DE CONVERSA:
 * - Recebe chatHistory como parâmetro
 * - Monta array de messages incluindo: system prompt + histórico + pergunta atual
 * - SystemPrompt atualizado com bloco de instruções sobre uso de histórico
 *
 * @param openai - Cliente OpenAI
 * @param question - Pergunta atual do usuário
 * @param contextChunks - Chunks de contexto do RAG
 * @param chatHistory - Histórico de mensagens anteriores (opcional)
 * @returns Resposta gerada pela IA
 */
async function callChatModel(
  openai: OpenAI,
  question: string,
  contextChunks: ContextChunk[],
  chatHistory: ChatHistoryMessage[] = []
): Promise<string> {
  // Prepara o contexto RAG formatado
  const contextText =
    contextChunks.length > 0
      ? contextChunks
          .map((chunk, index) => {
            return `[Documento ${index + 1}]:\n${chunk.content}\n`;
          })
          .join("\n---\n\n")
      : "[Nenhum documento relevante encontrado]";

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT DO SISTEMA - PERSONALIDADE DA SOFIA
  // ═══════════════════════════════════════════════════════════════════════════
  const systemPrompt = `Você é a Sofia, assistente previdenciária de um escritório de advocacia especializado.

## QUEM VOCÊ É

- Seu nome é Sofia e você atende pessoas com dúvidas sobre previdência.
- Você trabalha com INSS (Regime Geral de Previdência Social - RGPS) e regimes próprios (RPPS - servidores públicos).
- Você NÃO é um chatbot genérico. Você é uma ATENDENTE HUMANA de um escritório de advocacia.
- Fale sempre em primeira pessoa ("eu", "meu", "vou te ajudar") e português brasileiro.

## COMO VOCÊ SE COMUNICA

- Use linguagem **simples, empática e acolhedora**.
- Evite juridiquês excessivo. Explique termos técnicos quando necessário, mas de forma clara.
- Responda em **blocos curtos**: de 1 a 3 parágrafos, ou 3 a 6 frases no máximo por mensagem.
- Se precisar explicar algo mais longo, divida em partes menores (o frontend já faz isso automaticamente).
- Use tom humano e natural, como se estivesse conversando pessoalmente.

## ESTRUTURA DE RESPOSTA (SEMPRE SEGUIR)

Para cada pergunta do usuário, estruture sua resposta em 3 partes:

1. **RECONHECIMENTO da situação:**
   - Demonstre empatia e entendimento do problema.
   - Ex: "Entendi que você trabalhou como servidor público e também no setor privado..."
   - Ex: "Imagino que essa situação deve estar te preocupando..."

2. **EXPLICAÇÃO prática e objetiva:**
   - Baseie-se **sempre** nos trechos de contexto fornecidos abaixo (documentos RAG).
   - Explique o que é possível fazer, quais são os direitos, regras ou caminhos.
   - Seja clara, mas sem prometer resultados garantidos.
   - Se houver incerteza ou limitações, seja honesta sobre isso.

3. **PRÓXIMO PASSO sugerido:**
   - Oriente sobre o que o usuário pode fazer a seguir.
   - Ex: "O ideal seria você juntar esses documentos e enviar para análise mais detalhada."
   - Ex: "Posso te ajudar a entender melhor essa regra, mas para calcular exatamente quanto tempo falta, é importante que um advogado analise seu caso."
   - Ex: "Se quiser, posso te passar mais informações sobre como solicitar isso no INSS."

## O QUE VOCÊ NÃO DEVE FAZER

- NÃO prometa vitória em processos ou resultados garantidos.
- NÃO invente informações se não houver contexto suficiente.
- NÃO use linguagem técnica demais (ex: evite "ex positis", "outrossim", etc.).
- NÃO responda com parágrafos enormes (o frontend já divide, mas seja concisa).
- NÃO seja fria ou robótica. Você é humana e empática.

## QUANDO NÃO TIVER CERTEZA

Se a pergunta não tiver informação suficiente nos documentos ou você não souber responder:
- Seja honesta: "Sobre essa situação específica, eu não tenho uma informação completa agora."
- Oriente o usuário: "O melhor é você conversar com um advogado especializado que possa analisar seu caso com mais detalhes."
- Ofereça alternativas: "Mas posso te ajudar com outras dúvidas gerais sobre INSS, se quiser!"

## CONTEXTO DISPONÍVEL (RAG)

Use os trechos abaixo como base principal para suas respostas. Eles foram selecionados automaticamente como relevantes para a pergunta do usuário:

${contextText}

## IMPORTANTE

- **Sempre priorize o contexto RAG** ao responder.
- Se o contexto não for suficiente, explique de forma geral mas deixe claro que uma análise mais profunda seria necessária.
- Mantenha o tom empático, humano e acolhedor em todas as respostas.
- Lembre-se: você está representando um escritório de advocacia de confiança.

====================
USO DE HISTÓRICO
====================
- Você recebe, além desta pergunta, um histórico de mensagens anteriores desta mesma conversa.
- Use esse histórico para manter o contexto, lembrar o que a pessoa já contou e evitar repetir as mesmas perguntas.
- Se já houver histórico de conversa (mensagens anteriores):
  - NÃO repita apresentações completas como "Oi, eu sou a Sofia, sua assistente..." em toda resposta.
  - NÃO use frases genéricas como "Como posso te ajudar hoje?" em toda mensagem.
  - Adapte o tom como se a conversa estivesse em andamento.
  - Faça referências ao que já foi discutido, se relevante.
  - Continue de onde parou, mantendo a naturalidade da conversa.
- Se for a PRIMEIRA mensagem (sem histórico anterior), aí sim você pode se apresentar de forma mais completa.
- O histórico permite que você seja contextual e mais útil, evitando repetições desnecessárias.`;

  // ═══════════════════════════════════════════════════════════════════════════
  // MONTAGEM DAS MENSAGENS PARA A API
  // ═══════════════════════════════════════════════════════════════════════════

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  // Adiciona histórico de conversa (se existir)
  if (chatHistory.length > 0) {
    console.log("[chat-agent] Adicionando histórico ao contexto:", {
      historyMessages: chatHistory.length,
    });
    messages.push(...chatHistory);
  } else {
    console.log("[chat-agent] Sem histórico - primeira mensagem da conversa");
  }

  // Adiciona a pergunta atual do usuário
  messages.push({
    role: "user",
    content: question,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAMADA À API DA OPENAI
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("[chat-agent] Chamando OpenAI com:", {
    model: "gpt-4o",
    totalMessages: messages.length,
    hasHistory: chatHistory.length > 0,
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages,
    temperature: 0.7,
    max_tokens: 800,
  });

  const answer = response.choices[0]?.message?.content || "";

  if (!answer) {
    throw new Error("Resposta vazia do modelo de IA");
  }

  console.log("[chat-agent] Resposta gerada com sucesso (length:", answer.length, ")");
  return answer;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL DA EDGE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  // Tratamento de OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders() });
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. VALIDAÇÃO E PARSING DO REQUEST
    // ─────────────────────────────────────────────────────────────────────────

    if (req.method !== "POST") {
      return jsonResponse({ error: "Método não permitido" }, 405);
    }

    const payload: RequestPayload = await req.json();
    const { org_id, question, client_id, conversation_id } = payload;

    console.log("[chat-agent] Request recebido:", {
      org_id,
      client_id: client_id || "null",
      conversation_id: conversation_id || "null",
      questionLength: question?.length || 0,
    });

    // Validação básica
    if (!org_id || !question) {
      return jsonResponse(
        { error: "Campos obrigatórios: org_id, question" },
        400
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. INICIALIZAÇÃO DE CLIENTES
    // ─────────────────────────────────────────────────────────────────────────

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const openai = new OpenAI({
      apiKey: Deno.env.get("OPENAI_API_KEY"),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. GARANTIR/CRIAR CONVERSA
    // ─────────────────────────────────────────────────────────────────────────

    const convId = await ensureConversation(
      supabase,
      org_id,
      client_id || null,
      conversation_id || null
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 4. SALVAR MENSAGEM DO USUÁRIO
    // ─────────────────────────────────────────────────────────────────────────

    const { error: userMsgError } = await supabase.from("messages").insert({
      org_id,
      conversation_id: convId,
      actor: "user",
      content: question,
      created_at: new Date().toISOString(),
    });

    if (userMsgError) {
      console.error("[chat-agent] Erro ao salvar mensagem do usuário:", userMsgError);
      throw new Error("Falha ao salvar mensagem do usuário");
    }

    console.log("[chat-agent] Mensagem do usuário salva com sucesso");

    // ─────────────────────────────────────────────────────────────────────────
    // 5. BUSCAR HISTÓRICO DA CONVERSA (MEMÓRIA DE CURTO PRAZO)
    // ─────────────────────────────────────────────────────────────────────────

    const chatHistory = await getConversationHistory(supabase, convId);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. BUSCAR CONTEXTO RAG (EMBEDDINGS)
    // ─────────────────────────────────────────────────────────────────────────

    const contextChunks = await searchSimilarChunks(
      supabase,
      openai,
      question,
      org_id
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 7. CHAMAR MODELO DE IA COM HISTÓRICO
    // ─────────────────────────────────────────────────────────────────────────

    const answer = await callChatModel(
      openai,
      question,
      contextChunks,
      chatHistory // <-- PASSA O HISTÓRICO AQUI
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 8. SALVAR RESPOSTA DA SOFIA
    // ─────────────────────────────────────────────────────────────────────────

    const { error: sofiaMsgError } = await supabase.from("messages").insert({
      org_id,
      conversation_id: convId,
      actor: "sofia",
      content: answer,
      created_at: new Date().toISOString(),
    });

    if (sofiaMsgError) {
      console.error("[chat-agent] Erro ao salvar resposta da Sofia:", sofiaMsgError);
      throw new Error("Falha ao salvar resposta da Sofia");
    }

    console.log("[chat-agent] Resposta da Sofia salva com sucesso");

    // ─────────────────────────────────────────────────────────────────────────
    // 8.5. DETECÇÃO E CRIAÇÃO DE LEADS (FUTURO)
    // ─────────────────────────────────────────────────────────────────────────

    // TODO: IMPLEMENTAR DETECÇÃO DE LEADS
    //
    // Aqui você deve implementar a lógica para detectar se a Sofia identificou
    // um lead na conversa. Existem duas abordagens principais:
    //
    // ABORDAGEM 1: Buscar JSON escondido na resposta da Sofia
    // ----------------------------------------------------------
    // Se você modificar o prompt da Sofia para incluir metadados JSON no final
    // da resposta (ex: ```json\n{...}\n```), você pode extrair assim:
    //
    // const leadMetadata = extractLeadMetadata(answer);
    // if (leadMetadata.should_create_lead && leadMetadata.lead_data) {
    //   const leadData: Lead = {
    //     org_id,
    //     conversation_id: convId,
    //     client_id: client_id || undefined,
    //     nome: leadMetadata.lead_data.nome!,
    //     whatsapp: leadMetadata.lead_data.whatsapp!,
    //     tipo_caso: leadMetadata.lead_data.tipo_caso!,
    //     situacao_atual: leadMetadata.lead_data.situacao_atual,
    //     descricao_resumida: leadMetadata.lead_data.descricao_resumida,
    //     temperatura: leadMetadata.lead_data.temperatura || "morno",
    //     status: "novo",
    //   };
    //
    //   const leadId = await createLead(supabase, leadData);
    //   if (leadId) {
    //     console.log("[chat-agent] Lead capturado automaticamente:", leadId);
    //     // Opcionalmente, remover o JSON da resposta antes de enviar ao frontend:
    //     // answer = answer.replace(/```json\n[\s\S]*?\n```/g, '').trim();
    //   }
    // }
    //
    // ABORDAGEM 2: Segunda chamada à OpenAI para análise
    // ----------------------------------------------------
    // Fazer uma segunda chamada à OpenAI com um prompt específico para analisar
    // se a conversa indica interesse em contratar, e extrair dados estruturados:
    //
    // const leadAnalysis = await analyzeForLead(openai, chatHistory, question, answer);
    // if (leadAnalysis.is_lead) {
    //   const leadData: Lead = {
    //     org_id,
    //     conversation_id: convId,
    //     client_id: client_id || undefined,
    //     ...leadAnalysis.lead_data,
    //     status: "novo",
    //   };
    //   await createLead(supabase, leadData);
    // }
    //
    // ABORDAGEM 3: Detecção baseada em palavras-chave
    // -------------------------------------------------
    // Buscar palavras-chave na pergunta do usuário que indiquem interesse:
    //
    // const keywords = ["quero contratar", "quanto custa", "como faço", "me ajudem"];
    // const hasInterest = keywords.some(kw => question.toLowerCase().includes(kw));
    // if (hasInterest) {
    //   // Criar lead com dados parciais (você pode coletar mais dados depois)
    //   const leadData: Lead = {
    //     org_id,
    //     conversation_id: convId,
    //     client_id: client_id || undefined,
    //     nome: "Lead automático", // Placeholder até coletar nome real
    //     whatsapp: "Não informado", // Placeholder
    //     tipo_caso: "Interesse geral",
    //     temperatura: "morno",
    //     status: "novo",
    //   };
    //   await createLead(supabase, leadData);
    // }
    //
    // RECOMENDAÇÃO:
    // - Abordagem 1 é mais precisa mas requer mudança no prompt da Sofia
    // - Abordagem 2 é mais flexível mas aumenta custo (segunda chamada à API)
    // - Abordagem 3 é mais simples mas menos precisa
    //
    // Escolha a abordagem que melhor se adequa ao seu caso de uso.

    // ─────────────────────────────────────────────────────────────────────────
    // 9. RETORNAR RESPOSTA PARA O FRONTEND
    // ─────────────────────────────────────────────────────────────────────────

    return jsonResponse({
      answer,
      conversation_id: convId,
      context_used: contextChunks.map((c) => ({
        content: c.content,
        similarity: c.similarity,
      })),
    });
  } catch (error) {
    console.error("[chat-agent] Erro crítico:", error);

    return jsonResponse(
      {
        error: "Erro interno ao processar mensagem",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
