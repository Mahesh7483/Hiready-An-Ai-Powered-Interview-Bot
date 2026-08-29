import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp, MessageSquare, ArrowRight, FileText, Mic, BarChart3, Brain, History, Trophy, Flame, Loader2, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchResumeHistory, fetchInterviewSessions, fetchInterviewSummary,
  type ResumeHistoryItem, type InterviewSessionSummary, type InterviewSummaryStats,
} from "@/lib/historyApi";
import { apiJson } from "@/lib/api";

interface AptitudeAnalytics {
  totalTests: number;
  avgScore: number;
  accuracy: number;
  progressOverTime?: Array<{ date: string; score: number }>;
}

// Server-composite readiness from /api/readiness/me
interface ReadinessData {
  overall: number;
  hasAnyData: boolean;
  aptitude: { score: number | null; weight: number };
  interview: { score: number | null; weight: number };
  coding: { score: number | null; weight: number };
  resume: { score: number | null; weight: number };
}

// Weak topics below 60% accuracy (min 5 answered) from /api/questions/weak-topics/me
interface WeakTopic {
  topic: string;
  accuracy: number;
  answered: number;
}

const Dashboard = () => {
  const { user, loading } = useAuth();
  const [resumeHistory, setResumeHistory] = useState<ResumeHistoryItem[]>([]);
  const [interviews, setInterviews] = useState<InterviewSessionSummary[]>([]);
  const [interviewStats, setInterviewStats] = useState<InterviewSummaryStats | null>(null);
  const [aptitude, setAptitude] = useState<AptitudeAnalytics | null>(null);
  const [readinessData, setReadinessData] = useState<ReadinessData | null>(null);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled([
        fetchResumeHistory(20),
        fetchInterviewSessions(10),
        fetchInterviewSummary(),
        apiJson<AptitudeAnalytics>("/questions/analytics/me"),
        apiJson<ReadinessData>("/readiness/me"),
        apiJson<{ weakTopics: WeakTopic[] }>("/questions/weak-topics/me"),
      ]);
      if (cancelled) return;
      if (results[0].status === "fulfilled") setResumeHistory(results[0].value);
      if (results[1].status === "fulfilled") setInterviews(results[1].value);
      if (results[2].status === "fulfilled") setInterviewStats(results[2].value);
      if (results[3].status === "fulfilled") setAptitude(results[3].value);
      if (results[4].status === "fulfilled") setReadinessData(results[4].value);
      if (results[5].status === "fulfilled") setWeakTopics(results[5].value.weakTopics ?? []);
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const latestResume = resumeHistory[0];
  const totalInterviews = interviewStats?.totalSessions ?? interviews.length;
  const hasCompletedInterview = totalInterviews > 0;

  // Readiness score: server-computed composite (interview 40 / aptitude 30 /
  // coding 20 / resume 10, renormalized when a pillar has no data). Falls back
  // to a client-side estimate if the readiness endpoint is unavailable.
  const resumePart = latestResume ? Math.min(latestResume.overallScore / 100, 1) * 40 : 0;
  const interviewPart = Math.min(totalInterviews, 3) / 3 * 30 + (hasCompletedInterview && !interviewStats?.terminatedCount ? 5 : 0);
  const aptitudePart = aptitude?.accuracy ? Math.min(aptitude.accuracy, 100) / 100 * 25 : 0;
  const clientReadiness = Math.round(Math.min(resumePart + interviewPart + aptitudePart, 100));
  const readiness = readinessData?.overall ?? clientReadiness;

  // Score timeline: resumes (overall) merged chronologically
  const timeline = [...resumeHistory]
    .reverse()
    .map((r) => ({
      date: new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      score: r.overallScore,
    }));

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          {loading ? (
            <>
              <div className="h-10 bg-muted rounded-lg w-64 animate-pulse mb-2" />
              <div className="h-5 bg-muted rounded-lg w-96 animate-pulse" />
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Welcome back, {user?.displayName || "User"}
              </h1>
              <p className="text-muted-foreground">" Ready to ace your next interview? "</p>
            </>
          )}
        </div>

        {/* Readiness Card — real composite score */}
        <Card className="mb-8 border-0 shadow-lg bg-gradient-primary">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-primary-foreground mb-2">Interview Readiness</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  Interview scores, aptitude accuracy, coding pass-rate, and resume quality
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-primary-foreground">{readiness}%</div>
                <p className="text-sm text-primary-foreground/80">Ready</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-2 rounded-full bg-primary-foreground/20 overflow-hidden">
              <div
                className="h-full bg-primary-foreground rounded-full transition-all duration-700"
                style={{ width: `${readiness}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-6 text-center">
              <Link to="/my-resumes" className="block group">
                <p className="text-sm text-primary-foreground/80 mb-1 group-hover:text-primary-foreground">Resumes analyzed</p>
                <p className="text-xs font-bold text-primary-foreground">{resumeHistory.length}</p>
              </Link>
              <Link to="/interview-history" className="block group">
                <p className="text-sm text-primary-foreground/80 mb-1 group-hover:text-primary-foreground">Interviews done</p>
                <p className="text-xs font-bold text-primary-foreground">{totalInterviews}</p>
              </Link>
              <Link to="/aptitude-dashboard" className="block group">
                <p className="text-sm text-primary-foreground/80 mb-1 group-hover:text-primary-foreground">Aptitude tests</p>
                <p className="text-xs font-bold text-primary-foreground">{aptitude?.totalTests ?? 0}</p>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Targeted practice: weakest aptitude topics (< 60% accuracy) */}
        {weakTopics.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-8 -mt-4">
            <Target className="w-4 h-4 text-destructive" />
            <span className="text-sm text-muted-foreground mr-1">Focus areas:</span>
            {weakTopics.map((t) => (
              <Link key={t.topic} to="/aptitude/practice">
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:border-destructive/60 hover:text-destructive transition-colors"
                >
                  {t.topic.replace(/-/g, " ")} · {t.accuracy}%
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border border-border shadow-md hover:shadow-lg transition-shadow flex flex-col">
            <CardHeader className="flex-1">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <FileUp className="w-6 h-6 text-accent" />
              </div>
              <CardTitle>Analyze Resume</CardTitle>
              <CardDescription>ATS scoring, keyword gaps & AI rewrites</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Link to="/resume-analysis" className="block">
                <Button className="w-full bg-gradient-accent hover:opacity-90 transition-opacity">
                  New Analysis <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              {resumeHistory.length > 0 && (
                <Link to="/my-resumes" className="block">
                  <Button variant="outline" className="w-full">
                    <History className="mr-2 w-4 h-4" /> My Resumes ({resumeHistory.length})
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border shadow-md hover:shadow-lg transition-shadow flex flex-col">
            <CardHeader className="flex-1">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Start Mock Interview</CardTitle>
              <CardDescription>Strict AI interviewer with live proctoring</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Link to="/interview" className="block">
                <Button className="w-full bg-gradient-primary hover:opacity-90 transition-opacity">
                  Start Interview <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              {hasCompletedInterview && (
                <Link to="/interview-history" className="block">
                  <Button variant="outline" className="w-full">
                    <History className="mr-2 w-4 h-4" /> History ({totalInterviews})
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border shadow-md hover:shadow-lg transition-shadow flex flex-col">
            <CardHeader className="flex-1">
              <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-warning" />
              </div>
              <CardTitle>Aptitude Practice</CardTitle>
              <CardDescription>Timed mocks, leaderboards & streaks</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Link to="/aptitude" className="block">
                <Button className="w-full bg-gradient-primary hover:opacity-90 transition-opacity">
                  Take Test <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link to="/leaderboard" className="block">
                <Button variant="outline" className="w-full">
                  <Trophy className="mr-2 w-4 h-4" /> Leaderboard
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-md hover:shadow-lg transition-shadow flex flex-col">
            <CardHeader className="flex-1">
              <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-success" />
              </div>
              <CardTitle>View Reports</CardTitle>
              <CardDescription>Re-open past reports and track progress</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link to="/interview-history" className="block">
                <Button
                  className="w-full bg-gradient-accent hover:opacity-90 transition-opacity"
                  disabled={!hasCompletedInterview}
                >
                  Interview History <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              {!hasCompletedInterview && (
                <p className="text-xs text-muted-foreground mt-2">
                  Complete an interview to build history
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Latest Resume Score</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-metric/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-metric" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : latestResume ? (
                <>
                  <div className="text-3xl font-bold text-foreground">{latestResume.overallScore}%</div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {latestResume.targetRole} · ATS {latestResume.atsScore} · KW {latestResume.keywordMatch}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-muted-foreground">—</div>
                  <p className="text-xs text-muted-foreground mt-1">Analyze a resume to see your score</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Interviews</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Mic className="w-5 h-5 text-warning" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-foreground">{totalInterviews}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {interviewStats && interviewStats.avgDurationSeconds > 0
                      ? `avg ${Math.round(interviewStats.avgDurationSeconds / 60)} min · last 30d: ${interviewStats.sessionsLast30Days}`
                      : "Complete an interview to start history"}
                    {interviewStats && interviewStats.terminatedCount > 0 && ` · ${interviewStats.terminatedCount} flagged`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Aptitude Accuracy</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-warning" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : aptitude && aptitude.totalTests > 0 ? (
                <>
                  <div className="text-3xl font-bold text-foreground">{Math.round(aptitude.accuracy ?? 0)}%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {aptitude.totalTests} test{aptitude.totalTests === 1 ? "" : "s"} · avg score {Math.round(aptitude.avgScore ?? 0)}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-muted-foreground">—</div>
                  <p className="text-xs text-muted-foreground mt-1">Take a test to see accuracy</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Practice Streak</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Flame className="w-5 h-5 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <StreakDisplay />
                  <p className="text-xs text-muted-foreground mt-1">Practice daily to grow your streak</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Progress-over-time chart */}
        {timeline.length >= 2 && (
          <Card className="border border-border mb-8">
            <CardHeader>
              <CardTitle className="text-lg">Resume Score Timeline</CardTitle>
              <CardDescription>Overall score across your saved analyses</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

/** Computes the daily practice streak from the most recent activity dates */
function StreakDisplay() {
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<{ items: Array<{ createdAt: string }> }>(
          `/questions/history/me?limit=100`
        ).catch(() => null);

        let dates: string[] = [];
        if (data?.items?.length) {
          dates = data.items.map((i) => i.createdAt.slice(0, 10));
        } else {
          // Fallback: sessionStorage result from the current session
          const saved = sessionStorage.getItem("aptitudeTestResult");
          if (saved) dates = [new Date().toISOString().slice(0, 10)];
        }
        if (!dates.length || cancelled) {
          setStreak(0);
          return;
        }
        const unique = Array.from(new Set(dates)).sort().reverse();
        const today = new Date().toISOString().slice(0, 10);
        let count = 0;
        let cursor = new Date(today);
        for (const d of unique) {
          const iso = cursor.toISOString().slice(0, 10);
          if (d === iso) {
            count += 1;
            cursor = new Date(cursor.setDate(cursor.getDate() - 1));
          } else if (count === 0 && d < iso) {
            break;
          }
        }
        setStreak(count);
      } catch {
        setStreak(0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (streak === null) return <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-bold text-foreground">{streak}</span>
      <span className="text-sm text-muted-foreground">day{streak === 1 ? "" : "s"}</span>
    </div>
  );
}

export default Dashboard;

