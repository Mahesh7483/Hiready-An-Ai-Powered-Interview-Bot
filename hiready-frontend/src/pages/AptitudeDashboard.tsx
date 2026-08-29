import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Award, Target, Clock, Hash, Flame, Trophy, NotebookPen, Lock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { API_BASE_URL, getAuthHeaders, apiJson } from "@/lib/api";

interface AnalyticsData {
  totalTests: number;
  avgScore: number;
  accuracy: number;
  avgTimePerQuestion: number;
  topicPerformance: { topic: string; correct: number; total: number; accuracy: number }[];
  progressOverTime: { date: string; score: number; total: number; mode: string }[];
  correctCount: number;
  wrongCount: number;
  timeInsights?: {
    avgCorrectMs: number;
    avgWrongMs: number;
    fastWrongCount: number;   // wrong answers given in < 15s (rushed/guessed)
    slowCorrectCount: number; // correct answers that took > 45s (struggled)
    noAnswerCount: number;
    perTopic: { topic: string; avgMs: number; accuracy: number }[];
  };
}

const EMPTY_ANALYTICS: AnalyticsData = {
  totalTests: 0,
  avgScore: 0,
  accuracy: 0,
  avgTimePerQuestion: 0,
  topicPerformance: [],
  progressOverTime: [],
  correctCount: 0,
  wrongCount: 0,
};

const COLORS = ["#10b981", "#ef4444", "#f59e0b"];

/** Formats milliseconds as a compact seconds label ("12s"), or a dash when absent */
const fmtSec = (ms: number): string => (ms > 0 ? `${Math.round(ms / 1000)}s` : "—");

const fetchAnalytics = async (): Promise<AnalyticsData> => {
  // Identity is derived server-side from the JWT
  const response = await fetch(`${API_BASE_URL}/questions/analytics/me`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Failed to fetch analytics");
  return response.json();
};

const AptitudeDashboard = () => {
  const navigate = useNavigate();
  const hasToken = !!localStorage.getItem("token");

  const {
    data,
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: ["aptitude-analytics"],
    queryFn: fetchAnalytics,
    enabled: hasToken,
    staleTime: 60 * 1000,
  });

  // Streak from recent test dates
  const streakQuery = useQuery({
    queryKey: ["aptitude-streak"],
    queryFn: async () => {
      const hist = await apiJson<{ items: Array<{ createdAt: string }> }>(
        "/questions/history/me?limit=200"
      );
      const days = Array.from(
        new Set(hist.items.map((i) => i.createdAt.slice(0, 10)))
      ).sort().reverse();
      if (!days.length) return 0;
      let count = 0;
      const cursor = new Date();
      for (let i = 0; i < 400; i++) {
        const iso = cursor.toISOString().slice(0, 10);
        if (days.includes(iso)) {
          count += 1;
          cursor.setDate(cursor.getDate() - 1);
        } else if (count > 0 || iso > (days[0] ?? "")) {
          break;
        }
      }
      return count;
    },
    enabled: hasToken,
    staleTime: 5 * 60 * 1000,
  });
  const streak = streakQuery.data ?? 0;

  const analytics: AnalyticsData =
    data ??
    (hasToken && !isError ? EMPTY_ANALYTICS : { ...EMPTY_ANALYTICS });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </DashboardLayout>
    );
  }

  const pieData = [
    { name: "Correct", value: analytics.correctCount },
    { name: "Wrong", value: analytics.wrongCount },
  ].filter((d) => d.value > 0);

  // ── Gamification: badges computed from real results ──
  const badges = [
    { icon: "🎯", name: "First Steps", desc: "Complete your first test", earned: analytics.totalTests >= 1 },
    { icon: "🔥", name: `Streak ${Math.max(streak, 0)}d`, desc: "Practice multiple days in a row", earned: streak >= 2 },
    { icon: "📚", name: "Persistent", desc: "10 tests completed", earned: analytics.totalTests >= 10 },
    { icon: "💪", name: "Marathoner", desc: "25 tests completed", earned: analytics.totalTests >= 25 },
    { icon: "🏆", name: "Legend", desc: "50 tests completed", earned: analytics.totalTests >= 50 },
    { icon: "🎖️", name: "Sharpshooter", desc: "85%+ overall accuracy", earned: (analytics.accuracy ?? 0) >= 85 && analytics.totalTests >= 5 },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/aptitude")}
          className="mb-6 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Aptitude
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Aptitude Dashboard</h1>
          <p className="text-muted-foreground">
            Track your progress and identify areas for improvement
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Tests</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.totalTests}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Award className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.avgScore.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Target className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Accuracy</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.accuracy.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Time/Q</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.avgTimePerQuestion.toFixed(0)}s</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Streak + Badges */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="border-2 border-orange-500/30 bg-orange-500/5">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Flame className={`w-7 h-7 ${streak > 0 ? "text-orange-500" : "text-muted-foreground/40"}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Practice Streak</p>
                <p className="text-3xl font-bold text-foreground">
                  {streak}<span className="text-sm font-normal text-muted-foreground"> day{streak === 1 ? "" : "s"}</span>
                </p>
                {streak >= 2 && <p className="text-xs text-orange-500 font-medium">Keep it burning!</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-border md:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <CardTitle className="text-lg">Badges</CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">
                  {badges.filter((b) => b.earned).length}/{badges.length} earned
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {badges.map((b) => (
                  <div
                    key={b.name}
                    title={`${b.name} — ${b.desc}`}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-colors ${
                      b.earned
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border opacity-45 grayscale"
                    }`}
                  >
                    <span className="text-xl">{b.earned ? b.icon : <Lock className="w-4 h-4 text-muted-foreground" />}</span>
                    <span className="text-[10px] font-medium leading-tight">{b.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notebook / Leaderboard quick links */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <Button variant="outline" className="h-auto py-4 justify-start" onClick={() => navigate("/aptitude/notebook")}>
            <NotebookPen className="mr-3 w-5 h-5 text-destructive" />
            <span className="text-left">
              <span className="block font-semibold">Wrong-Answer Notebook</span>
              <span className="block text-xs text-muted-foreground">Review and master every question you missed</span>
            </span>
          </Button>
          <Button variant="outline" className="h-auto py-4 justify-start" onClick={() => navigate("/leaderboard")}>
            <Trophy className="mr-3 w-5 h-5 text-amber-500" />
            <span className="text-left">
              <span className="block font-semibold">Leaderboard</span>
              <span className="block text-xs text-muted-foreground">See how you rank against everyone this week</span>
            </span>
          </Button>
        </div>

        {analytics.totalTests === 0 ? (
          <Card className="p-12 text-center border-2 border-dashed border-border">
            <p className="text-lg text-muted-foreground mb-4">
              No test data yet. Take a practice or test to see your analytics here.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate("/aptitude/practice")} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Start Practice
              </Button>
              <Button onClick={() => navigate("/aptitude/test")} className="bg-violet-600 hover:bg-violet-700 text-white">
                Take a Test
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart: Topic Performance */}
            {analytics.topicPerformance.length > 0 && (
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Topic Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.topicPerformance}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="topic"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v: string) => v.replace(/-/g, " ").slice(0, 12)}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, "Accuracy"]}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Bar dataKey="accuracy" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Time Insights: pacing patterns from per-question time tracking */}
            {analytics.timeInsights && analytics.totalTests > 0 && (
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Time Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="p-3 rounded-lg border border-border bg-muted/20 text-center">
                      <p className="text-xs text-muted-foreground">Avg time · correct</p>
                      <p className="text-lg font-bold text-success">{fmtSec(analytics.timeInsights.avgCorrectMs)}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-border bg-muted/20 text-center">
                      <p className="text-xs text-muted-foreground">Avg time · wrong</p>
                      <p className="text-lg font-bold text-destructive">{fmtSec(analytics.timeInsights.avgWrongMs)}</p>
                    </div>
                    <div
                      className="p-3 rounded-lg border border-warning/40 bg-warning/5 text-center"
                      title="Wrong answers given in under 15 seconds — likely rushed or guessed"
                    >
                      <p className="text-xs text-muted-foreground">Rushed &amp; wrong</p>
                      <p className="text-lg font-bold text-warning">{analytics.timeInsights.fastWrongCount}</p>
                    </div>
                    <div
                      className="p-3 rounded-lg border border-border bg-muted/20 text-center"
                      title="Correct answers that took over 45 seconds — struggled but got there"
                    >
                      <p className="text-xs text-muted-foreground">Slow but correct</p>
                      <p className="text-lg font-bold text-foreground">{analytics.timeInsights.slowCorrectCount}</p>
                    </div>
                  </div>
                  {analytics.timeInsights.perTopic.length > 0 && (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={analytics.timeInsights.perTopic.map((t) => ({
                          ...t,
                          seconds: Math.round(t.avgMs / 1000),
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="topic"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v: string) => v.replace(/-/g, " ").slice(0, 12)}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number) => [`${value}s`, "Avg time"]}
                          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                        <Bar dataKey="seconds" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Line Chart: Score Over Time */}
            {analytics.progressOverTime.length > 0 && (
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Score Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.progressOverTime.map((p) => ({
                      ...p,
                      percentage: p.total > 0 ? Math.round((p.score / p.total) * 100) : 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, "Score"]}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="percentage"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ fill: "#10b981", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Pie Chart: Correct vs Wrong */}
            {pieData.length > 0 && (
              <Card className="border-2 border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Correct vs Wrong</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AptitudeDashboard;

