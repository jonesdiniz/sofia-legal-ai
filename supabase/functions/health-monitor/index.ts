/**
 * Health Monitor Edge Function
 *
 * Executa verificações de saúde do sistema periodicamente
 * Gera alertas quando métricas ultrapassam thresholds
 *
 * Agendamento: A cada 5 minutos via Supabase Cron
 * Requer header x-sofia-internal-secret com SOFIA_INTERNAL_FUNCTION_SECRET.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = new Set([
  "https://www.buenodiniz.com.br",
  "https://buenodiniz.com.br",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8080",
]);

const DEFAULT_CORS_ORIGIN = "https://www.buenodiniz.com.br";

function getCorsOrigin(req?: Request): string {
  const origin = req?.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return DEFAULT_CORS_ORIGIN;
}

function corsHeadersFor(req?: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-sofia-internal-secret",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function requireInternalSecret(req: Request): boolean {
  const expectedSecret = Deno.env.get("SOFIA_INTERNAL_FUNCTION_SECRET");
  if (!expectedSecret) {
    console.error("[Health Monitor] SOFIA_INTERNAL_FUNCTION_SECRET não configurado");
    return false;
  }
  return req.headers.get("x-sofia-internal-secret") === expectedSecret;
}

interface HealthCheckResponse {
  timestamp: string;
  metrics: {
    error_rate: number;
    avg_latency_ms: number;
    conversion_rate: number;
    rag_no_chunks_pct: number;
  };
  alerts_created: boolean;
  status: 'healthy' | 'warning' | 'critical';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersFor(req), status: 200 });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { success: false, error: "Method not allowed" }, 405);
  }

  if (!requireInternalSecret(req)) {
    return jsonResponse(req, { success: false, error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("[Health Monitor] Executando health check...");

    // Executa verificação de saúde
    const { data: healthCheckResult, error: healthCheckError } = await supabase
      .rpc("run_health_check");

    if (healthCheckError) {
      console.error("[Health Monitor] Erro ao executar health check:", healthCheckError);
      throw healthCheckError;
    }

    const result = healthCheckResult as HealthCheckResponse;

    console.log("[Health Monitor] Health check completo:", {
      status: result.status,
      metrics: result.metrics,
      alerts_created: result.alerts_created,
    });

    // Se alertas foram criados, busca os não resolvidos
    let unresolved_alerts = [];
    if (result.alerts_created) {
      const { data: alerts, error: alertsError } = await supabase
        .rpc("get_unresolved_alerts");

      if (!alertsError && alerts) {
        unresolved_alerts = alerts;
        console.log(`[Health Monitor] ${alerts.length} alertas não resolvidos`);

        // TODO: Enviar notificações (Slack, Email, etc)
        // Para implementar:
        // - Integração com Slack webhook
        // - Email via SendGrid/Resend
        // - SMS via Twilio para alertas críticos
      }
    }

    return jsonResponse(req, {
      success: true,
      health_check: result,
      unresolved_alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Health Monitor] Erro fatal:", error);
    return jsonResponse(req, {
      success: false,
      error: "Internal server error",
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * Para agendar esta função via Supabase Cron:
 *
 * 1. Acesse o Supabase Dashboard
 * 2. Vá em Database → Extensions
 * 3. Habilite a extensão "pg_cron"
 * 4. Execute no SQL Editor:
 *
 * SELECT cron.schedule(
 *   'health-monitor-check',
 *   ('*' || '/5 * * * *'), -- A cada 5 minutos
 *   $$
 *   SELECT net.http_post(
 *     url := 'https://seu-projeto.supabase.co/functions/v1/health-monitor',
 *     headers := '{
 *       "Content-Type": "application/json",
 *       "Authorization": "Bearer YOUR_ANON_KEY",
 *       "x-sofia-internal-secret": "YOUR_INTERNAL_SECRET"
 *     }'::jsonb
 *   ) as request_id;
 *   $$
 * );
 *
 * Para verificar jobs agendados:
 * SELECT * FROM cron.job;
 *
 * Para desagendar:
 * SELECT cron.unschedule('health-monitor-check');
 */
