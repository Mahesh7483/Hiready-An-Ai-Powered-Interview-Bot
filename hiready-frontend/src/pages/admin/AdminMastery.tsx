import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Users, Flame, AlertTriangle, Loader2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { adminAPI, type PillarKey } from "@/lib/adminApi";

const PILLAR_LABEL: Record<PillarKey, string> = {
  interview: "Interview",
  aptitude: "Aptitude",
  coding: "Coding",
  resume: "Resume",
};

// Display order matches the student's readiness card.
const PILLAR_ORDER: PillarKey[] = ["resume", "interview", "coding", "aptitude"];

// Literal class strings — Tailwind's JIT cannot see a class built by template
// string, so `bg-${tone}` would be purged and render unstyled.
const SEVERITY = {
  bad: { text: "text-destructive", bar: "bg-destructive" },
  warn: { text: "text-warning", bar: "bg-warning" },
  good: { text: "text-success", bar: "bg-success" },
} as const;

const severity = (accuracy: number) =>
  accuracy < 45 ? SEVERITY.bad : accuracy < 60 ? SEVERITY.warn : SEVERITY.good;

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}> = ({ icon, label, value, sub }) => (
  <Card className="border border-border">
    <CardContent className="pt-6 flex items-center gap-4">
      <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </CardContent>
  </Card>
);

const AdminMastery = () => {
  const readiness = useQuery({ queryKey: ["admin", "readiness"], queryFn: adminAPI.getCohortReadiness });
  const topics = useQuery({ queryKey: ["admin", "cohort-topics"], queryFn: adminAPI.getCohortTopics });
  const engagement = useQuery({ queryKey: ["admin", "engagement"], queryFn: adminAPI.getEngagement });

  const loading = readiness.isLoading || topics.isLoading || engagement.isLoading;
  const failed = readiness.isError || topics.isError || engagement.isError;

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Scoring the cohort…</span>
      </div>
    );
  }

  if (failed) {
    return (
      <Card className="border border-destructive/40 max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Could not load cohort data</CardTitle>
          <CardDescription>
            One or more of the readiness, topic and engagement queries failed. Check the API server
            is running, then reload.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const r = readiness.data!;
  const e = engagement.data!;
  const allTopics = topics.data!.topics;
  const weakest = allTopics.filter((t) => t.accuracy < 60);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mastery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The same four pillars each student sees, scored across everyone
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Target className="w-5 h-5 text-primary" />}
          label="Cohort readiness"
          value={r.average != null ? `${r.average}%` : "—"}
          sub={`${r.scoredStudents} of ${r.totalStudents} students scored`}
        />
        <StatCard
          icon={<Users className="w-5 h-5 text-accent" />}
          label="Not started"
          value={r.unscoredStudents}
          sub="no attempt in any pillar"
        />
        <StatCard
          icon={<Flame className="w-5 h-5 text-success" />}
          label="Active this week"
          value={e.active7d}
          sub={`${e.activeToday} today · ${e.active30d} in 30 days`}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          label="Topics under 60%"
          value={weakest.length}
          sub={`of ${allTopics.length} topics attempted`}
        />
      </div>

      {/* Pillars */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">Readiness by pillar</CardTitle>
          <CardDescription>
            Cohort average per pillar. Weights are the ones the composite score uses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {PILLAR_ORDER.map((key) => {
            const p = r.pillars[key];
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {PILLAR_LABEL[key]}
                    <span className="ml-2 text-xs text-muted-foreground">weight {p.weight}%</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {p.average != null ? `${p.average}%` : "—"}
                    </span>
                    <span className="ml-2">{p.students} student{p.students === 1 ? "" : "s"}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${p.average ?? 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Distribution */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Readiness spread</CardTitle>
            <CardDescription>How many students sit in each band</CardDescription>
          </CardHeader>
          <CardContent>
            {r.scoredStudents === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No student has completed anything scoreable yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={r.bands}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v} student${v === 1 ? "" : "s"}`, "Students"]}
                  />
                  <Bar dataKey="students" radius={[6, 6, 0, 0]}>
                    {r.bands.map((b, i) => (
                      <Cell
                        key={b.label}
                        fill={
                          i === 0
                            ? "hsl(var(--destructive))"
                            : i === 1
                              ? "hsl(var(--warning))"
                              : i === 2
                                ? "hsl(var(--primary))"
                                : "hsl(var(--success))"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Most active */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Most active — last 30 days</CardTitle>
            <CardDescription>Ranked by days practised, not attempts</CardDescription>
          </CardHeader>
          <CardContent>
            {e.mostActive.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No practice activity in the last 30 days.
              </p>
            ) : (
              <div className="space-y-3">
                {e.mostActive.map((s) => (
                  <div key={s.userId} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {s.name || "Deleted account"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{s.email || s.userId}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">
                        {s.activeDays} day{s.activeDays === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.attempts} attempts</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Topics */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">Topics by cohort accuracy</CardTitle>
          <CardDescription>
            Worst first. These are what the student-side focus areas are drawn from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No graded answers yet.
            </p>
          ) : (
            <div className="space-y-4">
              {allTopics.map((t) => {
                const tone = severity(t.accuracy);
                return (
                  <div key={t.topic}>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="text-sm font-medium text-foreground capitalize">
                        {t.topic.replace(/-/g, " ")}
                        <Badge variant="outline" className="ml-2 font-normal">
                          {t.students} student{t.students === 1 ? "" : "s"}
                        </Badge>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        <span className={`font-semibold ${tone.text}`}>{t.accuracy}%</span>
                        <span className="ml-2">
                          {t.correct}/{t.answered}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tone.bar}`}
                        style={{ width: `${t.accuracy}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Session completion and review-queue depth are not shown because the session and review
        models do not exist yet. This page reports real practice activity only.
      </p>
    </div>
  );
};

export default AdminMastery;
