import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SOFIA_ORG_ID } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Users, MessageSquare, Target, Award, AlertTriangle } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

interface DashboardKPIs {
  total_conversations: number;
  total_leads: number;
  total_messages: number;
  avg_messages_per_conversation: number;
  conversion_rate: number;
  platinum_leads: number;
  avg_lead_score: number;
  quick_response_rate: number;
}

interface ConversionFunnel {
  total_conversations: number;
  total_leads: number;
  leads_quentes: number;
  leads_platinum: number;
  conversion_rate: number;
  hot_lead_rate: number;
  platinum_rate: number;
}

interface IntentData {
  intent: string;
  count: number;
  percentage: number;
}

interface SentimentData {
  sentiment: string;
  count: number;
  percentage: number;
}

interface TimelineData {
  period: string;
  conversations_count: number;
  leads_count: number;
  conversion_rate: number;
}

interface LeadScoreData {
  classification: string;
  count: number;
  avg_score: number;
  min_score: number;
  max_score: number;
}

interface AbandonmentMetrics {
  total_risks_detected: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  avg_risk_score: number;
  high_risk_percentage: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORES
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_COLORS = {
  agendar: "#10b981", // green
  preco: "#f59e0b", // amber
  documentos: "#3b82f6", // blue
  urgente: "#ef4444", // red
  duvida_tecnica: "#8b5cf6", // purple
  saudacao: "#6366f1", // indigo
  unknown: "#9ca3af", // gray
};

const SENTIMENT_COLORS = {
  desperate: "#dc2626", // red
  frustrated: "#f59e0b", // amber
  hopeful: "#10b981", // green
  neutral: "#6b7280", // gray
};

const CLASSIFICATION_COLORS = {
  platinum: "#c084fc", // purple
  gold: "#fbbf24", // yellow
  silver: "#94a3b8", // slate
  bronze: "#d97706", // orange
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function Analytics() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [funnel, setFunnel] = useState<ConversionFunnel | null>(null);
  const [intents, setIntents] = useState<IntentData[]>([]);
  const [sentiments, setSentiments] = useState<SentimentData[]>([]);
  const [timeline, setTimeline] = useState<TimelineData[]>([]);
  const [leadScores, setLeadScores] = useState<LeadScoreData[]>([]);
  const [abandonmentMetrics, setAbandonmentMetrics] = useState<AbandonmentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");

  // ═══════════════════════════════════════════════════════════════════════
  // LOAD DATA
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    loadAllData();
  }, [timeRange]);

  async function loadAllData() {
    setLoading(true);

    try {
      const daysAgo = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Load KPIs
      const { data: kpisData } = await supabase.rpc("get_dashboard_kpis", {
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        org_id_filter: SOFIA_ORG_ID,
      });
      if (kpisData && kpisData.length > 0) {
        setKpis(kpisData[0]);
      }

      // Load Funnel
      const { data: funnelData } = await supabase.rpc("get_conversion_funnel", {
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        org_id_filter: SOFIA_ORG_ID,
      });
      if (funnelData && funnelData.length > 0) {
        setFunnel(funnelData[0]);
      }

      // Load Intents
      const { data: intentsData } = await supabase.rpc("get_intent_distribution", {
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        org_id_filter: SOFIA_ORG_ID,
      });
      if (intentsData) {
        setIntents(intentsData);
      }

      // Load Sentiments
      const { data: sentimentsData } = await supabase.rpc("get_sentiment_distribution", {
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        org_id_filter: SOFIA_ORG_ID,
      });
      if (sentimentsData) {
        setSentiments(sentimentsData);
      }

      // Load Timeline
      const { data: timelineData } = await supabase.rpc("get_conversion_timeline", {
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        interval_type: timeRange === "7d" ? "day" : "day",
        org_id_filter: SOFIA_ORG_ID,
      });
      if (timelineData) {
        setTimeline(
          timelineData.map((d: any) => ({
            ...d,
            period: new Date(d.period).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            }),
          }))
        );
      }

      // Load Lead Scores
      const { data: scoresData } = await supabase.rpc("get_lead_score_distribution", {
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        org_id_filter: SOFIA_ORG_ID,
      });
      if (scoresData) {
        setLeadScores(scoresData);
      }

      // Load Abandonment Metrics
      const { data: abandonmentData } = await supabase.rpc("get_abandonment_metrics", {
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        org_id_filter: SOFIA_ORG_ID,
      });
      if (abandonmentData && abandonmentData.length > 0) {
        setAbandonmentMetrics(abandonmentData[0]);
      }
    } catch (error) {
      console.error("Erro ao carregar analytics:", error);
    } finally {
      setLoading(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-2">Métricas de performance e conversão da Sofia</p>
        </div>

        {/* Time Range Selector */}
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
          <TabsList>
            <TabsTrigger value="7d">7 dias</TabsTrigger>
            <TabsTrigger value="30d">30 dias</TabsTrigger>
            <TabsTrigger value="90d">90 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.total_conversations || 0}</div>
            <p className="text-xs text-muted-foreground">
              {kpis?.avg_messages_per_conversation.toFixed(1) || 0} msgs/conversa
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Criados</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.total_leads || 0}</div>
            <p className="text-xs text-muted-foreground">
              {kpis?.conversion_rate.toFixed(1) || 0}% taxa de conversão
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Platinum</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.platinum_leads || 0}</div>
            <p className="text-xs text-muted-foreground">Score médio: {kpis?.avg_lead_score.toFixed(0) || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Responses</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.quick_response_rate.toFixed(0) || 0}%</div>
            <p className="text-xs text-muted-foreground">Respostas otimizadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="behavior">Comportamento</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Conversion Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline de Conversões</CardTitle>
              <CardDescription>Conversas vs Leads criados ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="conversations_count" stroke="#8b5cf6" name="Conversas" />
                  <Line type="monotone" dataKey="leads_count" stroke="#10b981" name="Leads" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Funil de Conversão</CardTitle>
              <CardDescription>Jornada: Conversas → Leads → Quentes → Platinum</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Conversas</p>
                    <p className="text-2xl font-bold">{funnel?.total_conversations || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">100%</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: "100%" }}></div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Leads</p>
                    <p className="text-2xl font-bold">{funnel?.total_leads || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-green-600 font-medium">{funnel?.conversion_rate.toFixed(1) || 0}%</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${funnel?.conversion_rate || 0}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Leads Quentes</p>
                    <p className="text-2xl font-bold">{funnel?.leads_quentes || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-orange-600 font-medium">{funnel?.hot_lead_rate.toFixed(1) || 0}%</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-orange-600 h-2 rounded-full"
                    style={{ width: `${funnel?.hot_lead_rate || 0}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Leads Platinum</p>
                    <p className="text-2xl font-bold">{funnel?.leads_platinum || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-purple-600 font-medium">{funnel?.platinum_rate.toFixed(1) || 0}%</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${funnel?.platinum_rate || 0}%` }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Behavior Tab */}
        <TabsContent value="behavior" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Intents Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Intenções</CardTitle>
                <CardDescription>O que os usuários estão buscando</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={intents}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="intent" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6">
                      {intents.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={INTENT_COLORS[entry.intent as keyof typeof INTENT_COLORS] || "#9ca3af"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Sentiments Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Sentimentos</CardTitle>
                <CardDescription>Estado emocional dos usuários</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sentiments}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.sentiment} (${entry.percentage}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {sentiments.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SENTIMENT_COLORS[entry.sentiment as keyof typeof SENTIMENT_COLORS] || "#6b7280"} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Lead Score Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Score de Leads</CardTitle>
                <CardDescription>Qualificação automática de leads</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={leadScores}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="classification" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981">
                      {leadScores.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CLASSIFICATION_COLORS[entry.classification as keyof typeof CLASSIFICATION_COLORS] || "#6b7280"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Abandonment Metrics */}
            {abandonmentMetrics && (
              <Card>
                <CardHeader>
                  <CardTitle>Métricas de Risco de Abandono</CardTitle>
                  <CardDescription>Detecção proativa de abandonos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total de Riscos Detectados</span>
                    <span className="text-2xl font-bold">{abandonmentMetrics.total_risks_detected}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        Alto Risco
                      </span>
                      <span className="font-medium">{abandonmentMetrics.high_risk_count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        Médio Risco
                      </span>
                      <span className="font-medium">{abandonmentMetrics.medium_risk_count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-gray-600" />
                        Baixo Risco
                      </span>
                      <span className="font-medium">{abandonmentMetrics.low_risk_count}</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Score Médio de Risco</span>
                      <span className="font-bold">{abandonmentMetrics.avg_risk_score.toFixed(1)}/100</span>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-sm text-muted-foreground">Taxa de Alto Risco</span>
                      <span className="font-bold text-red-600">{abandonmentMetrics.high_risk_percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance do Sistema</CardTitle>
              <CardDescription>Métricas técnicas e otimizações</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Quick Response Rate</p>
                  <p className="text-3xl font-bold">{kpis?.quick_response_rate.toFixed(0) || 0}%</p>
                  <p className="text-xs text-muted-foreground">Respostas sem chamar LLM</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Total de Mensagens</p>
                  <p className="text-3xl font-bold">{kpis?.total_messages || 0}</p>
                  <p className="text-xs text-muted-foreground">Mensagens processadas</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Msgs por Conversa</p>
                  <p className="text-3xl font-bold">{kpis?.avg_messages_per_conversation.toFixed(1) || 0}</p>
                  <p className="text-xs text-muted-foreground">Engajamento médio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
