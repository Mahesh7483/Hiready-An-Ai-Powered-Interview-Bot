import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Award, Home, Target, AlertTriangle, BarChart3 } from "lucide-react";
import { AptitudeTestResult } from "@/lib/aptitudeQuestions";

interface QuizQuestion {
  _id: string;
  Question: string;
  "Option A": string | number;
  "Option B": string | number;
  "Option C": string | number;
  "Option D": string | number;
  Answer: string;
  category: string;
}

interface TestResultData extends AptitudeTestResult {
  questions?: QuizQuestion[];
}

const AptitudeResult = () => {
  const navigate = useNavigate();
  const [result, setResult] = useState<TestResultData | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const savedResult = sessionStorage.getItem("aptitudeTestResult");

    if (savedResult) {
      const parsedResult: TestResultData = JSON.parse(savedResult);
      setResult(parsedResult);

      setTimeout(() => {
        setProgress((parsedResult.score / parsedResult.totalQuestions) * 100);
      }, 300);

      const mainDiv = document.getElementById("result-main");
      if (mainDiv && !document.fullscreenElement) {
        mainDiv.requestFullscreen().catch((err) => {
          console.log("Fullscreen request failed:", err.message);
        });
      }
    } else {
      navigate("/aptitude");
    }
  }, [navigate]);

  if (!result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading results...</p>
      </div>
    );
  }

  const percentage = (result.score / result.totalQuestions) * 100;
  const wrongCount = result.totalQuestions - result.score;
  const unansweredCount = result.totalQuestions - result.selectedAnswers.length;
  const isPractice = result.mode === "practice";

  const performanceLevel =
    percentage >= 80 ? "Excellent"
    : percentage >= 60 ? "Good"
    : percentage >= 40 ? "Average"
    : "Needs Improvement";

  const performanceColor =
    percentage >= 80 ? "text-success"
    : percentage >= 60 ? "text-primary"
    : percentage >= 40 ? "text-warning"
    : "text-destructive";

  // Compute topic-wise breakdown
  const topicBreakdown: Record<string, { correct: number; total: number }> = {};
  result.questions?.forEach((q) => {
    const cat = q.category || "unknown";
    if (!topicBreakdown[cat]) topicBreakdown[cat] = { correct: 0, total: 0 };
    topicBreakdown[cat].total++;
    const ans = result.selectedAnswers.find((a) => String(a.questionId) === String(q._id));
    if (ans?.isCorrect) topicBreakdown[cat].correct++;
  });

  return (
    <div id="result-main" className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isPractice ? "bg-emerald-500" : "bg-gradient-primary"}`}>
              <Award className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {isPractice ? "Practice Session Result" : "Your Aptitude Test Result"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isPractice ? "Practice" : "Test"} Performance Summary
                {result.topic && ` — ${result.topic}`}
              </p>
            </div>
            {isPractice && (
              <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200">Practice</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Score Card */}
        <Card className="p-8 border-2 border-border mb-6 text-center">
          <div className="flex flex-col items-center">
            <div className="relative w-48 h-48 mb-6">
              <svg className="transform -rotate-90 w-48 h-48">
                <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted" />
                <circle
                  cx="96" cy="96" r="88"
                  stroke="currentColor" strokeWidth="12" fill="none"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - progress / 100)}
                  className="text-primary transition-all duration-1000 ease-out"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold text-foreground">{result.score}</span>
                <span className="text-xl text-muted-foreground">/ {result.totalQuestions}</span>
              </div>
            </div>

            <h2 className="text-3xl font-bold text-foreground mb-2">
              {result.score} out of {result.totalQuestions}
            </h2>
            <Badge className={`${performanceColor} text-lg px-4 py-1 mb-4`} variant="outline">
              {performanceLevel}
            </Badge>
            <p className="text-muted-foreground">You scored {percentage.toFixed(0)}%</p>
          </div>
        </Card>

        {/* Enhanced Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-5 border-2 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Correct</p>
                <p className="text-2xl font-bold text-foreground">{result.score}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 border-2 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Wrong</p>
                <p className="text-2xl font-bold text-foreground">{wrongCount - unansweredCount}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 border-2 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Time Taken</p>
                <p className="text-2xl font-bold text-foreground">{result.timeTaken}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 border-2 border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Accuracy</p>
                <p className="text-2xl font-bold text-foreground">
                  {result.selectedAnswers.length > 0
                    ? `${Math.round((result.score / result.selectedAnswers.length) * 100)}%`
                    : "0%"}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Warning count for test mode */}
        {!isPractice && result.warningCount !== undefined && result.warningCount > 0 && (
          <Card className="p-5 border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Proctoring Warnings: {result.warningCount}
                </p>
                <p className="text-xs text-amber-600/80">
                  Warnings were detected during your test (tab switches, face detection issues, etc.)
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Topic-wise Breakdown */}
        {Object.keys(topicBreakdown).length > 0 && (
          <Card className="p-6 border-2 border-border mb-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-semibold text-foreground">Topic-wise Breakdown</h3>
            </div>
            <div className="space-y-4">
              {Object.entries(topicBreakdown).map(([topic, data]) => {
                const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                return (
                  <div key={topic}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-foreground capitalize">
                        {topic.replace(/-/g, " ")}
                      </span>
                      <span className="text-muted-foreground">
                        {data.correct}/{data.total} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted-foreground/20 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Answer Summary */}
        <Card className="p-6 border-2 border-border mb-6">
          <h3 className="text-xl font-semibold text-foreground mb-4">
            Answer Summary
          </h3>

          <div className="space-y-4">
            {result.questions?.map((question, index) => {
              const userAnswer = result.selectedAnswers.find(
                (a) => String(a.questionId) === String(question._id)
              ) as any;

              const wasAnswered = !!userAnswer;
              const isCorrect = userAnswer?.isCorrect || false;
              const correctAnswerLetter = userAnswer?.correctAnswer || question.Answer;

              const getOptionLabel = (letter: string) => {
                if (!letter) return "N/A";
                const optionKey = `Option ${letter}` as "Option A" | "Option B" | "Option C" | "Option D";
                return question[optionKey] ?? letter;
              };

              return (
                <div
                  key={question._id}
                  className={`p-4 rounded-lg border-2 ${
                    isCorrect
                      ? "border-success/50 bg-success/5"
                      : wasAnswered
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-muted bg-muted/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {isCorrect ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : wasAnswered ? (
                        <XCircle className="w-5 h-5 text-destructive" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1">
                      <p className="font-medium text-foreground mb-2">
                        {index + 1}. {question.Question}
                      </p>

                      <div className="space-y-1 text-sm">
                        {wasAnswered ? (
                          <>
                            <p className="text-muted-foreground">
                              <span className="font-semibold">Your answer:</span>{" "}
                              <span className={isCorrect ? "text-success" : "text-destructive"}>
                                {userAnswer.selected}. {getOptionLabel(userAnswer.selected)}
                              </span>
                            </p>
                            {!isCorrect && (
                              <p className="text-muted-foreground">
                                <span className="font-semibold">Correct answer:</span>{" "}
                                <span className="text-success">
                                  {correctAnswerLetter}. {getOptionLabel(correctAnswerLetter)}
                                </span>
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="text-muted-foreground italic">
                              <span className="font-semibold text-warning">Not answered</span>
                            </p>
                            <p className="text-muted-foreground">
                              <span className="font-semibold">Correct answer:</span>{" "}
                              <span className="text-success">
                                {correctAnswerLetter}. {getOptionLabel(correctAnswerLetter)}
                              </span>
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button onClick={() => navigate("/dashboard")} variant="outline" className="px-8">
            <Home className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <Button
            onClick={() => {
              sessionStorage.removeItem("aptitudeTestResult");
              navigate(isPractice ? "/aptitude/practice" : "/aptitude/test");
            }}
            className={`text-white px-8 ${isPractice ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-primary hover:opacity-90"}`}
          >
            {isPractice ? "Practice Again" : "Retake Test"}
          </Button>

          <Button
            onClick={() => navigate("/aptitude/dashboard")}
            variant="outline"
            className="px-8"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            View Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AptitudeResult;
