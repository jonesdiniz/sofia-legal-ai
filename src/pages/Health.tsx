import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface HealthMetrics {
  uptime_percentage: number;
  error_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_conversations: number;
  total_leads: number;
  conversion_rate: number;
  active_conversations: number;
  pending_followups: number;
  avg_lead_score: number;
}

interface UnresolvedAlert {
  alert_id: string;
  alert_type: string;
  severity: 'warning' | 'critical';
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
  age_minutes: number;
}

export default function Health() {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [alerts, setAlerts] = useState<UnresolvedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  async function loadHealthData() {
    setLoading(true);
    try {
      // Buscar métricas de saúde
      const { data: metricsData, error: metricsError } = await supabase
        .rpc("get_health_metrics", {
          time_window: '24 hours'
        });

      if (metricsError) {
        console.error("Erro ao buscar métricas:", metricsError);
      } else if (metricsData && metricsData.length > 0) {
        setMetrics(metricsData[0]);
      }

      // Buscar alertas não resolvidos
      const { data: alertsData, error: alertsError } = await supabase
        .rpc("get_unresolved_alerts");

      if (alertsError) {
        console.error("Erro ao buscar alertas:", alertsError);
      } else if (alertsData) {
        setAlerts(alertsData);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error("Erro ao carregar dados de saúde:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealthData();

    // Auto-refresh a cada 30 segundos
    const interval = setInterval(loadHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  function getStatusColor(value: number, threshold: number, reverse: boolean = false): string {
    if (reverse) {
      // Para métricas onde menor é melhor (ex: error_rate, latency)
      if (value > threshold * 2) return "text-red-500";
      if (value > threshold) return "text-yellow-500";
      return "text-green-500";
    } else {
      // Para métricas onde maior é melhor (ex: uptime, conversion)
      if (value < threshold / 2) return "text-red-500";
      if (value < threshold) return "text-yellow-500";
      return "text-green-500";
    }
  }

  function getStatusIcon(value: number, threshold: number, reverse: boolean = false) {
    const color = getStatusColor(value, threshold, reverse);
    if (color === "text-green-500") return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (color === "text-yellow-500") return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  }

  function getTrendIcon(value: number, threshold: number, reverse: boolean = false) {
    if (reverse) {
      if (value > threshold) return <TrendingUp className="h-4 w-4 text-red-500" />;
      if (value < threshold * 0.5) return <TrendingDown className="h-4 w-4 text-green-500" />;
      return <Minus className="h-4 w-4 text-gray-400" />;
    } else {
      if (value > threshold) return <TrendingUp className="h-4 w-4 text-green-500" />;
      if (value < threshold * 0.5) return <TrendingDown className="h-4 w-4 text-red-500" />;
      return <Minus className="h-4 w-4 text-gray-400" />;
    }
  }

  if (loading && !metrics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        </div>
      </div>
    );
  }

  const overallStatus = metrics
    ? metrics.uptime_percentage > 99 && metrics.error_rate < 5 && metrics.avg_latency_ms < 4000
      ? 'healthy'
      : metrics.error_rate > 10 || metrics.avg_latency_ms > 6000
      ? 'critical'
      : 'warning'
    : 'unknown';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Activity className="h-8 w-8 text-purple-600" />
              Health Dashboard
            </h1>
            <p className="text-gray-600 mt-1">
              Monitoramento de saúde do sistema Sofia (últimas 24h)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              {lastUpdate && `Atualizado: ${lastUpdate.toLocaleTimeString()}`}
            </div>
            <Button onClick={loadHealthData} disabled={loading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Overall Status Card */}
        <Card className={`border-2 ${
          overallStatus === 'healthy' ? 'border-green-500 bg-green-50' :
          overallStatus === 'warning' ? 'border-yellow-500 bg-yellow-50' :
          overallStatus === 'critical' ? 'border-red-500 bg-red-50' :
          'border-gray-300'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {overallStatus === 'healthy' && <CheckCircle className="h-6 w-6 text-green-500" />}
              {overallStatus === 'warning' && <AlertTriangle className="h-6 w-6 text-yellow-500" />}
              {overallStatus === 'critical' && <XCircle className="h-6 w-6 text-red-500" />}
              Status Geral: {overallStatus === 'healthy' ? 'Saudável' : overallStatus === 'warning' ? 'Atenção' : 'Crítico'}
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Alertas Não Resolvidos */}
        {alerts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Alertas Ativos ({alerts.length})</h2>
            {alerts.map((alert) => (
              <Alert key={alert.alert_id} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.severity.toUpperCase()}
                  </Badge>
                  {alert.message}
                </AlertTitle>
                <AlertDescription>
                  <div className="text-sm text-gray-600 mt-2">
                    Tipo: {alert.alert_type} | Há {alert.age_minutes} minutos
                  </div>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Métricas Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Uptime */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Uptime</span>
                {metrics && getStatusIcon(metrics.uptime_percentage, 95, false)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics?.uptime_percentage.toFixed(2)}%</div>
              <p className="text-sm text-gray-500 mt-1">
                Target: &gt; 99%
              </p>
            </CardContent>
          </Card>

          {/* Error Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Taxa de Erro</span>
                {metrics && getStatusIcon(metrics.error_rate, 5, true)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics?.error_rate.toFixed(2)}%</div>
              <p className="text-sm text-gray-500 mt-1">
                Target: &lt; 5%
              </p>
            </CardContent>
          </Card>

          {/* Latência Média */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Latência Média</span>
                {metrics && getStatusIcon(metrics.avg_latency_ms, 4000, true)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics?.avg_latency_ms.toFixed(0)}ms</div>
              <p className="text-sm text-gray-500 mt-1">
                P95: {metrics?.p95_latency_ms.toFixed(0)}ms | Target: &lt; 4000ms
              </p>
            </CardContent>
          </Card>

          {/* Conversas Totais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Conversas Totais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics?.total_conversations}</div>
              <p className="text-sm text-gray-500 mt-1">
                {metrics?.active_conversations} ativas
              </p>
            </CardContent>
          </Card>

          {/* Leads Criados */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Leads Criados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics?.total_leads}</div>
              <p className="text-sm text-gray-500 mt-1">
                Score médio: {metrics?.avg_lead_score.toFixed(1)}
              </p>
            </CardContent>
          </Card>

          {/* Taxa de Conversão */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Taxa de Conversão</span>
                {metrics && getStatusIcon(metrics.conversion_rate, 15, false)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics?.conversion_rate.toFixed(2)}%</div>
              <p className="text-sm text-gray-500 mt-1">
                Target: &gt; 15%
              </p>
            </CardContent>
          </Card>

          {/* Follow-ups Pendentes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Follow-ups Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics?.pending_followups}</div>
              <p className="text-sm text-gray-500 mt-1">
                Aguardando processamento
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
