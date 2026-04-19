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
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Temperatura = "quente" | "morno" | "frio";

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
    return `
      <div style="margin-bottom: 14px;">
        <p style="margin: 0 0 4px 0; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${label}</p>
        <p style="margin: 0; color: #1e293b; font-size: 15px; font-weight: 500; line-height: 1.5;">${value}</p>
      </div>`;
  };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Lead Sofia - ${lead.nome}</title>
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
        <a href="${whatsappLink}"
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
        <a href="${conversationLink}" style="color: #3b82f6; font-size: 13px; text-decoration: none;">
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
          lead.lead_id
            ? `<p style="margin: 12px 0 0 0; color: #94a3b8; font-size: 11px; font-family: monospace;">
          Lead ID: ${lead.lead_id}
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
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("[send-lead-notification] RESEND_API_KEY não configurada");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const lead: SofiaLeadPayload = await req.json();

    // Validação mínima — mesmo formato que o chat-agent usa pra criar lead
    if (!lead.nome || !lead.whatsapp || !lead.tipo_caso) {
      console.error("[send-lead-notification] Payload inválido:", lead);
      return new Response(JSON.stringify({ error: "Missing required fields: nome, whatsapp, tipo_caso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const temperatura = (lead.temperatura ?? "morno") as Temperatura;
    const style = TEMPERATURA_STYLE[temperatura] ?? TEMPERATURA_STYLE.morno;

    const resend = new Resend(resendApiKey);

    const from = Deno.env.get("NOTIFICATION_EMAIL_FROM") ?? "Sofia Legal AI <nao-responda@buenodiniz.com.br>";
    const to = Deno.env.get("NOTIFICATION_EMAIL_TO") ?? "contato@buenodiniz.com.br";

    const subject = `${style.emoji} Lead ${style.label} (Sofia): ${lead.nome} — ${lead.tipo_caso}`;

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html: buildEmailHtml({ ...lead, temperatura }),
    });

    if (error) {
      console.error("[send-lead-notification] Erro Resend:", error);
      return new Response(JSON.stringify({ error: "Failed to send email", details: error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log("[send-lead-notification] Email enviado:", {
      emailId: data?.id,
      lead_id: lead.lead_id,
      temperatura,
      nome: lead.nome,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: data?.id, lead_id: lead.lead_id ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-lead-notification] Erro inesperado:", message);
    return new Response(JSON.stringify({ error: "Internal server error", details: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
