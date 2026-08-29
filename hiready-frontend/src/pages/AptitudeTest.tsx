import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, AlertCircle, Bookmark, BookmarkCheck, Plus, Eye, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { AptitudeTestResult } from "@/lib/aptitudeQuestions";
import CandidateWebcamMonitor from "@/components/proctoring/CandidateWebcamMonitor";
import type { ProctorEvent } from "@/lib/proctorLogger";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE_URL, getAuthHeaders } from "@/lib/api";

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

const AptitudeTest = ({
  mode = "test",
  topic = "logical",
  difficulty,
  questionCount = 10,
  timerEnabled,
  timerMinutes = 20,
  negativeMarking = false,
  adaptive = false,
}: AptitudeTestProps) => {
  const navigate = useNavigate();
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
  const proctorLogsRef = useRef<ProctorEvent[]>([]);
  const sessionIdRef = useRef(`aptitude-${Date.now()}`);
  const warningCountRef = useRef(0);

  // Practice-only states
  const [showExplanation, setShowExplanation] = useState(false);
  const [answeredCorrectly, setAnsweredCorrectly] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Adaptive difficulty: running accuracy of this practice session
  const practiceStatsRef = useRef({ correct: 0, total: 0 });

  // Track proctor warning count (test mode only)
  useEffect(() => {
    if (!isPractice) {
      warningCountRef.current = proctorLogsRef.current.filter(
        (l) => l.event.includes("tab_switch") || l.event.includes("fullscreen_exit")
      ).length;
    }
  });

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
      if (adaptive) {
        // Adaptive mode: server picks a difficulty ladder from recent history
        const response = await fetch(
          `${API_BASE_URL}/questions/quiz/${topic}/adaptive?count=${questionCount}`,
          { headers: getAuthHeaders() }
        );
        if (!response.ok) throw new Error("Failed to load questions");
        const data = await response.json();
        return (data.questions ?? []) as QuizQuestion[];
      }
      const url = `${API_BASE_URL}/questions/quiz/${topic}?count=${questionCount}${difficulty ? `&difficulty=${difficulty}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to load questions");
      return response.json();
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
        ? await fetch(`${API_BASE_URL}/questions/bookmarks/${qId}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
          })
        : await fetch(`${API_BASE_URL}/questions/bookmarks`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
    if (showExplanation) return; // Lock selection after showing explanation in practice
    const letter = optionKey.charAt(optionKey.length - 1);
    setSelectedOption(letter);
  };

  // Practice mode: grade a single answer via the backend
  const checkAnswerMutation = useMutation({
    mutationFn: async ({ questionId, selected }: { questionId: string; selected: string }) => {
      const response = await fetch(`${API_BASE_URL}/questions/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: [{ questionId, selected }] }),
      });
      if (!response.ok) throw new Error("Failed to check answer");
      return response.json();
    },
    onSuccess: (data, variables) => {
      const res = data.results?.[0];
      if (res) {
        setAnsweredCorrectly(res.isCorrect);
        practiceStatsRef.current.total += 1;
        if (res.isCorrect) practiceStatsRef.current.correct += 1;
        setSelectedAnswers((prev) => [
          ...prev.filter((a) => a.questionId !== variables.questionId),
          { questionId: variables.questionId, selected: variables.selected },
        ]);
        // Temporarily store correct answer on the question object for explanation display
        setQuestions((prev) =>
          prev.map((q) =>
            q._id === variables.questionId ? { ...q, Answer: res.correctAnswer } : q
          )
        );
      }
      setShowExplanation(true);
    },
    onError: () => toast.error("Failed to check answer"),
  });

  // Practice mode: check answer & show explanation
  const handleCheckAnswer = () => {
    if (!selectedOption) {
      toast.error("Please select an answer first");
      return;
    }
    const currentQuestion = questions[currentQuestionIndex];
    checkAnswerMutation.mutate({ questionId: currentQuestion._id, selected: selectedOption });
  };

  // Practice mode: load 5 more questions — difficulty adapts to session accuracy
  const loadMoreMutation = useMutation({
    mutationFn: async (): Promise<{ data: QuizQuestion[]; adaptedDifficulty?: string }> => {
      const stats = practiceStatsRef.current;
      let adaptedDifficulty: string | undefined;
      if (stats.total >= 4) {
        const acc = stats.correct / stats.total;
        const ladder = ["easy", "medium", "hard"];
        const currentIdx = ladder.indexOf(difficulty || "medium");
        if (acc >= 0.8 && currentIdx < ladder.length - 1) {
          adaptedDifficulty = ladder[currentIdx + 1];
        } else if (acc <= 0.4 && currentIdx > 0) {
          adaptedDifficulty = ladder[currentIdx - 1];
        }
      }
      const effectiveDifficulty = adaptedDifficulty ?? difficulty;
      const url = `${API_BASE_URL}/questions/quiz/${topic}?count=5${effectiveDifficulty ? `&difficulty=${effectiveDifficulty}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to load more questions");
      return { data: await response.json(), adaptedDifficulty };
    },
    onSuccess: ({ data, adaptedDifficulty }) => {
      setQuestions((prev) => [...prev, ...data]);
      if (adaptedDifficulty) {
        toast.info(`Adaptive mode: switching to ${adaptedDifficulty} questions based on your accuracy`);
      }
    },
    onError: () => toast.error("Failed to load more questions"),
  });

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await loadMoreMutation.mutateAsync(undefined);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleNavigateToQuestion = (index: number) => {
    // Save current answer if one is selected
    if (selectedOption && !showExplanation) {
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
    setShowExplanation(false);
    setAnsweredCorrectly(null);

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
    // In practice mode with explanation shown, just move forward
    if (isPractice && showExplanation) {
      setShowExplanation(false);
      setAnsweredCorrectly(null);
      setSelectedOption("");
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setVisitedQuestions((prev) => new Set(prev).add(questions[currentQuestionIndex + 1]._id));
        const nextAnswer = selectedAnswers.find(
          (a) => a.questionId === questions[currentQuestionIndex + 1]._id
        );
        if (nextAnswer) setSelectedOption(nextAnswer.selected);
      } else {
        handleEndTest();
      }
      return;
    }

    if (!selectedOption) {
      toast.error("Please select an answer before proceeding");
      return;
    }

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
      const response = await fetch(`${API_BASE_URL}/questions/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers, negativeMarking }),
      });

      const result = await response.json();

      let finalSelectedAnswers = result.results || [];
      if (!result.results || result.results.length === 0) {
        finalSelectedAnswers = finalAnswers.map((answer) => {
          const question = questions.find((q) => q._id === answer.questionId);
          return {
            questionId: answer.questionId,
            selected: answer.selected,
            correctAnswer: question?.Answer || "",
            isCorrect: question?.Answer === answer.selected,
          };
        });
      }

      const testResult: AptitudeTestResult = {
        score: result.score,
        totalQuestions: questions.length,
        selectedAnswers: finalSelectedAnswers,
        startTime: startTime!,
        endTime,
        timeTaken: formatTime(timeTaken),
        mode,
        warningCount: warningCountRef.current,
        topic,
        difficulty,
      };

      const resultData = {
        ...testResult,
        questions: questions,
      };
      sessionStorage.setItem("aptitudeTestResult", JSON.stringify(resultData));
      sessionStorage.setItem("aptitudeProctorLogs", JSON.stringify(proctorLogsRef.current));

      // Also persist to backend for analytics — identity comes from the JWT;
      // silently skipped for Firebase-only sessions without a backend token
      if (localStorage.getItem("token")) {
        try {
          const saveResponse = await fetch(`${API_BASE_URL}/questions/quiz/save-result`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              ...testResult,
              startTime: undefined,
              endTime: undefined,
              negativeMarking,
              preset: `${topic}-${questions.length}q`,
              selectedAnswers: (finalSelectedAnswers as Array<{ questionId: string }>).map((a) => ({
                ...a,
                timeSpentMs: timeSpentMap[a.questionId] ?? null,
              })),
            }),
          });
          // Percentile from the save response → result page
          if (saveResponse.ok) {
            const saveData = await saveResponse.json().catch(() => null);
            if (saveData && typeof saveData.percentile === "number") {
              sessionStorage.setItem("aptitudePercentile", String(saveData.percentile));
            } else {
              sessionStorage.removeItem("aptitudePercentile");
            }
          }
        } catch {
          // Analytics save is non-critical
        }
      }

      toast.success(isPractice ? "Practice session completed!" : "Test completed!");
      navigate("/aptitude/result");
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

                  // In practice mode with explanation shown, highlight correct/wrong
                  let explanationClass = "";
                  if (isPractice && showExplanation) {
                    if (letter === currentQuestion.Answer) {
                      explanationClass = "border-emerald-500 bg-emerald-500/10";
                    } else if (letter === selectedOption && !answeredCorrectly) {
                      explanationClass = "border-red-500 bg-red-500/10";
                    }
                  }

                  return (
                    <button
                      key={optionKey}
                      onClick={() => handleSelectOption(optionKey)}
                      disabled={isPractice && showExplanation}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        explanationClass ||
                        (selectedOption === letter
                          ? "border-primary bg-primary/10 shadow-md"
                          : "border-border bg-card hover:border-primary/50 hover:bg-accent/50")
                      } ${isPractice && showExplanation ? "cursor-default" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            explanationClass
                              ? letter === currentQuestion.Answer
                                ? "border-emerald-500 bg-emerald-500"
                                : letter === selectedOption
                                ? "border-red-500 bg-red-500"
                                : "border-muted-foreground"
                              : selectedOption === letter
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }`}
                        >
                          {(selectedOption === letter || (showExplanation && letter === currentQuestion.Answer)) && (
                            <div className="w-3 h-3 rounded-full bg-white" />
                          )}
                        </div>
                        <span className="text-base text-foreground font-medium">{letter}. {optionValue}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Practice mode: explanation after checking */}
              {isPractice && showExplanation && (
                <div className={`mt-6 p-4 rounded-lg border-2 ${answeredCorrectly ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-red-500 bg-red-50 dark:bg-red-950"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {answeredCorrectly ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`font-semibold ${answeredCorrectly ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                      {answeredCorrectly ? "Correct!" : "Incorrect"}
                    </span>
                  </div>
                  {!answeredCorrectly && (
                    <p className="text-sm text-muted-foreground">
                      The correct answer is <span className="font-semibold text-foreground">{currentQuestion.Answer}. {currentQuestion[`Option ${currentQuestion.Answer}` as keyof QuizQuestion]}</span>
                    </p>
                  )}
                  {currentQuestion.Explanation && (
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Explanation</p>
                      <p className="text-sm text-muted-foreground">{currentQuestion.Explanation}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center gap-4">
              <Button
                onClick={handleEndTest}
                variant="outline"
                className="text-destructive hover:text-destructive border-destructive/50"
              >
                {isPractice ? "End Practice" : "End Test"}
              </Button>

              <div className="flex items-center gap-3">
                {/* Both modes: persist this question to the saved notebook */}
                <Button
                  onClick={toggleBookmark}
                  variant="outline"
                  className={`${
                    bookmarked.has(questions[currentQuestionIndex]._id)
                      ? "border-amber-500 bg-amber-500/10 text-amber-600"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <BookmarkCheck className={`w-4 h-4 mr-2 ${bookmarked.has(questions[currentQuestionIndex]._id) ? "fill-amber-500" : ""}`} />
                  {bookmarked.has(questions[currentQuestionIndex]._id) ? "Saved" : "Save"}
                </Button>

                {/* Practice: skip button */}
                {isPractice && !showExplanation && (
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

                {/* Practice mode: Check Answer or Next */}
                {isPractice && !showExplanation ? (
                  <Button
                    onClick={handleCheckAnswer}
                    disabled={!selectedOption}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-8"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Check Answer
                  </Button>
                ) : (
                  <Button
                    onClick={handleNextQuestion}
                    disabled={!isPractice && !selectedOption}
                    className={`text-white px-8 ${isPractice ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-primary hover:opacity-90"}`}
                  >
                    {currentQuestionIndex === questions.length - 1
                      ? isPractice ? "Finish Practice" : "Finish Test"
                      : "Next Question"}
                  </Button>
                )}
              </div>
            </div>

            {/* Practice mode: load more questions */}
            {isPractice && currentQuestionIndex === questions.length - 1 && (
              <div className="mt-4 text-center">
                <Button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  variant="outline"
                  className="border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {loadingMore ? "Loading..." : "Load 5 More Questions"}
                </Button>
              </div>
            )}
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

export default AptitudeTest;
