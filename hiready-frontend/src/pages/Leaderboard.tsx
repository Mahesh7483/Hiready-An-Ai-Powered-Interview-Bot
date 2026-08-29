import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Medal, Crown, Flame, Mic } from "lucide-react";
import { apiJson } from "@/lib/api";

interface LeaderboardRow {
  rank: number;
  name: string;
  tests: number;
  accuracy: number;
  bestScorePct: number;
  isCaller?: boolean;
}

interface InterviewLeaderboardRow {
  rank: number;
  name: string;
  sessions: number;
  avgScore: number;
  bestScore: number;
  isCaller?: boolean;
}

const RANK_STYLES: Record<number, string> = {
  1: "bg-warning/15 text-warning border-warning/40",
  2: "bg-muted text-foreground border-border",
  3: "bg-orange-500/10 text-orange-600 border-orange-500/30",
};

const rankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="w-4 h-4" />;
  if (rank <= 3) return <Medal className="w-4 h-4" />;
  return null;
};

const Leaderboard = () => {
  const [tab, setTab] = useState<"aptitude" | "interview">("aptitude");
  const [range, setRange] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<(LeaderboardRow | InterviewLeaderboardRow)[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    (async () => {
      try {
        const data =
          tab === "aptitude"
            ? await apiJson<{ leaderboard: LeaderboardRow[] }>(
                `/questions/leaderboard?range=${range}`
              )
            : await apiJson<{ leaderboard: InterviewLeaderboardRow[] }>(
                `/interviews/sessions/leaderboard`
              );
        if (!cancelled) setRows(data.leaderboard ?? []);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, range]);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Leaderboard</h1>
            <p className="text-sm text-muted-foreground">
              {tab === "aptitude"
                ? "Ranked by overall accuracy on aptitude tests"
                : "Ranked by AI-analyzed interview scores"}
            </p>
          </div>
        </div>

        {/* Module tabs */}
        <div className="flex gap-2 p-1 rounded-lg bg-muted/60 w-fit mb-4">
          <button
            onClick={() => setTab("aptitude")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              tab === "aptitude" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Trophy className="w-4 h-4" /> Aptitude
          </button>
          <button
            onClick={() => setTab("interview")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              tab === "interview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mic className="w-4 h-4" /> Interview
          </button>
        </div>

        {/* Range toggle (aptitude only) */}
        {tab === "aptitude" && (
        <div className="flex gap-2 p-1 rounded-lg bg-muted/60 w-fit mb-6">
          <button
            onClick={() => setRange("week")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              range === "week" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Flame className="w-4 h-4" /> This Week
          </button>
          <button
            onClick={() => setRange("all")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              range === "all" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Time
          </button>
        </div>
        )}

        <Card className="border border-border overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {tab === "interview"
                ? "Interview Top 25"
                : range === "week"
                ? "Weekly Top 25"
                : "All-Time Top 25"}
            </CardTitle>
            <CardDescription>
              {tab === "interview"
                ? "Average AI-analyzed score across your completed voice interviews"
                : range === "week"
                ? "Timed test-mode results from the last 7 days"
                : "Every graded question across all your tests"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {rows === null ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                No results yet{range === "week" ? " this week" : ""}. Take a timed test to appear here!
              </p>
            ) : (
              <div className="space-y-1.5">
                {rows.map((row) => {
                  const a = row as LeaderboardRow;
                  const i = row as InterviewLeaderboardRow;
                  const subtitle =
                    tab === "aptitude"
                      ? `${a.tests} test${a.tests === 1 ? "" : "s"} · best ${Math.round(a.bestScorePct)}%`
                      : `${i.sessions} session${i.sessions === 1 ? "" : "s"} · best ${Math.round(i.bestScore)}%`;
                  const score = tab === "aptitude" ? a.accuracy : Math.round(i.avgScore);
                  return (
                    <div
                      key={row.rank}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        row.isCaller
                          ? "border-primary/50 bg-primary/5"
                          : row.rank <= 3
                          ? `border ${RANK_STYLES[row.rank]}`
                          : "border-transparent bg-muted/20"
                      }`}
                    >
                      <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                        row.rank <= 3 ? RANK_STYLES[row.rank] : "bg-muted text-muted-foreground"
                      }`}>
                        {rankIcon(row.rank) ?? row.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                          {row.name}
                          {row.isCaller && (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/40">You</Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{subtitle}</p>
                      </div>
                      <span className={`text-lg font-bold ${
                        score >= 80 ? "text-success" : score >= 60 ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {score}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Button variant="outline" onClick={() => window.location.assign("/aptitude/test")}>
            Climb the ranks — take a timed test
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Leaderboard;
