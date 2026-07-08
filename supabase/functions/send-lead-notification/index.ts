/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EDGE FUNCTION: send-lead-notification (Sofia Legal AI)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Envia notificação por email sempre que a Sofia captura um lead (tabela
 * `leads` do projeto Sofia Legal AI). O formato do email é diferente do
 * gatilho de formulário de contato: aqui destacamos temperatura, tipo de
 * caso, situação atual e a descrição resumida que a Sofia construiu.
 *
 * Chamada em "fire-and-forget" pelo chat-agent logo após createLead()
 * retornar um ID válido. Se esta function falhar, o lead continua no
 * banco — só não dispara o email.
 *
 * VARIÁVEIS DE AMBIENTE NECESSÁRIAS:
 * - RESEND_API_KEY: Key da Resend (mesmo provedor usado no site institucional)
 * - NOTIFICATION_EMAIL_TO (opcional): override do destinatário.
 *   Padrão: contato@buenodiniz.com.br
 * - NOTIFICATION_EMAIL_FROM (opcional): override do remetente.
 *   Padrão: "Sofia Legal AI <nao-responda@buenodiniz.com.br>"
 * - SOFIA_INTERNAL_FUNCTION_SECRET: segredo compartilhado com o chat-agent.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

type Temperatura = "quente" | "morno" | "frio";

const ALLOWED_ORIGINS = new Set([
  "https://www.buenodiniz.com.br",
  "https://buenodiniz.com.br",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8080",
]);

const DEFAULT_CORS_ORIGIN = "https://www.buenodiniz.com.br";
const MAX_TEXT_LENGTH = 500;

function getCorsOrigin(req?: Request): string {
  const origin = req?.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return DEFAULT_CORS_ORIGIN;
}

function corsHeadersFor(req?: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sofia-internal-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
    status,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function requireInternalSecret(req: Request): boolean {
  const expectedSecret = Deno.env.get("SOFIA_INTERNAL_FUNCTION_SECRET");
  if (!expectedSecret) {
    console.error("[send-lead-notification] SOFIA_INTERNAL_FUNCTION_SECRET não configurado");
    return false;
  }
  return req.headers.get("x-sofia-internal-secret") === expectedSecret;
}

interface SofiaLeadPayload {
  nome: string;
  whatsapp: string;
  tipo_caso: string;
  temperatura: Temperatura;
  situacao_atual?: string | null;
  descricao_resumida?: string | null;
  melhor_horario_contato?: string | null;
  canal_preferido?: string | null;
  cidade_uf?: string | null;
  conversation_id?: string | null;
  lead_id?: string | null;
  score?: number | null;
  sentiment?: string | null;
  urgency?: string | null;
}

function sanitizeLeadPayload(raw: unknown): SofiaLeadPayload | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;
  const nome = safeText(source.nome, 120);
  const whatsapp = safeText(source.whatsapp, 40);
  const tipo_caso = safeText(source.tipo_caso, 160);

  if (!nome || !whatsapp || !tipo_caso) return null;

  const temperaturaRaw = safeText(source.temperatura, 20);
  const temperatura: Temperatura =
    temperaturaRaw === "quente" || temperaturaRaw === "morno" || temperaturaRaw === "frio"
      ? temperaturaRaw
      : "morno";

  const score = typeof source.score === "number" && Number.isFinite(source.score)
    ? Math.max(0, Math.min(100, source.score))
    : null;

  return {
    nome,
    whatsapp,
    tipo_caso,
    temperatura,
    situacao_atual: safeText(source.situacao_atual, 800) ?? null,
    descricao_resumida: safeText(source.descricao_resumida, 1000) ?? null,
    melhor_horario_contato: safeText(source.melhor_horario_contato, 120) ?? null,
    canal_preferido: safeText(source.canal_preferido, 80) ?? null,
    cidade_uf: safeText(source.cidade_uf, 120) ?? null,
    conversation_id: safeText(source.conversation_id, 80) ?? null,
    lead_id: safeText(source.lead_id, 80) ?? null,
    score,
    sentiment: safeText(source.sentiment, 80) ?? null,
    urgency: safeText(source.urgency, 80) ?? null,
  };
}

/** Configurações visuais por temperatura (emoji + cor + rótulo) */
const TEMPERATURA_STYLE: Record<Temperatura, { emoji: string; color: string; bg: string; label: string }> = {
  quente: { emoji: "🔥", color: "#dc2626", bg: "#fef2f2", label: "QUENTE" },
  morno: { emoji: "🌡️", color: "#d97706", bg: "#fffbeb", label: "MORNO" },
  frio: { emoji: "❄️", color: "#2563eb", bg: "#eff6ff", label: "FRIO" },
};

/** Monta link WhatsApp (wa.me) com mensagem pré-formatada baseada no lead */
function buildWhatsAppLink(lead: SofiaLeadPayload): string {
  const cleanPhone = lead.whatsapp.replace(/\D/g, "");
  // Garante prefixo 55 se for número brasileiro sem o country code
  const phoneWithDDI = cleanPhone.length === 11 || cleanPhone.length === 10
    ? `55${cleanPhone}`
    : cleanPhone;

  const greeting = `Olá, ${lead.nome.split(" ")[0] || lead.nome}! Aqui é do escritório Bueno Diniz. ` +
    `Recebi o seu contato agora pela Sofia sobre ${lead.tipo_caso.toLowerCase()}. ` +
    `Como posso te ajudar?`;

  return `https://wa.me/${phoneWithDDI}?text=${encodeURIComponent(greeting)}`;
}

/** Link pro dashboard do Supabase pra abrir a conversa original (opcional) */
function buildSupabaseConversationLink(lead: SofiaLeadPayload): string | null {
  if (!lead.conversation_id) return null;
  const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") ?? "zleirutbehcqzmlqtmsk";
  return `https://supabase.com/dashboard/project/${projectRef}/editor?filter=conversation_id=eq.${lead.conversation_id}`;
}

/** Monta HTML do email */
function buildEmailHtml(lead: SofiaLeadPayload): string {
  const style = TEMPERATURA_STYLE[lead.temperatura] ?? TEMPERATURA_STYLE.morno;
  const whatsappLink = buildWhatsAppLink(lead);
  const conversationLink = buildSupabaseConversationLink(lead);

  const row = (label: string, value: string | null | undefined): string => {
    if (!value) return "";
    const safeLabel = escapeHtml(label);
    const safeValue = escapeHtml(value);
    return `
      <div style="margin-bottom: 14px;">
        <p style="margin: 0 0 4px 0; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${safeLabel}</p>
        <p style="margin: 0; color: #1e293b; font-size: 15px; font-weight: 500; line-height: 1.5;">${safeValue}</p>
      </div>`;
  };

  const safeName = escapeHtml(lead.nome);
  const safeWhatsappLink = escapeHtml(whatsappLink);
  const safeConversationLink = conversationLink ? escapeHtml(conversationLink) : null;
  const safeLeadId = lead.lead_id ? escapeHtml(lead.lead_id) : null;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Lead Sofia - ${safeName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a2236 0%, #2d3e63 100%); padding: 36px 30px; text-align: center;">
      <div style="display: inline-block; background-color: ${style.bg}; color: ${style.color}; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 12px;">
        ${style.emoji} LEAD ${style.label}
      </div>
      <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">Novo lead capturado pela Sofia</h1>
      <p style="margin: 8px 0 0 0; color: #cbd5e1; font-size: 14px;">Chatbot do site • Bueno Diniz Advocacia</p>
    </div>

    <!-- Content -->
    <div style="padding: 36px 30px;">

      <!-- Quem é a pessoa -->
      <div style="background-color: #f8fafc; border-left: 4px solid ${style.color}; padding: 22px; margin-bottom: 24px; border-radius: 8px;">
        <h2 style="margin: 0 0 18px 0; color: #1e293b; font-size: 18px; font-weight: 600;">Quem entrou em contato</h2>
        ${row("Nome", lead.nome)}
        ${row("WhatsApp", lead.whatsapp)}
        ${row("Cidade / UF", lead.cidade_uf)}
        ${row("Melhor horário de contato", lead.melhor_horario_contato)}
        ${row("Canal preferido", lead.canal_preferido)}
      </div>

      <!-- O que a pessoa quer -->
      <div style="background-color: #f8fafc; border-left: 4px solid #0f766e; padding: 22px; margin-bottom: 24px; border-radius: 8px;">
        <h2 style="margin: 0 0 18px 0; color: #1e293b; font-size: 18px; font-weight: 600;">O caso</h2>
        ${row("Tipo de caso", lead.tipo_caso)}
        ${row("Situação atual", lead.situacao_atual)}
        ${row("Resumo da conversa (pela Sofia)", lead.descricao_resumida)}
      </div>

      ${
        lead.sentiment || lead.urgency || lead.score !== undefined && lead.score !== null
          ? `
      <!-- Sinais da Sofia -->
      <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 22px; margin-bottom: 24px; border-radius: 8px;">
        <h2 style="margin: 0 0 18px 0; color: #1e293b; font-size: 18px; font-weight: 600;">Sinais detectados pela Sofia</h2>
        ${row("Emoção predominante", lead.sentiment ?? null)}
        ${row("Urgência", lead.urgency ?? null)}
        ${row("Score interno", typeof lead.score === "number" ? String(lead.score) : null)}
      </div>
      `
          : ""
      }

      <!-- CTA WhatsApp -->
      <div style="text-align: center; margin: 36px 0 20px 0;">
        <a href="${safeWhatsappLink}"
           style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
          📱 Chamar no WhatsApp agora
        </a>
        <p style="margin: 10px 0 0 0; color: #64748b; font-size: 12px;">
          Link com saudação pré-preenchida
        </p>
      </div>

      ${
        conversationLink
          ? `
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${safeConversationLink}" style="color: #3b82f6; font-size: 13px; text-decoration: none;">
          Ver conversa completa no painel →
        </a>
      </div>
      `
          : ""
      }

      <!-- Footer -->
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
          Lead capturado pela <strong style="color: #1e293b;">Sofia</strong> no chat do site<br>
          <strong style="color: #1e293b;">buenodiniz.com.br</strong>
        </p>
        ${
          safeLeadId
            ? `<p style="margin: 12px 0 0 0; color: #94a3b8; font-size: 11px; font-family: monospace;">
          Lead ID: ${safeLeadId}
        </p>`
            : ""
        }
      </div>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersFor(req), status: 200 });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    if (!requireInternalSecret(req)) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("[send-lead-notification] RESEND_API_KEY não configurada");
      return jsonResponse(req, { error: "Email service not configured" }, 500);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      return jsonResponse(req, { error: "Invalid JSON payload" }, 400);
    }

    const lead = sanitizeLeadPayload(rawPayload);
    if (!lead) {
      console.error("[send-lead-notification] Payload inválido");
      return jsonResponse(req, { error: "Missing required fields: nome, whatsapp, tipo_caso" }, 400);
    }

    const style = TEMPERATURA_STYLE[lead.temperatura] ?? TEMPERATURA_STYLE.morno;

    const resend = new Resend(resendApiKey);

    const from = Deno.env.get("NOTIFICATION_EMAIL_FROM") ?? "Sofia Legal AI <nao-responda@buenodiniz.com.br>";
    const to = Deno.env.get("NOTIFICATION_EMAIL_TO") ?? "contato@buenodiniz.com.br";

    const subject = `${style.emoji} Lead ${style.label} (Sofia): ${lead.nome} - ${lead.tipo_caso}`;

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html: buildEmailHtml(lead),
    });

    if (error) {
      console.error("[send-lead-notification] Erro Resend:", error);
      return jsonResponse(req, { error: "Failed to send email" }, 500);
    }

    console.log("[send-lead-notification] Email enviado:", {
      emailId: data?.id,
      lead_id: lead.lead_id,
      temperatura: lead.temperatura,
    });

    return jsonResponse(req, { success: true, emailId: data?.id, lead_id: lead.lead_id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-lead-notification] Erro inesperado:", message);
    return jsonResponse(req, { error: "Internal server error" }, 500);
  }
});
