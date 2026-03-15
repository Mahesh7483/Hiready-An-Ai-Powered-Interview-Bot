import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, AlertCircle, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { AptitudeTestResult } from "@/lib/aptitudeQuestions";
import CandidateWebcamMonitor from "@/components/proctoring/CandidateWebcamMonitor";
import type { ProctorEvent } from "@/lib/proctorLogger";
import { useAuth } from "@/hooks/useAuth";

interface QuizQuestion {
  _id: string;
  Question: string;
  "Option A": string | number;
  "Option B": string | number;
  "Option C": string | number;
  "Option D": string | number;
  category: string;
  Answer: string;
}

const AptitudeTest = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Test states
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [testStarted, setTestStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ questionId: string; selected: string }[]>([]);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState(20 * 60); // 20 minutes in seconds
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(new Set());
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const proctorLogsRef = useRef<ProctorEvent[]>([]);
  const sessionIdRef = useRef(`aptitude-${Date.now()}`);

  // Timer countdown
  useEffect(() => {
    if (!testStarted || timeRemaining <= 0) return;

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
  }, [testStarted, timeRemaining]);

  // Fetch questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/questions/quiz/logical");
        const data = await response.json();
        setQuestions(data);
        setLoading(false);
      } catch (error) {
        toast.error("Failed to load questions");
        console.error(error);
        setLoading(false);
      }
    };

    if (showGuidelines) {
      fetchQuestions();
    }
  }, [showGuidelines]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartTest = () => {
    setShowGuidelines(false);
    setTestStarted(true);
    setStartTime(new Date());
    // Mark first question as visited
    if (questions.length > 0) {
      setVisitedQuestions(new Set([questions[0]._id]));
    }
    toast.success("Test started! Good luck!");
  };

  const handleSelectOption = (optionKey: string) => {
    // Convert "Option A" to "A", "Option B" to "B", etc.
    const letter = optionKey.charAt(optionKey.length - 1);
    setSelectedOption(letter);
  };

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

    // Navigate to the selected question
    setCurrentQuestionIndex(index);

    // Mark as visited
    setVisitedQuestions((prev) => new Set(prev).add(questions[index]._id));

    // Load the answer if it was previously answered
    const previousAnswer = selectedAnswers.find(
      (a) => a.questionId === questions[index]._id
    );
    if (previousAnswer) {
      setSelectedOption(previousAnswer.selected);
    } else {
      setSelectedOption("");
    }
  };

  const handleNextQuestion = () => {
    if (!selectedOption) {
      toast.error("Please select an answer before proceeding");
      return;
    }

    // Save the answer
    const updatedAnswers = [
      ...selectedAnswers.filter((a) => a.questionId !== questions[currentQuestionIndex]._id),
      {
        questionId: questions[currentQuestionIndex]._id,
        selected: selectedOption,
      },
    ];
    setSelectedAnswers(updatedAnswers);
    setSelectedOption("");

    // Move to next question or end test
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // Mark next question as visited
      setVisitedQuestions((prev) => new Set(prev).add(questions[currentQuestionIndex + 1]._id));
      // Check if next question was already answered
      const nextAnswer = updatedAnswers.find(
        (a) => a.questionId === questions[currentQuestionIndex + 1]._id
      );
      if (nextAnswer) {
        setSelectedOption(nextAnswer.selected);
      }
    } else {
      // All questions answered
      handleEndTest();
    }
  };

  const handleEndTest = async () => {
    // Save current answer if one is selected
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

    try {
      // Submit answers to API and get score
      const response = await fetch("http://localhost:5000/api/questions/quiz/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers: finalAnswers }),
      });

      const result = await response.json();

      // If backend includes results with correct answers, use them
      let finalSelectedAnswers = result.results || [];
      
      // If no results from backend, create results with correct answers from questions data
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
      };

      // Save to session storage - include questions data for result display
      const resultData = {
        ...testResult,
        questions: questions, // Include questions data for display
      };
      sessionStorage.setItem("aptitudeTestResult", JSON.stringify(resultData));
      sessionStorage.setItem("aptitudeProctorLogs", JSON.stringify(proctorLogsRef.current));
      
      toast.success("Test completed!");
      navigate("/aptitude-result");
    } catch (error) {
      toast.error("Failed to submit test. Please try again.");
      console.error(error);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  if (showGuidelines) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <Card className="max-w-2xl w-full p-8 border-2 border-border">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-primary mb-4">
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Aptitude Round</h1>
              <p className="text-muted-foreground">Answer {questions.length || 10} questions within 20 minutes</p>
            </div>

            <div className="space-y-4 mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Guidelines:</h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Total questions: <span className="font-semibold text-foreground">{questions.length || 10}</span></p>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Time limit: <span className="font-semibold text-foreground">20 minutes</span></p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Each question carries <span className="font-semibold text-foreground">1 mark</span></p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">No negative marking</p>
                </div>
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Do not refresh the page during the test</p>
                </div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Test auto-submits when timer ends</p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleStartTest}
              disabled={loading}
              className="w-full bg-gradient-primary hover:opacity-90 text-white font-semibold py-6 text-lg"
            >
              {loading ? "Loading Questions..." : "I Understand, Start Test"}
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!testStarted) return null;

  return (
    <DashboardLayout hideSidebar>
      <div className="min-h-screen bg-background">
        {/* Header with Timer */}
        <div className="border-b border-border bg-card sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Aptitude Test</h2>
              <p className="text-sm text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Badge
                variant={timeRemaining < 300 ? "destructive" : "outline"}
                className="text-lg px-4 py-2 font-mono"
              >
                <Clock className="w-4 h-4 mr-2" />
                {formatTime(timeRemaining)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-muted">
          <div className="max-w-7xl mx-auto px-6 py-2">
            <div className="w-full bg-muted-foreground/20 rounded-full h-2">
              <div
                className="bg-gradient-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Two-column layout: Question on left, Navigator on right */}
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-6">
          {/* Left: Question Card + Buttons */}
          <div className="flex-1 min-w-0">
            <Card className="p-8 border-2 border-border mb-6">
              <div className="mb-6">
                <Badge variant="outline" className="mb-4">
                  Question {currentQuestionIndex + 1}
                </Badge>
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

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center gap-4">
              <Button
                onClick={handleEndTest}
                variant="outline"
                className="text-destructive hover:text-destructive border-destructive/50"
              >
                End Test
              </Button>

              <div className="flex items-center gap-3">
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

                <Button
                  onClick={handleNextQuestion}
                  disabled={!selectedOption}
                  className="bg-gradient-primary hover:opacity-90 text-white px-8"
                >
                  {currentQuestionIndex === questions.length - 1 ? "Finish Test" : "Next Question"}
                </Button>
              </div>
            </div>
          </div>

          {/* Right: Question Navigator */}
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
                    // Current - Blue
                    btnClass = "bg-blue-500 text-white ring-2 ring-blue-300";
                  } else if (isAnswered && isReview) {
                    // Answered + Review - Orange
                    btnClass = "bg-orange-500 text-white hover:bg-orange-600";
                  } else if (isReview) {
                    // Marked for Review (unanswered) - Purple
                    btnClass = "bg-purple-500 text-white hover:bg-purple-600";
                  } else if (isAnswered) {
                    // Answered - Green
                    btnClass = "bg-emerald-500 text-white hover:bg-emerald-600";
                  } else if (isVisited) {
                    // Visited but unanswered - Red
                    btnClass = "bg-red-500 text-white hover:bg-red-600";
                  } else {
                    // Not visited - Gray
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
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-purple-500 shrink-0" />
                    <span className="text-muted-foreground">For Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-orange-500 shrink-0" />
                    <span className="text-muted-foreground">Ans. + Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-blue-500 shrink-0" />
                    <span className="text-muted-foreground">Current</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Proctoring - Webcam Monitor */}
            <div className="mt-4 p-4 bg-card rounded-lg border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3">Proctoring</h4>
              <CandidateWebcamMonitor
                sessionId={sessionIdRef.current}
                candidateName={user?.displayName || "Candidate"}
                isRecording={testStarted}
                onLogsUpdate={(logs) => { proctorLogsRef.current = logs; }}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AptitudeTest;
