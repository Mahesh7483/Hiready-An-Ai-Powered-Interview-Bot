import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeEditor } from "@/components/coding/CodeEditor";
import { Loader2, Clock, Coffee, Mic, ShieldAlert, ArrowRight, Play } from "lucide-react";
import { toast } from "sonner";
import { assessmentAPI, type AttemptDTO, type AssessmentSectionDTO } from "@/lib/assessmentApi";
import { apiJson, getAuthHeaders, API_BASE_URL } from "@/lib/api";
import { reportViolationEvent } from "@/lib/assessmentProctor";
import { registerWebcamStream, captureWebcamSnapshot } from "@/lib/webcamSnap";

interface QuizQ {
  _id: string;
  Question: string;
  "Option A": string | number;
  "Option B": string | number;
  "Option C": string | number;
  "Option D": string | number;
}

interface CodingQuestionDTO {
  _id: string;
  title: string;
  description: string;
  difficulty: string;
  constraints?: string;
  starterCode?: Record<string, string>;
  testCases?: Array<{ input: string; output: string }>;
}

const PAUSE_LABELS: Record<string, string> = {
  A: "Option A", B: "Option B", C: "Option C", D: "Option D",
};

const AssessmentPipeline = () => {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<AttemptDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // aptitude stage
  const [quizQuestions, setQuizQuestions] = useState<QuizQ[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sectionRemaining, setSectionRemaining] = useState<number | null>(null);

  // coding stage
  const [codingIndex, setCodingIndex] = useState(0);
  const [codingQuestion, setCodingQuestion] = useState<CodingQuestionDTO | null>(null);
  const [codingCode, setCodingCode] = useState("");
  const [codingLang, setCodingLang] = useState("javascript");
  const [codingRunning, setCodingRunning] = useState(false);
  const [codingOutput, setCodingOutput] = useState<string>("");
  const submissionIdsRef = useRef<string[]>([]);
  const faceCheckKeyRef = useRef<string>("");

  const loadCurrent = useCallback(async () => {
    try {
      const data = await assessmentAPI.current();
      if (!data.attempt) {
        toast.info("No assessment in progress");
        navigate("/assessments");
        return;
      }
      setAttempt(data.attempt);
    } catch {
      toast.error("Failed to load assessment");
      navigate("/assessments");
    }
  }, [navigate]);

  useEffect(() => {
    loadCurrent().finally(() => setLoading(false));
  }, [loadCurrent]);

  // ── Load section data when the active section changes ──
  const activeSection: AssessmentSectionDTO | undefined = attempt?.sections[attempt.currentSectionIndex];

  useEffect(() => {
    if (!attempt || !activeSection || attempt.status !== "in_progress") return;
    let cancelled = false;

    if (activeSection.type === "aptitude") {
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/assessment/attempt/${attempt._id}/section/${activeSection.index}/questions`,
            { headers: getAuthHeaders() }
          );
          if (!res.ok) throw new Error("Failed to load questions");
          const qs: QuizQ[] = await res.json();
          if (!cancelled) setQuizQuestions(qs);
        } catch {
          if (!cancelled) toast.error("Failed to load section questions");
        }
      })();
      setQuizQuestions([]); // clear while loading
    }

    if (activeSection.type === "coding") {
      const ids = activeSection.state.codingQuestionIds || [];
      if (ids[codingIndex]) {
        (async () => {
          try {
            const q = await assessmentAPI.getCodingQuestion(ids[codingIndex]);
            if (!cancelled) {
              setCodingQuestion(q);
              setCodingCode(q.starterCode?.[codingLang] || "");
            }
          } catch {
            if (!cancelled) toast.error("Failed to load coding question");
          }
        })();
      }
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only on section/idx change
  }, [attempt, attempt?.currentSectionIndex, attempt?.status, codingIndex, codingLang]);

    // ── Server-clock section timer ──
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !attempt.sectionStartedAt) {
      setSectionRemaining(null);
      return;
    }
    const section = attempt.sections[attempt.currentSectionIndex];
    if (!section) return;
    const deadline = new Date(attempt.sectionStartedAt).getTime() + section.minutes * 60000;

    const tick = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSectionRemaining(remaining);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [attempt, attempt?.currentSectionIndex, attempt?.status, attempt?.sectionStartedAt]);

  // ── Violations: tab switch / window blur (weighted server-side) ──
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    const attemptId = attempt._id;
    const handler = (type: string) => {
      reportViolationEvent(attemptId, type);
    };
    const onVis = () => { if (document.hidden) handler("tab_switch"); };
    const onBlur = () => handler("window_blur");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
    };
  }, [attempt, attempt?.status, attempt?._id]);

  // ── Webcam stream for section-boundary face re-verification ──
  useEffect(() => {
    if (!attempt || attempt.status === "completed" || attempt.status === "auto_submitted") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        registerWebcamStream(s);
      })
      .catch(() => {
        /* camera unavailable — evidence is best-effort, never blocks the attempt */
      });
    return () => {
      cancelled = true;
      registerWebcamStream(null);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (re)register once per attempt
  }, [attempt?._id]);

  // ── Face re-verification at each section boundary (same person throughout?) ──
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !attempt.sectionStartedAt) return;
    const key = `${attempt._id}:${attempt.currentSectionIndex}:${attempt.sectionStartedAt}`;
    if (faceCheckKeyRef.current === key) return;
    faceCheckKeyRef.current = key;
    const attemptId = attempt._id;
    // Retry briefly so the camera has frames once the section just started
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const snapshot = captureWebcamSnapshot();
      if (snapshot || tries >= 5) {
        clearInterval(timer);
        try {
          await assessmentAPI.faceCheck(attemptId, snapshot);
        } catch {
          /* evidence is best-effort */
        }
      }
    }, 700);
    return () => clearInterval(timer);
  }, [attempt, attempt?.status, attempt?.currentSectionIndex, attempt?.sectionStartedAt]);

  // ── Stage transitions ──
  const submitAptitude = async () => {
    if (!attempt || !activeSection) return;
    setSubmitting(true);
    try {
      const payload = {
        answers: Object.entries(answers).map(([questionId, selected]) => ({ questionId, selected })),
      };
      const data = await assessmentAPI.submitSection(attempt._id, activeSection.index, payload);
      setAttempt(data.attempt);
      setAnswers({});
      toast.success("Section submitted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const runCoding = async () => {
    if (!codingQuestion) return;
    setCodingRunning(true);
    setCodingOutput("");
    try {
      const res = await fetch(`${API_BASE_URL}/code/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code: codingCode, language: codingLang, timeLimit: 10000 }),
      });
      const data = await res.json();
      setCodingOutput(data.stdout || data.stderr || "(no output)");
    } catch {
      toast.error("Execution failed");
    } finally {
      setCodingRunning(false);
    }
  };

  const submitCoding = async () => {
    if (!attempt || !codingQuestion || !activeSection) return;
    setSubmitting(true);
    try {
      const sub = await apiJson<{ submissionId?: string; _id?: string }>(
        `/code/submit/${codingQuestion._id}`,
        { method: "POST", body: JSON.stringify({ code: codingCode, language: codingLang }) }
      );
      const sid = sub.submissionId || sub._id;
      if (sid) submissionIdsRef.current.push(sid);
      const ids = activeSection.state.codingQuestionIds || [];
      if (codingIndex < ids.length - 1) {
        setCodingIndex((i) => i + 1);
        setCodingQuestion(null);
        toast.success("Solution submitted — next problem");
      } else {
        const data = await assessmentAPI.submitSection(attempt._id, activeSection.index, {
          submissionIds: submissionIdsRef.current,
        });
        setAttempt(data.attempt);
        submissionIdsRef.current = [];
        setCodingIndex(0);
        toast.success("Coding section submitted");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submitVoice = async () => {
    if (!attempt || !activeSection) return;
    setSubmitting(true);
    try {
      let durationSeconds = 0;
      try {
        const m = JSON.parse(sessionStorage.getItem("interviewMetrics") || "{}");
        durationSeconds = m?.totals?.speakingSec || 0;
      } catch { /* ignore */ }
      const data = await assessmentAPI.submitSection(attempt._id, activeSection.index, {
        durationSeconds,
        conversationTurns: 0,
      });
      setAttempt(data.attempt);
      toast.success("Interview section complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const endBreak = async () => {
    if (!attempt) return;
    try {
      const data = await assessmentAPI.endBreak(attempt._id);
      setAttempt(data.attempt);
    } catch {
      toast.error("Failed to end break");
    }
  };

    // ── Auto-submit when the section clock hits zero ──
  useEffect(() => {
    if (sectionRemaining === 0 && !submitting && attempt?.status === "in_progress") {
      const t = attempt.sections[attempt.currentSectionIndex]?.type;
      if (t === "aptitude") submitAptitude();
      else if (t === "coding") submitCoding();
      else if (t === "voice-interview") submitVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per zero-tick
  }, [sectionRemaining]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!attempt) return null;

  // ── Report view ──
  if (attempt.status === "completed" || attempt.status === "auto_submitted") {
    return (
      <DashboardLayout>
        <div className="p-6 lg:p-8 max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Assessment {attempt.status === "auto_submitted" ? "Auto-Submitted" : "Complete"}
          </h1>
          <p className="text-muted-foreground mb-8">{attempt.templateTitle}</p>
          <Card className="mb-6">
            <CardContent className="py-8 text-center">
              <p className="text-5xl font-bold text-primary">
                {attempt.sectionResults.reduce((s, r) => s + r.score, 0).toFixed(1)}
              </p>
              <p className="text-muted-foreground mt-2">Total score</p>
              <div className="flex justify-center gap-6 mt-6">
                {attempt.sectionResults.map((r, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-semibold text-foreground">{r.score}/{r.maxScore}</p>
                    <p className="text-muted-foreground text-xs">{r.type}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-6">
                Integrity score: {attempt.violationScore} (lower is better)
              </p>
            </CardContent>
          </Card>
          <Button className="w-full" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

    // ── Break view ──
  if (attempt.status === "in_break") {
    const nextSection = attempt.sections[attempt.currentSectionIndex];
    const minsLeft = attempt.breakEndsAt
      ? Math.max(0, Math.round((new Date(attempt.breakEndsAt).getTime() - Date.now()) / 60000))
      : 0;
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <Coffee className="w-12 h-12 text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">☕ Break Time</h1>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            Section complete. Relax — the next section starts when you're ready.
            {attempt.breakEndsAt && <> Break auto-ends in ~{minsLeft} min.</>}
          </p>
          <Card className="mb-6 p-4">
            <p className="text-sm text-muted-foreground">
              Next up: <span className="font-semibold text-foreground">{nextSection?.title || nextSection?.type}</span>
            </p>
          </Card>
          <Button size="lg" onClick={endBreak} className="bg-gradient-primary text-white">
            <Play className="w-4 h-4 mr-2" /> Continue to next section
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const section = activeSection;
  if (!section) return null;

  // ── In-progress section render ──
  const remainingMin = sectionRemaining !== null ? Math.ceil(sectionRemaining / 60) : section.minutes;
  const progressPct =
    sectionRemaining !== null && section.minutes > 0
      ? Math.max(0, Math.min(100, (sectionRemaining / (section.minutes * 60)) * 100))
      : 100;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header: title + timer + integrity */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {section.title || section.type}
              <span className="ml-3 text-sm font-normal text-muted-foreground">
                Section {attempt.currentSectionIndex + 1}/{attempt.sections.length}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {section.type === "aptitude" && `Topic: ${section.topic || "Mixed"} · ${section.state.count || 0} questions`}
              {section.type === "coding" && `${section.state.count || 0} problems to solve`}
              {section.type === "voice-interview" && "Answer aloud — the AI listens"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Clock className="w-4 h-4" />
              <span className={remainingMin <= 2 ? "text-red-600" : ""}>{fmtTime(sectionRemaining ?? 0)}</span>
            </div>
            <Badge variant="outline" className="gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              {attempt.violationScore} / {attempt.violationThreshold}
            </Badge>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-6">
          <div
            className={`h-full transition-all duration-1000 ${progressPct <= 20 ? "bg-red-500" : "bg-primary"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
{/* ── APTITUDE STAGE ── */}
        {section.type === "aptitude" && (
          <div className="space-y-4 mb-8">
            {quizQuestions.map((q, qi) => {
              const order = activeSection?.state.optionOrder?.[q._id] || ["A", "B", "C", "D"];
              return (
                <Card key={q._id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium">
                      Q{qi + 1}. {q.Question}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {order.map((letter) => {
                      const value = q[`Option ${letter}` as keyof QuizQ];
                      const selected = answers[q._id] === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q._id]: letter }))}
                          className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-input hover:border-primary/50 text-foreground"
                          }`}
                        >
                          <span className="font-semibold mr-2">{letter}.</span>
                          {String(value ?? "")}
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}

            {quizQuestions.length === 0 && (
              <Card>
                <CardContent className="text-center text-muted-foreground py-10">
                  Loading questions…
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {Object.keys(answers).length}/{quizQuestions.length} answered
              </p>
              <Button onClick={submitAptitude} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Submit section
              </Button>
            </div>
          </div>
        )}
{/* ── CODING STAGE ── */}
        {section.type === "coding" && (
          <div className="space-y-4 mb-8">
            {codingQuestion ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg">{codingQuestion.title}</CardTitle>
                      <Badge variant="outline" className="shrink-0">{codingQuestion.difficulty}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{codingQuestion.description}</p>
                    {codingQuestion.constraints && (
                      <p className="text-xs text-muted-foreground mt-3 whitespace-pre-wrap">
                        <span className="font-semibold">Constraints:</span> {codingQuestion.constraints}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <CodeEditor code={codingCode} onChange={setCodingCode} language={codingLang} />
                  </CardContent>
                </Card>

                <div className="flex items-center gap-3">
                  <select
                    value={codingLang}
                    onChange={(e) => {
                      setCodingLang(e.target.value);
                      setCodingCode(codingQuestion.starterCode?.[e.target.value] || "");
                    }}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {["python", "javascript", "java", "go", "cpp"].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <Button variant="outline" onClick={runCoding} disabled={codingRunning || !codingCode.trim()}>
                    {codingRunning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                    Run
                  </Button>
                  <Button onClick={submitCoding} disabled={submitting}>
                    {codingIndex < (section.state.count || 1) - 1 ? "Submit & next" : "Finish coding"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Problem {codingIndex + 1}/{section.state.count || 1}
                  </span>
                </div>

                {codingOutput && (
                  <Card>
                    <CardContent className="font-mono text-xs whitespace-pre-wrap text-foreground pt-4">
                      {codingOutput}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="text-center text-muted-foreground py-10">
                  Loading problem…
                </CardContent>
              </Card>
            )}
          </div>
        )}

{/* ── VOICE INTERVIEW STAGE ── */}
        {section.type === "voice-interview" && (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <Mic className="w-10 h-10 text-primary mx-auto" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">Voice Interview</h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mt-2">
                  Questions will be asked aloud by the interview coach. Answer naturally —
                  your responses are analyzed for delivery and content.
                </p>
              </div>
              <div className="text-left max-w-md mx-auto bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                {(activeSection?.state.focusAreas?.length ? activeSection.state.focusAreas : []).map((f, i) => (
                  <p key={i}>• {f}</p>
                ))}
              </div>
              <Button size="lg" onClick={submitVoice} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArrowRight className="w-4 h-4 mr-1" />}
                I'm done with the interview
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AssessmentPipeline;