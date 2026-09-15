import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Search, ShieldAlert, ShieldCheck } from "lucide-react";

import { CodeEditor } from "@/components/coding/CodeEditor";
import { ExecutionOutput, type ExecutionResult } from "@/components/coding/ExecutionOutput";
import { ProblemPanel, type CodingQuestionDetail } from "@/components/coding/ProblemPanel";
import { SessionHeader } from "@/components/coding/SessionHeader";
import {
  SubmissionResult, type CodeReview, type SubmissionOutcome,
} from "@/components/coding/SubmissionResult";
import { useStrictProctoring, type ProctoringMode } from "@/hooks/useStrictProctoring";
import { API_BASE_URL, getAuthHeaders } from "@/lib/api";
import {
  codeKey, DEFAULT_CODE, DEFAULT_MINUTES, DURATION_CHOICES, LANGUAGES,
} from "@/lib/coding";

/**
 * Coding practice and interview.
 *
 * Rewritten. The previous version put the problem statement in two thirds of
 * the width and the editor in one; promised proctoring and a countdown that
 * did not exist; offered Technical and Behavioral modes that nothing branched
 * on; and displayed the sandbox's 2000ms execution cap as "1 min" of interview
 * time. Everything it claims here is implemented.
 */

type Phase = "start" | "workspace" | "result";

/** Desktop gets the resizable split; narrow screens get tabs. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

const CodingInterview = () => {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDesktop = useIsDesktop();

  const [phase, setPhase] = useState<Phase>("start");
  const [questions, setQuestions] = useState<CodingQuestionDetail[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"all" | "easy" | "medium" | "hard">("all");

  const [question, setQuestion] = useState<CodingQuestionDetail | null>(null);
  const [language, setLanguage] = useState("python");
  const [mode, setMode] = useState<ProctoringMode>("practice");
  const [minutes, setMinutes] = useState(20);

  const [code, setCode] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SubmissionOutcome | null>(null);
  const [review, setReview] = useState<CodeReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("problem");

  const sessionIdRef = useRef(`coding-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  // Read by the timer and the proctor terminator, both of which run outside React's
  // render flow and would otherwise capture a stale draft.
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);
  const submittingRef = useRef(false);

  // ── questions ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/code/questions?limit=100`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed to load (${res.status})`);
        const data = await res.json();
        if (!cancelled) setQuestions(data.questions ?? []);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Could not load questions");
      } finally {
        if (!cancelled) setLoadingQuestions(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions.filter((q) => {
      if (difficulty !== "all" && q.difficulty !== difficulty) return false;
      if (!term) return true;
      return q.title.toLowerCase().includes(term) || q.category.toLowerCase().includes(term);
    });
  }, [questions, search, difficulty]);

  // ── code load / persist, per question AND language ───────────────────────
  // Switching language no longer destroys work: each language keeps its own
  // draft, so there is nothing to confirm and nothing to lose.
  useEffect(() => {
    if (!question) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(codeKey(question._id, language)); } catch { /* private window */ }
    setCode(saved ?? question.starterCode?.[language] ?? DEFAULT_CODE[language] ?? "");
  }, [question, language]);

  useEffect(() => {
    if (!question || !code) return;
    try { localStorage.setItem(codeKey(question._id, language), code); } catch { /* quota or private window */ }
  }, [code, question, language]);

  // ── submission ───────────────────────────────────────────────────────────
  const requestReview = useCallback(async (source: string, outcomeLabel: string, title: string) => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/code-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code: source, language, problemTitle: title, outcome: outcomeLabel }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Review failed (${res.status})`);
      setReview(await res.json());
    } catch (e) {
      // The verdict and per-test results above are the real feedback; a missing
      // review degrades the page, it does not break it.
      setReviewError(e instanceof Error ? e.message : "Could not produce a code review.");
    } finally {
      setReviewLoading(false);
    }
  }, [language]);

  const submit = useCallback(async (reason: "manual" | "timeout" | "violations") => {
    if (submittingRef.current || !question) return;
    const source = codeRef.current;
    if (!source.trim()) {
      if (reason === "manual") toast.error("Write some code before submitting");
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/code/submit/${question._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code: source, language }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Submission failed (${res.status})`);
      const data: SubmissionOutcome = await res.json();

      setOutcome(data);
      setReview(null);
      setStartedAt(null);
      setRemaining(null);
      setPhase("result");
      if (reason === "timeout") toast.warning("Time is up — your code was submitted automatically.");
      requestReview(source, `${data.status}, ${data.passedCount}/${data.total} tests passed`, question.title);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [question, language, requestReview]);

  // ── proctoring ───────────────────────────────────────────────────────────
  const handleTerminate = useCallback(() => {
    // Submit rather than discard: the candidate's work still counts.
    submit("violations");
  }, [submit]);

  const proctoring = useStrictProctoring({
    sessionId: sessionIdRef.current,
    mode,
    active: phase === "workspace",
    onTerminate: handleTerminate,
  });

  // ── timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "workspace" || startedAt === null) return;
    const total = minutes * 60;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, total - elapsed);
      setRemaining(left);
      if (left === 0) submit("timeout");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, startedAt, minutes, submit]);

  // ── actions ──────────────────────────────────────────────────────────────
  const start = async () => {
    if (!question) { toast.error("Pick a question first"); return; }
    setExecutionResult(null);
    setOutcome(null);
    setReview(null);
    setReviewError(null);
    setStartedAt(Date.now());
    setPhase("workspace");
    setMobileTab("code");
    if (mode === "interview") {
      try { await document.documentElement.requestFullscreen?.(); } catch { /* user may refuse */ }
    }
  };

  const runTests = async () => {
    if (!code.trim()) { toast.error("Write some code first"); return; }
    if (!question) return;
    setIsRunning(true);
    setExecutionResult(null);
    if (!isDesktop) setMobileTab("output");
    try {
      const res = await fetch(`${API_BASE_URL}/code/run-tests/${question._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code, language }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Execution failed (${res.status})`);

      setExecutionResult({
        success: Boolean(data.success),
        stdout: data.stdout ?? "",
        stderr: data.stderr ?? "",
        exitCode: data.success ? 0 : 1,
        executionTime: data.testResults?.[0]?.executionTime ?? 0,
        timedOut: false,
        testResults: data.testResults,
      });
      if (data.success) toast.success(`All ${data.total} sample tests passed`);
      else toast.warning(`${data.passedCount}/${data.total} sample tests passed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  const leaveSession = () => {
    setExitOpen(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setPhase("start");
    setStartedAt(null);
    setRemaining(null);
  };

  // ── start screen ─────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <DashboardLayout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Coding practice</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pick a problem, choose how you want to be held to it, and start writing.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Problems</CardTitle>
                <CardDescription>
                  {loadingQuestions
                    ? "Loading…"
                    : `${visibleQuestions.length} of ${questions.length} shown`}
                </CardDescription>
                <div className="flex flex-wrap gap-2 pt-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by title or topic"
                      className="pl-8 h-9"
                    />
                  </div>
                  <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                    <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All levels</SelectItem>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loadingQuestions ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading problems…
                  </div>
                ) : visibleQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    {questions.length === 0
                      ? "No coding questions are published yet. An admin can add them under Coding Bank."
                      : "Nothing matches that filter."}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {visibleQuestions.map((q) => {
                      const selected = question?._id === q._id;
                      return (
                        <button
                          key={q._id}
                          type="button"
                          onClick={() => { setQuestion(q); setMinutes(DEFAULT_MINUTES[q.difficulty] ?? 20); }}
                          className={`w-full text-left rounded-lg border p-3 transition-colors ${
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/50"
                          }`}
                        >
                          <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] capitalize">{q.difficulty}</Badge>
                            <Badge variant="secondary" className="text-[10px] capitalize">{q.category}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Session</CardTitle>
                <CardDescription>
                  {question ? question.title : "Select a problem to begin"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="coding-language">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="coding-language"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coding-duration">Time to solve</Label>
                  <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
                    <SelectTrigger id="coding-duration"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_CHOICES.map((m) => (
                        <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    When it reaches zero your code is submitted, never discarded.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Mode</Label>
                  {([
                    {
                      id: "practice" as const,
                      icon: ShieldCheck,
                      title: "Practice",
                      body: "Nothing is blocked. Leaving the tab is noted for your own record and never ends the session.",
                    },
                    {
                      id: "interview" as const,
                      icon: ShieldAlert,
                      title: "Interview conditions",
                      body: "Fullscreen is enforced, copy and paste are blocked, and 3 violations submit your work and end the session.",
                    },
                  ]).map((opt) => {
                    const Icon = opt.icon;
                    const selected = mode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMode(opt.id)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Icon className="w-4 h-4 text-primary" /> {opt.title}
                        </span>
                        <span className="block text-xs text-muted-foreground mt-1">{opt.body}</span>
                      </button>
                    );
                  })}
                </div>

                <Button
                  className="w-full bg-gradient-primary hover:opacity-90"
                  disabled={!question}
                  onClick={start}
                >
                  Start session
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => navigate("/practice")}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to practice
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── result ───────────────────────────────────────────────────────────────
  if (phase === "result" && outcome) {
    return (
      <DashboardLayout>
        <SubmissionResult
          outcome={outcome}
          review={review}
          reviewLoading={reviewLoading}
          reviewError={reviewError}
          onBackToEditor={() => { setPhase("workspace"); setStartedAt(Date.now()); }}
          onNextQuestion={() => { setQuestion(null); setOutcome(null); setPhase("start"); }}
        />
      </DashboardLayout>
    );
  }

  // ── workspace ────────────────────────────────────────────────────────────
  if (!question) return null;

  const editor = (
    <CodeEditor
      language={language}
      code={code}
      onChange={setCode}
      readOnly={isRunning || isSubmitting}
      theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
      height="100%"
      showToolbar
      onRun={runTests}
      running={isRunning}
    />
  );

  const output = (
    <ExecutionOutput
      result={executionResult}
      isRunning={isRunning}
      onClear={() => setExecutionResult(null)}
      onRetry={runTests}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <SessionHeader
        title={question.title}
        mode={mode}
        remaining={remaining}
        totalSeconds={minutes * 60}
        violationCount={proctoring.violationCount}
        maxViolations={proctoring.maxViolations}
        language={language}
        onLanguageChange={setLanguage}
        onRun={runTests}
        onSubmit={() => submit("manual")}
        onExit={() => setExitOpen(true)}
        isRunning={isRunning}
        isSubmitting={isSubmitting}
      />

      <div className="flex-1 min-h-0">
        {isDesktop ? (
          <ResizablePanelGroup direction="horizontal" autoSaveId="hiready.coding.h">
            <ResizablePanel defaultSize={38} minSize={25}>
              <ProblemPanel question={question} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={62} minSize={40}>
              <ResizablePanelGroup direction="vertical" autoSaveId="hiready.coding.v">
                <ResizablePanel defaultSize={65} minSize={30}>
                  <div className="h-full">{editor}</div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={35} minSize={15}>
                  <div className="h-full overflow-hidden p-3">{output}</div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <Tabs value={mobileTab} onValueChange={setMobileTab} className="h-full flex flex-col">
            <TabsList className="mx-3 mt-3 grid grid-cols-3">
              <TabsTrigger value="problem">Problem</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="output">Output</TabsTrigger>
            </TabsList>
            <TabsContent value="problem" className="flex-1 min-h-0 mt-2">
              <ProblemPanel question={question} />
            </TabsContent>
            <TabsContent value="code" className="flex-1 min-h-0 mt-2">
              <div className="h-full">{editor}</div>
            </TabsContent>
            <TabsContent value="output" className="flex-1 min-h-0 mt-2 px-3 pb-3 overflow-y-auto">
              {output}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              Your code is saved in this browser and will still be here when you return
              to this problem. Nothing is submitted, so this attempt will not be scored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={leaveSession}>End session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CodingInterview;
