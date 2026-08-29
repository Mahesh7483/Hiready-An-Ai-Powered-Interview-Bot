import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, FileText, ChevronDown, Trash2, GitCompareArrows, TrendingUp, Calendar, Pencil, Search, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  fetchResumeHistory, fetchResumeAnalysis, deleteResumeAnalysis, renameResumeAnalysis,
  type ResumeHistoryItem,
} from "@/lib/historyApi";

const ScorePill: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
    {label}
    <strong className={
      value >= 70 ? "text-success" : value >= 50 ? "text-warning" : "text-destructive"
    }>{value}</strong>
  </span>
);

const ResumeHistory = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ResumeHistoryItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareData, setCompareData] = useState<[ResumeHistoryItem, ResumeHistoryItem] | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        setItems(await fetchResumeHistory(50));
      } catch {
        toast.error("Failed to load resume history");
        setItems([]);
      }
    })();
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 2) next.add(id);
      else {
        const arr = Array.from(next);
        next.clear();
        next.add(arr[1]);
        next.add(id);
      }
      return next;
    });
  };

  const openReport = async (id: string) => {
    try {
      const full = await fetchResumeAnalysis(id);
      sessionStorage.setItem("resumeAnalysis", JSON.stringify(full.resultJson ?? full));
      navigate("/resume-report");
    } catch {
      toast.error("Failed to open report");
    }
  };

  const runCompare = async () => {
    if (selected.size !== 2) return;
    setCompareLoading(true);
    try {
      const ids = Array.from(selected);
      const list = items ?? [];
      const a = list.find((i) => i._id === ids[0]);
      const b = list.find((i) => i._id === ids[1]);
      if (a && b) setCompareData([a, b]);
    } finally {
      setCompareLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this saved analysis permanently?")) return;
    if (await deleteResumeAnalysis(id)) {
      setItems((prev) => prev?.filter((i) => i._id !== id) ?? null);
      setSelected(new Set());
      setCompareData(null);
      toast.success("Deleted");
    } else {
      toast.error("Failed to delete");
    }
  };

  const handleRename = async (id: string, current: string = "") => {
    const label = window.prompt("Label this analysis (e.g. 'Google variant')", current);
    if (label === null) return;
    if (await renameResumeAnalysis(id, label.trim())) {
      setItems((prev) =>
        prev?.map((i) => (i._id === id ? { ...i, label: label.trim() } : i)) ?? null
      );
      toast.success(label.trim() ? "Renamed" : "Label cleared");
    } else {
      toast.error("Failed to rename");
    }
  };

  const timeline = [...(items ?? [])]
    .reverse()
    .map((r) => ({
      date: new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      score: r.overallScore,
    }));

  // Filter items based on search query and score filter
  const filteredItems = items
    ? items.filter((r) => {
        const matchesSearch =
          !searchQuery ||
          r.targetRole.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.label?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
          (r.missingKeywords?.some?.(k => k.toLowerCase().includes(searchQuery.toLowerCase())) ?? false);
        const matchesScore =
          scoreFilter === "all" ||
          (scoreFilter === "80+" && r.overallScore >= 80) ||
          (scoreFilter === "60-79" && r.overallScore >= 60 && r.overallScore <= 79) ||
          (scoreFilter === "40-59" && r.overallScore >= 40 && r.overallScore <= 59) ||
          (scoreFilter === "<40" && r.overallScore < 40);
        return matchesSearch && matchesScore;
      })
    : null;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Resumes</h1>
            <p className="text-sm text-muted-foreground">
              Every analysis is saved — track progress and compare versions
            </p>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by role, label, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={scoreFilter} onValueChange={setScoreFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All scores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scores</SelectItem>
              <SelectItem value="80+">80+ (Excellent)</SelectItem>
              <SelectItem value="60-79">60–79 (Good)</SelectItem>
              <SelectItem value="40-59">40–59 (Needs Work)</SelectItem>
              <SelectItem value="<40">Below 40 (Poor)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Timeline chart */}
        {filteredItems && timeline.length >= 2 && (
          <Card className="border border-border mb-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Score Over Time</CardTitle>
              </div>
              <CardDescription>Overall score across all your analyses</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
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

        {/* Compare bar */}
        <div
          className={`mb-6 p-3 rounded-lg border flex items-center justify-between transition-colors ${
            selected.size === 2 ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"
          }`}
        >
          <p className="text-sm text-muted-foreground px-2">
            Select <strong>2 analyses</strong> to compare — {selected.size} selected
          </p>
          <Button size="sm" disabled={selected.size !== 2 || compareLoading} onClick={runCompare}>
            <GitCompareArrows className="mr-2 w-4 h-4" />
            {compareLoading ? "Loading…" : "Compare"}
          </Button>
        </div>

        {/* Comparison table */}
        {compareData && (
          <Card className="border-primary/30 mb-8">
            <CardHeader>
              <CardTitle className="text-lg">Side-by-Side Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">Metric</th>
                    <th className="pb-2 pr-4">Version A</th>
                    <th className="pb-2">Version B</th>
                    <th className="pb-2">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Overall", "overallScore", "number"],
                    ["ATS", "atsScore", "number"],
                    ["Keywords", "keywordMatch", "number"],
                    ["Format", "formatScore", "number"],
                    ["Missing Keywords (count)", "missingKeywords", "array"],
                  ] as const).map(([label, key, type]) => {
                    let a: number | string | string[] = compareData[0][key];
                    let b: number | string | string[] = compareData[1][key];
                    if (type === "array") {
                      a = (a as string[]).length;
                      b = (b as string[]).length;
                    }
                    const delta = Number(b) - Number(a);
                    return (
                      <tr key={key} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-4 font-medium">{label}</td>
                        <td className="py-2 pr-4">{type === "array" ? String(a) : String(a)}</td>
                        <td className="py-2">{type === "array" ? String(b) : String(b)}</td>
                        <td className={`py-2 font-semibold ${delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* History list */}
        {filteredItems === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground">
                {searchQuery || scoreFilter !== "all"
                  ? "No analyses match your search/filter."
                  : "No saved analyses yet — upload a resume to get started."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((r) => {
              const isSelected = selected.has(r._id);
              return (
                <div
                  key={r._id}
                  className={`rounded-lg border-2 transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(r._id)}
                      className="w-4 h-4 accent-[hsl(var(--primary))] shrink-0"
                    />
                    <button onClick={() => openReport(r._id)} className="flex-1 min-w-0 text-left group">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.label && (
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-medium">{r.label}</span>
                        )}
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {r.targetRole}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{r.experienceLevel}</Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${r.overallScore >= 70 ? "text-success border-success/40" : r.overallScore >= 50 ? "text-warning border-warning/40" : "text-destructive border-destructive/40"}`}
                        >
                          {r.overallScore}/100
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(r.createdAt).toLocaleString()}</span>
                        <ScorePill label="ATS" value={r.atsScore} />
                        <ScorePill label="KW" value={r.keywordMatch} />
                        <ScorePill label="Format" value={r.formatScore} />
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openReport(r._id)}>
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Rename"
                        onClick={() => handleRename(r._id, r.label ?? "")}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(r._id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ResumeHistory;