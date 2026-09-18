import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Brain, TerminalSquare, MessageSquare, FileText, Zap, Loader2, RotateCcw, Target,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiJson } from "@/lib/api";

interface Pillar { score: number | null; weight: number }
interface ReadinessData {
  overall: number;
  hasAnyData: boolean;
  aptitude: Pillar & { answered?: number };
  interview: Pillar;
  coding: Pillar;
  resume: Pillar;
}
interface WeakTopic { topic: string; accuracy: number; answered: number }

/** GET /api/mastery/today — the server's choice of what to work on now. */
interface TodayBlock {
  kind: "recall" | "stretch" | "speak";
  minutes: number;
  count?: number;
  topic?: string | null;
  pillar?: string;
}
interface TodaySession {
  generatedAt: string;
  overall: number;
  hasAnyData: boolean;
  weakestPillar: string;
  weakestTopic: WeakTopic | null;
  dueCount: number;
  bookmarked: number;
  blocks: TodayBlock[];
}

type PillarKey = "interview" | "aptitude" | "coding" | "resume";

const PILLAR_META: Record<PillarKey, { label: string; to: string; icon: typeof Brain }> = {
  interview: { label: "Interview", to: "/practice/interview", icon: MessageSquare },
  aptitude: { label: "Aptitude", to: "/practice/aptitude", icon: Brain },
  coding: { label: "Coding", to: "/practice/coding", icon: TerminalSquare },
  resume: { label: "Resume", to: "/practice/resume", icon: FileText },
};

// Display order matches the readiness card students already know.
const PILLAR_ORDER: PillarKey[] = ["resume", "interview", "coding", "aptitude"];

const Mastery = () => {
  const { user, loading } = useAuth();
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [today, setToday] = useState<TodaySession | null>(null);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /**
       * Two calls where there were three. /mastery/today already computes the
       * session from the readiness numbers server-side, so the wrong-answer
       * count it used to fetch separately comes back inside it.
       *
       * allSettled without a rejected branch is how this page told a user with
       * a full history that they had never scored anything: every failed fetch
       * left state at its initial value, and the page rendered a readiness of
       * "—", no weak topics, and "Nothing scored yet".
       */
      const results = await Promise.allSettled([
        apiJson<ReadinessData>("/readiness/me"),
        apiJson<TodaySession>("/mastery/today"),
        apiJson<{ weakTopics: WeakTopic[] }>("/questions/weak-topics/me"),
      ]);
      if (cancelled) return;
      if (results[0].status === "fulfilled") setReadiness(results[0].value);
      if (results[1].status === "fulfilled") setToday(results[1].value);
      if (results[2].status === "fulfilled") setWeakTopics(results[2].value.weakTopics ?? []);

      /**
       * Readiness and the session decide what this page says; if either
       * failed, say so rather than composing a plan from defaults. Weak topics
       * degrade honestly on their own — an empty list reads as "nothing to
       * show", which is the truth when it is empty and a small, visible
       * understatement when it is not.
       */
      const critical = [results[0], results[1]].find((r) => r.status === "rejected");
      if (critical && critical.status === "rejected") {
        const reason = critical.reason;
        setLoadError(reason instanceof Error ? reason : new Error("Request failed"));
      } else {
        setLoadError(null);
      }
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  /**
   * The composer is the SERVER's decision now — GET /api/mastery/today.
   *
   * This block used to re-derive the weakest pillar here, with its own copy of
   * a rule that also lives in services/readiness.js. Two implementations of one
   * rule is how a student gets told to work on aptitude while the score beside
   * it says coding; the README makes exactly that argument about readiness, and
   * the session card is the same thing one step further on.
   *
   * The client still owns the wording and the routes. The server picks WHAT to
   * practise; it has no business picking button labels.
   */
  const stretchPillar: PillarKey = (today?.weakestPillar as PillarKey) || "aptitude";
  const stretch = PILLAR_META[stretchPillar];
  const StretchIcon = stretch.icon;

  const recall = today?.blocks?.find((b) => b.kind === "recall");
  const recallCount = recall?.count ?? 0;
  const recallTopic = recall?.topic ?? null;

  const blocks = [
    {
      name: "Recall",
      minutes: today?.blocks?.find((b) => b.kind === "recall")?.minutes ?? 4,
      icon: RotateCcw,
      to: "/mastery/review",
      detail: recallCount
        ? `${recallCount} question${recallCount === 1 ? "" : "s"} you got wrong before`
        : recallTopic
          ? `5 questions on ${recallTopic.replace(/-/g, " ")}`
          : "5 questions once you have attempted a test",
    },
    {
      name: "Stretch",
      minutes: today?.blocks?.find((b) => b.kind === "stretch")?.minutes ?? 7,
      icon: StretchIcon,
      to: stretch.to,
      detail: `One ${stretch.label.toLowerCase()} task — your weakest area right now`,
    },
    {
      name: "Speak",
      minutes: today?.blocks?.find((b) => b.kind === "speak")?.minutes ?? 4,
      icon: MessageSquare,
      to: "/practice/interview",
      detail: "One interview question, recorded and scored",
    },
  ];

  const pct = (v: number | null | undefined) => (v != null ? `${v}%` : "—");

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Welcome */}
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
              <p className="text-muted-foreground">Here is what to work on today.</p>
            </>
          )}
        </div>

        {/* Shown ABOVE the dashboard rather than replacing it: the recall and
            practice links below still work when readiness is unavailable, and
            taking them away would be its own kind of lie. */}
        {!loadingData && loadError && (
          <QueryError
            what="your readiness scores"
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            className="mb-8"
          />
        )}

        {/* Today's session — the one thing on this screen that matters */}
        <Card className="mb-8 border-0 shadow-lg bg-gradient-primary">
          <CardHeader>
            <div className="flex justify-between items-start gap-6">
              <div>
                <CardTitle className="text-primary-foreground mb-2">Today&apos;s session</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  Three blocks, about 15 minutes, chosen from what you keep getting wrong
                </CardDescription>
              </div>
              <div className="text-right shrink-0">
                <div className="text-4xl font-bold text-primary-foreground">
                  {loadingData ? <Loader2 className="w-8 h-8 animate-spin ml-auto" /> : pct(readiness?.overall ?? null)}
                </div>
                <p className="text-sm text-primary-foreground/80">Ready</p>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="h-2 rounded-full bg-primary-foreground/20 overflow-hidden">
              <div
                className="h-full bg-primary-foreground rounded-full transition-all duration-700"
                style={{ width: `${readiness?.overall ?? 0}%` }}
              />
            </div>

            {/* the three blocks */}
            <div className="grid md:grid-cols-3 gap-3 mt-6">
              {blocks.map((b, i) => {
                const Icon = b.icon;
                return (
                  <Link key={b.name} to={b.to} className="block">
                    <div className="h-full rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-primary-foreground" />
                        <span className="text-sm font-semibold text-primary-foreground">
                          {i + 1}. {b.name}
                        </span>
                        <span className="ml-auto text-xs text-primary-foreground/70">{b.minutes} min</span>
                      </div>
                      <p className="text-xs text-primary-foreground/80 leading-relaxed">{b.detail}</p>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Link to={blocks[0].to}>
                <Button className="bg-background text-primary hover:bg-background/90">
                  Start session <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              {today != null && today.dueCount > 0 && (
                <span className="text-sm text-primary-foreground/80">
                  {today.dueCount} question{today.dueCount === 1 ? "" : "s"} waiting to be re-tried
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Where you stand */}
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          <Zap className="w-4 h-4" /> Where you stand
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {PILLAR_ORDER.map((key) => {
            const meta = PILLAR_META[key];
            const score = readiness?.[key]?.score ?? null;
            const isWeakest = key === stretchPillar && readiness?.hasAnyData;
            const Icon = meta.icon;
            return (
              <Link key={key} to={meta.to} className="block">
                <Card
                  className={`border h-full hover:shadow-md transition-shadow ${
                    isWeakest ? "border-warning/60" : "border-border"
                  }`}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{meta.label}</CardTitle>
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingData ? (
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <div className={`text-3xl font-bold ${score == null ? "text-muted-foreground" : "text-foreground"}`}>
                          {pct(score)}
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isWeakest ? "bg-warning" : "bg-primary"
                            }`}
                            style={{ width: `${score ?? 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {score == null ? "Not started yet" : isWeakest ? "Weakest area" : `Weight ${readiness?.[key]?.weight}%`}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Focus areas */}
        {weakTopics.length > 0 && (
          <>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              <Target className="w-4 h-4 text-destructive" /> Focus areas
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {weakTopics.slice(0, 3).map((t) => (
                <Card key={t.topic} className="border border-border">
                  <CardContent className="p-5">
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="font-semibold capitalize">{t.topic.replace(/-/g, " ")}</span>
                      <span
                        className={`font-bold ${t.accuracy < 45 ? "text-destructive" : "text-warning"}`}
                      >
                        {t.accuracy}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {Math.round((t.accuracy / 100) * t.answered)} of {t.answered} answered correctly
                    </p>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-4">
                      <div
                        className={`h-full rounded-full ${t.accuracy < 45 ? "bg-destructive" : "bg-warning"}`}
                        style={{ width: `${t.accuracy}%` }}
                      />
                    </div>
                    <Link
                      to="/practice/aptitude"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-2"
                    >
                      Practice 5 questions <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Nothing attempted yet. Suppressed on a load failure: readiness is
            undefined either way, and "Nothing scored yet" beneath a "could not
            load" banner contradicts it. */}
        {!loadingData && !loadError && !readiness?.hasAnyData && (
          <Card className="border border-border">
            <CardHeader>
              <CardTitle>Nothing scored yet</CardTitle>
              <CardDescription>
                Finish any one thing and your readiness score appears. The shortest route is a
                10-question aptitude test.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 flex flex-wrap gap-3">
              <Link to="/practice/aptitude">
                <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
                  Take a test <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link to="/practice">
                <Button variant="outline">Browse everything</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Mastery;
