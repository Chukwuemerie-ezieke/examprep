import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock, Flame, Target, Trophy, History as HistoryIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Analytics, ExamBody, Subject } from "@/lib/types";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useAuth } from "@/hooks/use-auth";

// Format seconds -> "Xh Ym" or "Xm Ys", consistent with history.tsx formatTime.
function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

const trendConfig = {
  percentage: { label: "Score %", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

const subjectConfig = {
  avgScore: { label: "Avg Score %", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const topicConfig = {
  accuracy: { label: "Accuracy %", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

export default function Analytics() {
  const { user } = useAuth();
  const { data: analytics, isLoading } = useQuery<Analytics>({ queryKey: ["/api/analytics"] });
  const { data: examBodies } = useQuery<ExamBody[]>({ queryKey: ["/api/exam-bodies"] });
  const { data: subjects } = useQuery<Subject[]>({ queryKey: ["/api/subjects"] });

  const getSubjectName = (id?: number) =>
    (id != null && subjects?.find((s) => s.id === id)?.name) || (id != null ? `Subject ${id}` : "");

  const analyticsAction = (
    <Link href="/history">
      <Button variant="ghost" size="sm" className="gap-1 text-xs" data-testid="link-analytics-history">
        <HistoryIcon className="w-3 h-3" /> History
      </Button>
    </Link>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Analytics" maxWidth="max-w-5xl" action={analyticsAction} />
        <div className="max-w-5xl mx-auto px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-analytics-loading">Loading...</p>
        </div>
      </div>
    );
  }

  const overall = analytics?.overall;
  const hasData = !!overall && overall.completedSessions > 0 && (analytics?.trend.length ?? 0) > 0;

  // Chart-ready data.
  const trendData =
    analytics?.trend.map((t, i) => ({
      label: new Date(t.date).toLocaleDateString(),
      index: i + 1,
      percentage: t.percentage,
    })) ?? [];

  const subjectData =
    analytics?.perSubject.map((g) => ({
      label: getSubjectName(g.subjectId),
      avgScore: g.avgScore,
    })) ?? [];

  const topicData =
    analytics?.weakTopics.map((w) => ({
      label: `Topic ${w.topicId}`,
      accuracy: w.accuracy,
      attempts: w.attempts,
    })) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Analytics" maxWidth="max-w-5xl" action={analyticsAction} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        {user && (
          <p className="text-xs text-muted-foreground mb-4" data-testid="text-analytics-user">
            Signed in as {user.displayName || user.email}
          </p>
        )}

        {!hasData ? (
          <div className="text-center py-16" data-testid="empty-analytics">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Take a quiz to see your analytics</p>
            <Link href="/cbt">
              <Button size="sm" data-testid="button-take-quiz">Take a Quiz</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border border-border" data-testid="card-overall-accuracy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{overall!.overallAccuracy}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Overall Accuracy</p>
                </CardContent>
              </Card>
              <Card className="border border-border" data-testid="card-current-streak">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{overall!.currentStreakDays}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Current Streak (days)</p>
                </CardContent>
              </Card>
              <Card className="border border-border" data-testid="card-study-time">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{formatTime(overall!.totalStudyTimeSeconds)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Total Study Time</p>
                </CardContent>
              </Card>
              <Card className="border border-border" data-testid="card-completed-sessions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-4 h-4 text-primary" />
                    <span className="text-lg font-bold text-foreground">{overall!.completedSessions}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Completed Quizzes</p>
                </CardContent>
              </Card>
            </div>

            {/* Score trend */}
            <Card className="border border-border" data-testid="card-trend-chart">
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">Score Trend</h2>
                <ChartContainer config={trendConfig} className="aspect-[16/6] w-full">
                  <AreaChart data={trendData} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="percentage"
                      stroke="var(--color-percentage)"
                      fill="var(--color-percentage)"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Per-subject performance */}
            <Card className="border border-border" data-testid="card-subject-chart">
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">Performance by Subject</h2>
                {subjectData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No subject data yet.</p>
                ) : (
                  <ChartContainer config={subjectConfig} className="aspect-[16/6] w-full">
                    <BarChart data={subjectData} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="avgScore" fill="var(--color-avgScore)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Weak topics */}
            <Card className="border border-border" data-testid="card-weak-topics">
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">Weakest Topics</h2>
                {topicData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No per-topic data yet. Answer more topic-tagged questions to see weak spots.
                  </p>
                ) : (
                  <>
                    <ChartContainer config={topicConfig} className="aspect-[16/6] w-full">
                      <BarChart
                        data={topicData}
                        layout="vertical"
                        margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          width={72}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="accuracy" fill="var(--color-accuracy)" radius={4} />
                      </BarChart>
                    </ChartContainer>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {topicData.map((t) => (
                        <Badge
                          key={t.label}
                          variant="outline"
                          className="text-[10px]"
                          data-testid={`badge-weak-topic-${t.label.replace(/\s+/g, "-")}`}
                        >
                          {t.label}: {t.accuracy}% ({t.attempts} attempts)
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <footer className="border-t border-border py-6 text-center mt-8">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
