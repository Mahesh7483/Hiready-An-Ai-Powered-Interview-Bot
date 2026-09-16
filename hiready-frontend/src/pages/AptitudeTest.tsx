import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { DesktopOnly } from "@/components/DesktopOnly";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, AlertCircle, Bookmark, BookmarkCheck, Plus, Eye, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { AptitudeTestResult } from "@/lib/aptitudeQuestions";
import CandidateWebcamMonitor from "@/components/proctoring/CandidateWebcamMonitor";
import type { ProctorEvent } from "@/lib/proctorLogger";
import { useStrictProctoring } from "@/hooks/useStrictProctoring";
import { DEFAULT_CONFIG, type AptitudeConfig } from "@/lib/aptitude";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE_URL, getAuthHeaders, apiFetch } from "@/lib/api";

interface QuizQuestion {
  _id: string;
  Question: string;
  "Option A": string | number;
  "Option B": string | number;
  "Option C": string | number;
  "Option D": string | number;
  category: string;
  Explanation?: string;
  Answer: string;
  difficulty?: string | null;
}

interface AptitudeTestProps {
  mode?: "practice" | "test";
  topic?: string;
  difficulty?: string;
  questionCount?: number;
  timerEnabled?: boolean;
  timerMinutes?: number;
  negativeMarking?: boolean;
  adaptive?: boolean;
}

const AptitudeTest = (props: AptitudeTestProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Settings come from /practice/aptitude via navigation state.
   *
   * They used to come from props passed by one of two configurator pages —
   * and the "Test" card bypassed both, landing here with the defaults below,
   * so a timed test could never actually be configured. Props still win when
   * present so nothing that renders this directly breaks.
   */
  const stateConfig = (location.state as { config?: AptitudeConfig } | null)?.config;
  const cfg: AptitudeConfig = { ...DEFAULT_CONFIG, ...stateConfig };
  const mode = props.mode ?? cfg.mode;
  const topic = props.topic ?? cfg.topic;
  const difficulty = props.difficulty ?? cfg.difficulty;
  const questionCount = props.questionCount ?? cfg.questionCount;
  const timerEnabled = props.timerEnabled ?? cfg.timerEnabled;
  const timerMinutes = props.timerMinutes ?? cfg.timerMinutes;
  const negativeMarking = props.negativeMarking ?? cfg.negativeMarking;
  const adaptive = props.adaptive ?? cfg.adaptive;
  const { user } = useAuth();
  const isPractice = mode === "practice";

  // Resolve timer: test mode always on, practice mode optional (default off)
  const showTimer = timerEnabled !== undefined ? timerEnabled : !isPractice;

  // Test states
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [testStarted, setTestStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ questionId: string; selected: string }[]>([]);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState(timerMinutes * 60);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(new Set());
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  /**
   * The server-issued AptitudeAttempt for this run, named in the X-Attempt-Id
   * header when the questions are fetched. Grading is bound to it: without one
   * there is nothing the server will score, which is the point.
   */
  const attemptIdRef = useRef<string | null>(null);
  const proctorLogsRef = useRef<ProctorEvent[]>([]);
  const sessionIdRef = useRef(`aptitude-${Date.now()}`);
  const warningCountRef = useRef(0);

  // Practice-only states
  // Adaptive difficulty: running accuracy of this practice session

  /**
   * Tab / fullscreen / clipboard proctoring for a timed test.
   *
   * CandidateWebcamMonitor (below) covers the camera — faces, extra people —
   * via useProctoringDetection. It does NOT emit tab_switch or
   * fullscreen_exit, yet this counter filtered the camera logs for exactly
   * those two strings, so warningCountRef was permanently 0 and the "warning
   * system" the landing page advertised counted nothing at all.
   *
   * The shared hook actually detects them, and is the same one the coding
   * workspace uses.
   */
  const strictProctoring = useStrictProctoring({
    sessionId: sessionIdRef.current,
    mode: isPractice ? "practice" : "interview",
    active: testStarted && !isPractice,
    onTerminate: () => {
      toast.error("Too many violations — submitting your test now.");
      handleEndTest();
    },
  });

  useEffect(() => {
    warningCountRef.current = strictProctoring.violationCount;
  }, [strictProctoring.violationCount]);

  // Per-question dwell time accumulation
  const questionViewStartRef = useRef<number>(Date.now());
  useEffect(() => {
    questionViewStartRef.current = Date.now();
    return () => {
      const q = questions[currentQuestionIndex];
      if (!q) return;
      const spent = Date.now() - questionViewStartRef.current;
      try {
        const map = JSON.parse(sessionStorage.getItem("aptitudeTimeSpent") || "{}");
        map[q._id] = (map[q._id] || 0) + spent;
        sessionStorage.setItem("aptitudeTimeSpent", JSON.stringify(map));
      } catch { /* ignore */ }
    };
  }, [currentQuestionIndex, questions]);

  // Timer countdown
  useEffect(() => {
    if (!testStarted || !showTimer || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleEndTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleEndTest is declared below this effect (TDZ); interval re-arms each second via timeRemaining so the closure stays fresh
  }, [testStarted, showTimer, timeRemaining]);

  // Fetch questions from API via TanStack Query (cached per topic/count/difficulty)
  const {
    data: fetchedQuestions,
    isLoading: loading,
    isError: loadError,
  } = useQuery({
    queryKey: ["aptitude-quiz", topic, questionCount, difficulty ?? null, adaptive ? "adaptive" : "static"],
    enabled: showGuidelines,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<QuizQuestion[]> => {
      // The attempt id arrives in the response BODY. It was briefly read from
      // an X-Attempt-Id header, which a cross-origin browser cannot see unless
      // the server lists it in Access-Control-Expose-Headers — so it was always
      // null here, and every graded action failed with "not registered".
      const qs = new URLSearchParams({
        count: String(questionCount),
        mode: isPractice ? "practice" : "test",
      });
      if (negativeMarking) qs.set("negativeMarking", "true");
      if (difficulty && !adaptive) qs.set("difficulty", difficulty);

      const url = adaptive
        ? `${API_BASE_URL}/questions/quiz/${topic}/adaptive?${qs}`
        : `${API_BASE_URL}/questions/quiz/${topic}?${qs}`;

      const response = await fetch(url, {});
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load questions");
      }
      const data = await response.json();
      if (!data.attemptId) {
        // Without it nothing can be graded, so say so now rather than at submit.
        throw new Error("The server did not register this session");
      }
      attemptIdRef.current = data.attemptId;
      return (data.questions ?? []) as QuizQuestion[];
    },
  });

  // Sync query results into local state so practice mode can append more
  useEffect(() => {
    if (fetchedQuestions) setQuestions(fetchedQuestions);
  }, [fetchedQuestions]);

  useEffect(() => {
    if (loadError) toast.error("Failed to load questions");
  }, [loadError]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Persisted bookmarks — saved to the backend notebook across sessions
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const toggleBookmark = async () => {
    const qId = questions[currentQuestionIndex]?._id;
    if (!qId) return;
    if (!localStorage.getItem("token")) {
      toast.error("Log in to save questions to your notebook");
      return;
    }
    const wasSaved = bookmarked.has(qId);
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(qId);
      else next.add(qId);
      return next;
    });
    try {
      const res = wasSaved
        ? await apiFetch(`/questions/bookmarks/${qId}`, {
            method: "DELETE",
            
          })
        : await apiFetch(`/questions/bookmarks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionId: qId }),
          });
      if (!res.ok) throw new Error("Request failed");
      toast.success(wasSaved ? "Removed from notebook" : "Saved to notebook");
    } catch {
      // Roll back the optimistic update
      setBookmarked((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(qId);
        else next.delete(qId);
        return next;
      });
      toast.error("Could not update bookmark");
    }
  };

  const handleStartTest = () => {
    setShowGuidelines(false);
    setTestStarted(true);
    setStartTime(new Date());
    if (questions.length > 0) {
      setVisitedQuestions(new Set([questions[0]._id]));
    }
    toast.success(isPractice ? "Practice session started!" : "Test started! Good luck!");
  };

  const handleSelectOption = (optionKey: string) => {
    const letter = optionKey.charAt(optionKey.length - 1);
    setSelectedOption(letter);
  };

  /*
   * REMOVED: "Load 5 more questions".
   *
   * The attempt locks its question ids at issue time, so anything appended
   * afterwards is a foreign id that save-result rejects — the session became
   * ungradeable the moment you used it. How many questions you want is now
   * chosen on the start screen instead.
   */

  const handleNavigateToQuestion = (index: number) => {
    // Save current answer if one is selected
    if (selectedOption) {
      const updatedAnswers = [
        ...selectedAnswers.filter((a) => a.questionId !== questions[currentQuestionIndex]._id),
        {
          questionId: questions[currentQuestionIndex]._id,
          selected: selectedOption,
        },
      ];
      setSelectedAnswers(updatedAnswers);
    }

    setCurrentQuestionIndex(index);
    setVisitedQuestions((prev) => new Set(prev).add(questions[index]._id));

    const previousAnswer = selectedAnswers.find(
      (a) => a.questionId === questions[index]._id
    );
    if (previousAnswer) {
      setSelectedOption(previousAnswer.selected);
    } else {
      setSelectedOption("");
    }
  };

  const handleSkipQuestion = () => {
    // Practice mode: skip without selecting
    if (currentQuestionIndex < questions.length - 1) {
      handleNavigateToQuestion(currentQuestionIndex + 1);
    }
  };

  const handleNextQuestion = () => {
    const updatedAnswers = [
      ...selectedAnswers.filter((a) => a.questionId !== questions[currentQuestionIndex]._id),
      {
        questionId: questions[currentQuestionIndex]._id,
        selected: selectedOption,
      },
    ];
    setSelectedAnswers(updatedAnswers);
    setSelectedOption("");

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setVisitedQuestions((prev) => new Set(prev).add(questions[currentQuestionIndex + 1]._id));
      const nextAnswer = updatedAnswers.find(
        (a) => a.questionId === questions[currentQuestionIndex + 1]._id
      );
      if (nextAnswer) {
        setSelectedOption(nextAnswer.selected);
      }
    } else {
      handleEndTest();
    }
  };

  const handleEndTest = async () => {
    let finalAnswers = [...selectedAnswers];
    if (selectedOption) {
      finalAnswers = [
        ...selectedAnswers.filter((a) => a.questionId !== questions[currentQuestionIndex]._id),
        {
          questionId: questions[currentQuestionIndex]._id,
          selected: selectedOption,
        },
      ];
    }

      const endTime = new Date();
      const timeTaken = startTime
        ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
        : 0;

      // Per-question time tracking
      let timeSpentMap: Record<string, number> = {};
      try {
        timeSpentMap = JSON.parse(sessionStorage.getItem("aptitudeTimeSpent") || "{}");
      } catch { /* ignore */ }
      sessionStorage.removeItem("aptitudeTimeSpent");

    try {
      const attemptId = attemptIdRef.current;
      if (!attemptId) {
        // Without a server-issued attempt there is nothing to grade against.
        // Failing here is correct: the alternative is a score the server never
        // agreed to, which is exactly what this rewrite removes.
        toast.error("This session was not registered with the server, so it cannot be scored.");
        return;
      }

      // THE grading call. Previously the score came from an unauthenticated
      // endpoint that returned the correct answer for every question, and this
      // page computed the total itself. The server is now the only grader: it
      // iterates the question ids IT locked at issue time, applies its own
      // answer key, and ignores anything score-shaped in this payload.
      const saveResponse = await apiFetch(`/questions/quiz/save-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          negativeMarking,
          timeTaken,
          warningCount: warningCountRef.current,
          preset: `${topic}-${questions.length}q`,
          answers: finalAnswers.map((a) => ({
            ...a,
            timeSpentMs: timeSpentMap[a.questionId] ?? null,
          })),
        }),
      });

      const graded = await saveResponse.json().catch(() => null);

      if (!saveResponse.ok) {
        if (saveResponse.status === 409 && graded?.resultId) {
          // Already graded — a double submit or a recovered crash. Send them to
          // the result they actually have rather than grading a second time.
          toast.info("This attempt was already submitted.");
          navigate("/practice/aptitude/result");
          return;
        }
        throw new Error(graded?.error || `Could not submit (${saveResponse.status})`);
      }

      const testResult: AptitudeTestResult = {
        score: graded.score,
        totalQuestions: graded.totalQuestions,
        selectedAnswers: graded.results ?? [],
        startTime: startTime!,
        endTime,
        timeTaken: formatTime(timeTaken),
        mode,
        warningCount: warningCountRef.current,
        topic,
        difficulty,
      };

      sessionStorage.setItem(
        "aptitudeTestResult",
        JSON.stringify({ ...testResult, questions, breakdown: graded.breakdown })
      );
      sessionStorage.setItem("aptitudeProctorLogs", JSON.stringify(proctorLogsRef.current));
      if (typeof graded.percentile === "number") {
        sessionStorage.setItem("aptitudePercentile", String(graded.percentile));
      } else {
        sessionStorage.removeItem("aptitudePercentile");
      }

      toast.success(isPractice ? "Practice session completed!" : "Test completed!");
      navigate("/practice/aptitude/result");
    } catch (error) {
      toast.error("Failed to submit. Please try again.");
      console.error(error);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  // ─── Guidelines Screen ────────────────────────────────────────────
  if (showGuidelines) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <Card className="max-w-2xl w-full p-8 border-2 border-border">
            <div className="text-center mb-8">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${isPractice ? "bg-emerald-500" : "bg-gradient-primary"}`}>
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {isPractice ? "Practice Session" : "Aptitude Round"}
              </h1>
              <p className="text-muted-foreground">
                {isPractice
                  ? `Practice ${questions.length || questionCount} questions at your own pace`
                  : `Answer ${questions.length || questionCount} questions within ${timerMinutes} minutes`}
              </p>
            </div>

            <div className="space-y-4 mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                {isPractice ? "How it works:" : "Guidelines:"}
              </h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Total questions: <span className="font-semibold text-foreground">{questions.length || questionCount}</span></p>
                </div>

                {isPractice ? (
                  <>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">No webcam or proctoring required</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">View explanation after each answer</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Skip questions freely</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Add more questions anytime (+5)</p>
                    </div>
                    {showTimer && (
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-muted-foreground">Optional timer: <span className="font-semibold text-foreground">{timerMinutes} minutes</span></p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Time limit: <span className="font-semibold text-foreground">{timerMinutes} minutes</span></p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Each question carries <span className="font-semibold text-foreground">1 mark</span></p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${negativeMarking ? "text-destructive" : "text-success"}`} />
                      <p className="text-muted-foreground">
                        {negativeMarking
                          ? "Negative marking ON — each wrong answer deducts 0.25 marks; skipped questions are free"
                          : "No negative marking"}
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Do not refresh the page during the test</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Webcam proctoring will be active</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Test auto-submits when timer ends</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <Button
              onClick={handleStartTest}
              disabled={loading}
              className={`w-full hover:opacity-90 text-white font-semibold py-6 text-lg ${isPractice ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-primary"}`}
            >
              {loading ? "Loading Questions..." : isPractice ? "Start Practice" : "I Understand, Start Test"}
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!testStarted) return null;

  // ─── Main Quiz UI ─────────────────────────────────────────────────
  return (
    <DashboardLayout hideSidebar>
      <div className="min-h-screen bg-background">
        {/* Header with Timer */}
        <div className="border-b border-border bg-card sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {isPractice ? "Practice Session" : "Aptitude Test"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {isPractice && (
                <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                  Practice Mode
                </Badge>
              )}
              {showTimer && (
                <Badge
                  variant={timeRemaining < 300 ? "destructive" : "outline"}
                  className="text-lg px-4 py-2 font-mono"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  {formatTime(timeRemaining)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-muted">
          <div className="max-w-7xl mx-auto px-6 py-2">
            <div className="w-full bg-muted-foreground/20 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${isPractice ? "bg-emerald-500" : "bg-gradient-primary"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-6">
          {/* Left: Question Card + Buttons */}
          <div className="flex-1 min-w-0">
            <Card className="p-8 border-2 border-border mb-6">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline">
                    Question {currentQuestionIndex + 1}
                  </Badge>
                  {currentQuestion.difficulty && (
                    <Badge
                      variant="outline"
                      className={
                        currentQuestion.difficulty === "hard"
                          ? "text-red-600 border-red-300"
                          : currentQuestion.difficulty === "medium"
                          ? "text-amber-600 border-amber-300"
                          : "text-emerald-600 border-emerald-300"
                      }
                    >
                      {currentQuestion.difficulty}
                    </Badge>
                  )}
                </div>
                <h3 className="text-2xl font-semibold text-foreground mb-2">
                  {currentQuestion.Question}
                </h3>
              </div>

              <div className="space-y-3">
                {["Option A", "Option B", "Option C", "Option D"].map((optionKey) => {
                  const letter = optionKey.charAt(optionKey.length - 1);
                  const optionValue = currentQuestion[optionKey as keyof QuizQuestion];

                  return (
                    <button
                      key={optionKey}
                      onClick={() => handleSelectOption(optionKey)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        selectedOption === letter
                          ? "border-primary bg-primary/10 shadow-md"
                          : "border-border bg-card hover:border-primary/50 hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            selectedOption === letter
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }`}
                        >
                          {selectedOption === letter && (
                            <div className="w-3 h-3 rounded-full bg-white" />
                          )}
                        </div>
                        <span className="text-base text-foreground font-medium">{letter}. {optionValue}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

            </Card>

            {/* Navigation */}
            <div className="flex justify-between items-center gap-4">
              <Button
                onClick={handleEndTest}
                variant="outline"
                className="text-destructive hover:text-destructive border-destructive/50"
              >
                {isPractice ? "End practice" : "End test"}
              </Button>

              <div className="flex items-center gap-3">
                <Button
                  onClick={toggleBookmark}
                  variant="outline"
                  className={bookmarked.has(questions[currentQuestionIndex]._id)
                    ? "border-warning text-warning"
                    : "border-border text-muted-foreground"}
                >
                  <BookmarkCheck className={`w-4 h-4 mr-2 ${bookmarked.has(questions[currentQuestionIndex]._id) ? "fill-warning" : ""}`} />
                  {bookmarked.has(questions[currentQuestionIndex]._id) ? "Saved" : "Save"}
                </Button>

                {isPractice && (
                  <Button
                    onClick={handleSkipQuestion}
                    variant="outline"
                    disabled={currentQuestionIndex >= questions.length - 1}
                  >
                    <SkipForward className="w-4 h-4 mr-2" />
                    Skip
                  </Button>
                )}

                {/* Test mode: mark for review */}
                {!isPractice && (
                  <Button
                    onClick={() => {
                      const qId = questions[currentQuestionIndex]._id;
                      setMarkedForReview((prev) => {
                        const next = new Set(prev);
                        if (next.has(qId)) {
                          next.delete(qId);
                        } else {
                          next.add(qId);
                        }
                        return next;
                      });
                    }}
                    variant="outline"
                    className={`${
                      markedForReview.has(questions[currentQuestionIndex]._id)
                        ? "border-purple-500 bg-purple-500/10 text-purple-600"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 mr-2 ${markedForReview.has(questions[currentQuestionIndex]._id) ? "fill-purple-500" : ""}`} />
                    {markedForReview.has(questions[currentQuestionIndex]._id) ? "Marked for Review" : "Mark for Review"}
                  </Button>
                )}

                {/* One button in both modes. Practice used to show "Check
                    Answer" here and only swapped to Next/Finish once a reveal
                    succeeded — so when the reveal failed there was no way to
                    advance or to finish at all. */}
                <Button
                  onClick={handleNextQuestion}
                  disabled={!isPractice && !selectedOption}
                  className="px-8 bg-gradient-primary hover:opacity-90 text-white"
                >
                  {currentQuestionIndex === questions.length - 1
                    ? isPractice ? "Finish practice" : "Finish test"
                    : "Next question"}
                </Button>
              </div>
            </div>

          </div>

          {/* Right: Question Navigator + Proctoring (test mode only) */}
          <div className="lg:w-72 shrink-0">
            <div className="p-6 bg-card rounded-lg border border-border lg:sticky lg:top-20">
              <h4 className="text-sm font-semibold text-foreground mb-3">Question Navigator</h4>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((_, index) => {
                  const qId = questions[index]._id;
                  const isAnswered = selectedAnswers.some((a) => a.questionId === qId);
                  const isCurrent = index === currentQuestionIndex;
                  const isVisited = visitedQuestions.has(qId);
                  const isReview = markedForReview.has(qId);

                  let btnClass = "";
                  if (isCurrent) {
                    btnClass = "bg-blue-500 text-white ring-2 ring-blue-300";
                  } else if (isAnswered && isReview) {
                    btnClass = "bg-orange-500 text-white hover:bg-orange-600";
                  } else if (isReview) {
                    btnClass = "bg-purple-500 text-white hover:bg-purple-600";
                  } else if (isAnswered) {
                    btnClass = "bg-emerald-500 text-white hover:bg-emerald-600";
                  } else if (isVisited) {
                    btnClass = "bg-red-500 text-white hover:bg-red-600";
                  } else {
                    btnClass = "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600";
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => handleNavigateToQuestion(index)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold transition-all hover:scale-110 ${btnClass}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-5 pt-4 border-t border-border space-y-2">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Legend</h5>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <span className="text-muted-foreground">Not Visited</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-red-500 shrink-0" />
                    <span className="text-muted-foreground">Not Answered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-emerald-500 shrink-0" />
                    <span className="text-muted-foreground">Answered</span>
                  </div>
                  {!isPractice && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded bg-purple-500 shrink-0" />
                        <span className="text-muted-foreground">For Review</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded bg-orange-500 shrink-0" />
                        <span className="text-muted-foreground">Ans. + Review</span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-blue-500 shrink-0" />
                    <span className="text-muted-foreground">Current</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Proctoring - Webcam Monitor (test mode only) */}
            {!isPractice && (
              <div className="mt-4 p-4 bg-card rounded-lg border border-border">
                <h4 className="text-sm font-semibold text-foreground mb-3">Proctoring</h4>
                <CandidateWebcamMonitor
                  sessionId={sessionIdRef.current}
                  candidateName={user?.displayName || "Candidate"}
                  isRecording={testStarted}
                  onLogsUpdate={(logs) => { proctorLogsRef.current = logs; }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

/**
 * Wrapped at the export, not inside the component: the device check has to
 * run BEFORE any proctoring effect mounts, and a hook inside would already
 * have requested fullscreen and started the webcam monitor.
 */
const AptitudeTestGuarded = () => (
  <DesktopOnly activity="aptitude test">
    <AptitudeTest />
  </DesktopOnly>
);

export default AptitudeTestGuarded;
