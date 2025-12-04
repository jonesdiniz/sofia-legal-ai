/**
 * Health Monitor Edge Function
 *
 * Executa verificações de saúde do sistema periodicamente
 * Gera alertas quando métricas ultrapassam thresholds
 *
 * Agendamento: A cada 5 minutos via Supabase Cron
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
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

    return new Response(
      JSON.stringify({
        success: true,
        health_check: result,
        unresolved_alerts,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("[Health Monitor] Erro fatal:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
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
 *   '*/5 * * * *', -- A cada 5 minutos
 *   $$
 *   SELECT net.http_post(
 *     url := 'https://seu-projeto.supabase.co/functions/v1/health-monitor',
 *     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
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
