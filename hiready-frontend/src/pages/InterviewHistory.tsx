import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, History, Clock, ShieldAlert, ShieldCheck, ChevronDown, MessageSquare,
  Calendar, Trash2, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchInterviewSessions, fetchInterviewSession, deleteInterviewSession,
  type InterviewSessionSummary, type ConversationTurn,
} from "@/lib/historyApi";

interface QuestionScore {
  question: string;
  answerSummary: string;
  score: number;
  rationale: string;
  category?: string;
}

interface SessionDetail {
  _id: string;
  role: string;
  experienceLevel: string;
  mode: "assessment" | "practice";
  durationSeconds: number;
  conversationLog: ConversationTurn[];
  integrity?: { violations: number; maxViolations: number; terminated: boolean };
  analysisJson?: { overallScore?: number; questionScores?: QuestionScore[] } | null;
}

const formatDuration = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

const InterviewHistory = () => {
  const [sessions, setSessions] = useState<InterviewSessionSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setSessions(await fetchInterviewSessions(50));
      } catch {
        toast.error("Failed to load interview history");
        setSessions([]);
      }
    })();
  }, []);

  const toggleSession = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await fetchInterviewSession(id);
      const analysis = (d.analysisJson ?? null) as SessionDetail["analysisJson"];
      setDetail({
        _id: id,
        role: d.role,
        experienceLevel: d.experienceLevel,
        mode: (d as { mode?: "assessment" | "practice" }).mode ?? "assessment",
        durationSeconds: d.durationSeconds,
        conversationLog: d.conversationLog,
        integrity: d.integrity,
        analysisJson: analysis,
      });
    } catch {
      toast.error("Failed to load session details");
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this interview session permanently?")) return;
    const ok = await deleteInterviewSession(id);
    if (ok) {
      setSessions((prev) => prev?.filter((s) => s._id !== id) ?? null);
      if (openId === id) {
        setOpenId(null);
        setDetail(null);
      }
      toast.success("Session deleted");
    } else {
      toast.error("Failed to delete session");
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <History className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Interview History</h1>
            <p className="text-sm text-muted-foreground">
              Every session is saved — re-open transcripts, scores and proctoring records
            </p>
          </div>
        </div>

        {sessions === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <MessageSquare className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground">No interviews yet. Complete your first mock interview to build history.</p>
              <Button variant="outline">Start one from the Dashboard</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((s) => {
              const isOpen = openId === s._id;
              return (
                <Card key={s._id} className="border border-border overflow-hidden">
                  <button
                    onClick={() => toggleSession(s._id)}
                    className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{s.role}</span>
                        <Badge variant="outline" className="text-[10px]">{s.experienceLevel}</Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${s.mode === "assessment" ? "text-destructive border-destructive/40" : "text-success border-success/40"}`}
                        >
                          {s.mode}
                        </Badge>
                        {s.integrity?.terminated && (
                          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/40">
                            TERMINATED
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(s.createdAt).toLocaleString()}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(s.durationSeconds)}</span>
                        <span className={`inline-flex items-center gap-1 ${(s.integrity?.violations ?? 0) > 0 ? "text-warning" : ""}`}>
                          {(s.integrity?.violations ?? 0) > 0 ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                          {s.integrity?.violations ?? 0} violation{(s.integrity?.violations ?? 0) === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <CardContent className="pt-0 pb-4 border-t border-border">
                      {detailLoading || !detail ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="space-y-5 pt-4">
                          {/* Overall score if analyzed */}
                          {typeof detail.analysisJson?.overallScore === "number" && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 w-fit">
                              <Gauge className="w-5 h-5 text-primary" />
                              <span className="text-sm font-semibold text-foreground">
                                Overall: {detail.analysisJson.overallScore}/100
                              </span>
                            </div>
                          )}

                          {/* Per-question scoring */}
                          {!!detail.analysisJson?.questionScores?.length && (
                            <div>
                              <p className="text-sm font-semibold mb-2">Per-question scoring</p>
                              <div className="space-y-2">
                                {detail.analysisJson.questionScores.map((q, i) => (
                                  <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border">
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-sm font-medium text-foreground">{q.question}</p>
                                      <span className={`text-sm font-bold shrink-0 ${
                                        q.score >= 7 ? "text-success" : q.score >= 4 ? "text-warning" : "text-destructive"
                                      }`}>
                                        {q.score}/10
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{q.answerSummary}</p>
                                    <p className="text-xs text-muted-foreground mt-1 italic">{q.rationale}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Transcript */}
                          <div>
                            <p className="text-sm font-semibold mb-2">Transcript ({detail.conversationLog.length} turns)</p>
                            <div className="max-h-72 overflow-y-auto space-y-2 pr-2">
                              {detail.conversationLog.map((turn, i) => (
                                <div
                                  key={i}
                                  className={`p-3 rounded-lg text-sm ${
                                    turn.role === "interviewer"
                                      ? "bg-primary/5 border border-primary/15"
                                      : "bg-accent/5 border border-accent/15"
                                  }`}
                                >
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                                    {turn.role === "interviewer" ? "Interviewer" : "You"}
                                  </p>
                                  {turn.text}
                                </div>
                              ))}
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(s._id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="mr-2 w-4 h-4" /> Delete session
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default InterviewHistory;
