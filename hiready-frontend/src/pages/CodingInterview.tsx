import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Loader2, 
  Play, 
  Pause, 
  Square, 
  Clock, 
  Users, 
  Briefcase, 
  Code, 
  Terminal,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  RefreshCw,
  Maximize2,
  Minimize2,
  PlayCircle,
  PauseCircle,
  ShieldAlert,
  Lightbulb,
  Calendar,
  X,
  Copy,
  Trash2,
  RotateCcw,
  Trash2 as Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { CodeEditor } from "@/components/coding/CodeEditor";
import { ExecutionOutput, type ExecutionResult, type TestCaseResult } from "@/components/coding/ExecutionOutput";
import { apiFetch, getAuthHeaders, API_BASE_URL } from "@/lib/api";
import { connectCollab, type Socket } from "@/lib/collabClient";

interface CodingAnalysisResult {
  role?: string;
  confidenceScore?: number;
  contentScore?: number;
  overallScore?: number;
  strengths?: string[];
  improvements?: string[];
  rejectionReasons?: string[];
}

interface CodingQuestion {
  _id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  category: string;
  starterCode: Record<string, string>;
  solution: Record<string, string>;
  testCases: Array<{
    input: string;
    output: string;
    isHidden: boolean;
    points: number;
  }>;
  starterFiles: Record<string, string>;
  constraints: string;
  timeLimit: number;
  memoryLimit: number;
  explanation: string;
}

interface InterviewConfig {
  role: string;
  experienceLevel: string;
  jobDescription?: string;
  mode: "assessment" | "practice";
  interviewType: "technical" | "behavioral" | "coding";
  questions: CodingQuestion[];
  currentQuestionIndex: number;
}

interface TestCase {
  input: string;
  output: string;
  isHidden: boolean;
  points: number;
}

const CodingInterview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phase, setPhase] = useState<"setup" | "guidelines" | "interview">("setup");
  const [config, setConfig] = useState<InterviewConfig>({
    role: "Software Engineer",
    experienceLevel: "Mid-Level",
    mode: "assessment",
    interviewType: "coding",
    questions: [],
    currentQuestionIndex: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [testResults, setTestResults] = useState<TestCaseResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CodingAnalysisResult | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [violations, setViolations] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // Live collaboration (interviewer watch view: code + cursor sync)
  const socketRef = useRef<Socket | null>(null);
  const [peerName, setPeerName] = useState<string | null>(null);
  const remoteCodeRef = useRef(false);
  // Stable per-interview session id so interviewer + candidate join the same room
  const collabSessionIdRef = useRef(
    `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;

  // ── Live collaboration: connect during the interview, sync code + cursor ──
  useEffect(() => {
    if (phase !== "interview") return;
    const socket = connectCollab(collabSessionIdRef.current, "candidate");
    socketRef.current = socket;

    socket.on("coding:peer-joined", (p: { name?: string }) => {
      setPeerName(p?.name || "Interviewer");
      // Share our current state with the newcomer
      socket.emit("coding:state", { code, language, cursor: null });
    });
    socket.on("coding:peer-left", () => setPeerName(null));
    socket.on("coding:code", (p: { code?: string }) => {
      if (typeof p?.code === "string" && p.code !== code) {
        remoteCodeRef.current = true;
        setCode(p.code);
      }
    });
    socket.on("disconnect", () => setPeerName(null));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setPeerName(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Broadcast code edits to the interviewer (skip echoes of remote updates)
  const handleCodeChange = (next: string) => {
    setCode(next);
    if (!remoteCodeRef.current) {
      socketRef.current?.emit("coding:code", { code: next, file: "main" });
    }
    remoteCodeRef.current = false;
  };

  const handleCursorChange = (pos: { line: number; column: number }) => {
    socketRef.current?.emit("coding:cursor", { ...pos, file: "main" });
  };

  // Fetch coding questions on mount
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE_URL}/code/questions?limit=50`, {
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          setQuestions(data.questions || []);
        }
      } catch (error) {
        console.error("Failed to load questions:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuestions();
  }, []);

  const handleSetupContinue = (newConfig: Partial<InterviewConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
    setPhase("guidelines");
  };

  const handleStartInterview = () => {
    if (!currentQuestion) {
      toast.error("Please select at least one question");
      return;
    }
    setPhase("interview");
    setCode(currentQuestion.starterCode[language] || "");
    setExecutionResult(null);
    setTestResults([]);
    // Enter fullscreen
    document.documentElement.requestFullscreen?.();
  };

  const handleRunCode = async () => {
    if (!code.trim()) {
      toast.error("Please write some code first");
      return;
    }

    setIsRunning(true);
    setExecutionResult(null);

    try {
      // When a question is loaded, run its visible test cases; otherwise plain execute
      const endpoint = currentQuestion
        ? `${API_BASE_URL}/code/run-tests/${currentQuestion._id}`
        : `${API_BASE_URL}/code/execute`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          code,
          language,
          input: "",
          timeLimit: currentQuestion?.timeLimit || 10000,
          memoryLimit: currentQuestion?.memoryLimit || 256,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Execution failed (${response.status})`);
      }

      const result = await response.json();
      setExecutionResult(result);
      setTestResults(result.testResults || []);
      if (typeof result.passedCount === "number") {
        if (result.success) toast.success(`All ${result.total} test cases passed! 🎉`);
        else toast.warning(`${result.passedCount}/${result.total} test cases passed`);
      }
    } catch (error) {
      console.error("Execution error:", error);
      toast.error(error instanceof Error ? error.message : "Execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!code.trim()) {
      toast.error("Please write some code before submitting");
      return;
    }

    setIsAnalyzing(true);
    try {
      // Submit runs ALL test cases (visible + hidden), scores, and persists the submission
      let summary = "";
      if (currentQuestion) {
        const submitResponse = await fetch(`${API_BASE_URL}/code/submit/${currentQuestion._id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ code, language }),
        });
        if (!submitResponse.ok) {
          const error = await submitResponse.json().catch(() => ({}));
          throw new Error(error.error || `Submission failed (${submitResponse.status})`);
        }
        const submitResult = await submitResponse.json();
        setExecutionResult({
          success: submitResult.status === "accepted",
          stdout: "",
          stderr: "",
          exitCode: submitResult.status === "accepted" ? 0 : 1,
          executionTime: submitResult.executionTime || 0,
          timedOut: submitResult.status === "time_limit_exceeded",
        });
        setTestResults(submitResult.testResults || []);
        summary = `Status: ${submitResult.status}, Passed: ${submitResult.passedCount}/${submitResult.total}, Score: ${submitResult.score}/${submitResult.maxScore}`;
        toast.success(
          submitResult.status === "accepted"
            ? `Accepted! Score ${submitResult.score}/${submitResult.maxScore} 🎉`
            : `${submitResult.passedCount}/${submitResult.total} tests passed — submitted`
        );
      }

      // Analyze the solution
      await analyzeSolution(summary);

      toast.success("Submitted for review!");
    } catch (error) {
      console.error("Submission error:", error);
      toast.error(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeSolution = async (extraContext?: string) => {
    if (!code.trim()) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/ai/interview-analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          transcript: `Problem: ${currentQuestion?.title}\n\nSolution:\n${code}${extraContext ? `\n\nTest results: ${extraContext}` : ""}`,
          targetRole: config.role,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Analysis failed (${response.status})`);
      }

      const analysis = await response.json();
      setAnalysisResult(analysis);
      setShowReport(true);
    } catch (error) {
      console.error("Analysis error:", error);
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    if (currentQuestion?.starterCode[language]) {
      setCode(currentQuestion.starterCode[language]);
    } else {
      setCode(DEFAULT_CODE[language] || "");
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setCode(questions[currentQuestionIndex + 1].starterCode[language] || DEFAULT_CODE[language] || "");
      setExecutionResult(null);
      setTestResults([]);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      setCode(questions[currentQuestionIndex - 1].starterCode[language] || DEFAULT_CODE[language] || "");
      setExecutionResult(null);
      setTestResults([]);
    }
  };

  const handleFullscreenToggle = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!currentQuestion && phase === "interview") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading question...</p>
        </div>
      </div>
    );
  }

  const DEFAULT_CODE = {
    python: `def solve():\n    # Write your solution here\n    pass\n\nif __name__ == "__main__":\n    solve()`,
    javascript: `function solve() {\n  // Write your solution here\n}\n\nsolve();`,
    typescript: `function solve(): void {\n  // Write your solution here\n}\n\nsolve();`,
    java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}`,
      go: `package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n}`,
      cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}`,
      rust: `fn main() {\n    // Write your solution here\n}`,
  };

  const LANGUAGES = [
    { value: "python", label: "Python", icon: "🐍" },
    { value: "javascript", label: "JavaScript", icon: "🟨" },
    { value: "typescript", label: "TypeScript", icon: "🔷" },
    { value: "java", label: "Java", icon: "☕" },
    { value: "go", label: "Go", icon: "🐹" },
    { value: "cpp", label: "C++", icon: "🔷" },
    { value: "rust", label: "Rust", icon: "🦀" },
  ];

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border p-8 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Code className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Coding Interview Setup</h1>
                <p className="text-muted-foreground mt-1">Configure your coding interview</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground mb-2">Role</label>
              <input
                type="text"
                value={config.role}
                onChange={(e) => setConfig({ ...config, role: e.target.value })}
                placeholder="e.g., Software Engineer, Frontend Developer"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground mb-2">Experience Level</label>
                <select
                  value={config.experienceLevel}
                  onChange={(e) => setConfig({ ...config, experienceLevel: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="Fresher">Fresher (Campus / No experience)</option>
                  <option value="Intern">Intern</option>
                  <option value="Entry-Level">Entry Level (0-2 years)</option>
                  <option value="Mid-Level">Mid Level (3-5 years)</option>
                  <option value="Senior-Level">Senior Level (6-10 years)</option>
                  <option value="Lead">Lead/Principal (10+ years)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground mb-2">Interview Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "coding", label: "Coding", desc: "Algorithms & Data Structures", icon: Code },
                    { id: "technical", label: "Technical", desc: "System Design & Architecture", icon: Briefcase },
                    { id: "behavioral", label: "Behavioral", desc: "STAR Stories & Soft Skills", icon: Users },
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setConfig({ ...config, interviewType: type.id as InterviewConfig["interviewType"] })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        config.interviewType === type.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <type.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{type.label}</p>
                          <p className="text-xs text-muted-foreground">{type.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground mb-2">Questions</label>
              <div className="max-h-60 overflow-y-auto border border-border rounded-lg p-3">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : questions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No coding questions available</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {questions.map((q) => (
                      <label key={q._id} className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.questions.some(q => q._id === q._id)}
                          onChange={() => setConfig({
                            ...config,
                            questions: config.questions.some(q => q._id === q._id)
                              ? config.questions.filter(q => q._id !== q._id)
                              : [...config.questions, q]
                          })}
                          className="w-4 h-4 accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{q.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] capitalize">{q.difficulty}</Badge>
                            <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                            <Badge variant="outline" className="text-[10px]">{q.tags.slice(0, 2).join(", ")}</Badge>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setPhase("guidelines")} className="flex-1">
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-primary hover:opacity-90 transition-opacity"
                onClick={() => {
                  if (config.questions.length === 0) {
                    toast.error("Please select at least one question");
                    return;
                  }
                  setPhase("guidelines");
                }}
                disabled={config.questions.length === 0}
              >
                Continue to Guidelines
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "guidelines") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border p-8 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ShieldAlert className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Coding Interview Guidelines</h1>
                <p className="text-lg text-muted-foreground mt-1">
                  Please read all instructions carefully before proceeding
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-600 rounded-lg">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-semibold text-foreground text-lg">Duration & Format</span>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <span className="font-medium">Duration:</span> {currentQuestion?.timeLimit ? `${Math.ceil(currentQuestion.timeLimit / 60000)} minutes` : "Timed per question"}</li>
                  <li>• <span className="font-medium">Format:</span> Coding challenge with AI interviewer</li>
                  <li>• <span className="font-medium">Type:</span> {config.interviewType === "behavioral" ? "Behavioral" : "Technical Coding"} Interview</li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-purple-600 rounded-lg">
                    <Code className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-semibold text-foreground text-lg">Environment</span>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <span className="font-medium">Language:</span> {LANGUAGES.find(l => l.value === language)?.label}</li>
                  <li>• <span className="font-medium">Fullscreen:</span> Required (enforced)</li>
                  <li>• <span className="font-medium">Proctoring:</span> Webcam + Tab detection active</li>
                </ul>
              </div>
            </div>

            <div className="space-y-6 mb-6">
              <div className="border border-border rounded-lg p-6 bg-card hover:bg-muted/30 transition-colors duration-200">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <ShieldAlert className="w-5 h-5 text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Strict Proctoring Rules — Zero Tolerance</h3>
                </div>
                <ul className="space-y-3 pl-2">
                  {[
                    "The interview runs in fullscreen. Exiting fullscreen is a violation and you will be forced back in",
                    "Switching tabs, minimizing, or clicking another window is a violation",
                    "Copy, cut, paste, right-click, and developer tools are completely blocked",
                    "Your webcam is monitored throughout — keep your face visible at all times",
                    "3 violations = the interview is TERMINATED immediately and flagged in your report",
                    "All violations are logged with timestamps to your permanent interview record"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 group">
                      <div className="min-w-fit mt-1">
                        <div className="w-5 h-5 rounded-full bg-destructive/20 text-destructive text-xs flex items-center justify-center font-semibold">
                          ✓
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-5 mb-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                    className="mt-1"
                  />
                  <label className="text-sm text-foreground cursor-pointer flex-1">
                    <span className="font-semibold">I agree to the instructions and understand that violations will terminate my interview</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      By checking this box, you confirm that you have read and understood all rules, including strict proctoring: 3 violations (tab switching, exiting fullscreen, clipboard use, etc.) will terminate the interview immediately.
                    </p>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setPhase("setup")}
                  className="flex-1"
                >
                  Back to Setup
                </Button>
                <Button
                  onClick={handleStartInterview}
                  disabled={!agreedToTerms}
                  className="flex-1 bg-gradient-primary hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Coding Interview
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card shrink-0">
          <div className="max-w-full mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                <Code className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{config.role} — {config.interviewType === "behavioral" ? "HR Behavioral" : "Technical"} Coding Interview</h2>
                <Badge variant="outline" className="text-xs">
                  <span className="w-2 h-2 rounded-full bg-success mr-1.5 animate-pulse" />
                  {config.mode === "assessment" ? "Assessment Mode" : "Practice Mode"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        <span className="flex items-center gap-2">{lang.icon} {lang.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.exitFullscreen?.()}
                className="text-destructive hover:text-destructive"
              >
                <Minimize2 className="w-4 h-4 mr-1" />
                Exit Fullscreen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSubmit}
                disabled={isAnalyzing}
                className="text-destructive hover:text-destructive"
              >
                <Square className="w-4 h-4 mr-1" />
                {isAnalyzing ? "Analyzing..." : "Submit & Analyze"}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Interview Area */}
        <div className="flex-1 flex">
          <div className="w-full max-w-6xl mx-auto px-4 py-6 flex-1">
            <div className="grid lg:grid-cols-3 gap-4 h-full">
              {/* Left: Problem Statement */}
              <div className="lg:col-span-2 flex flex-col h-full">
                <Card className="border border-border h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{questions[currentQuestionIndex]?.difficulty}</Badge>
                        <Badge variant="outline" className="text-[10px]">{questions[currentQuestionIndex]?.category}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Question {currentQuestionIndex + 1} of {totalQuestions}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          <span className="w-2 h-2 rounded-full bg-success mr-1.5 animate-pulse" />
                          Live
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <h2 className="text-xl font-bold mb-2">{currentQuestion?.title}</h2>
                      <div className="text-muted-foreground mb-4 whitespace-pre-wrap">
                        {currentQuestion?.description}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-muted/50 border border-border">
                          <p className="text-xs text-muted-foreground mb-1">Time Limit</p>
                          <p className="font-semibold">{currentQuestion?.timeLimit ? `${Math.ceil(currentQuestion.timeLimit / 60000)} min` : "No limit"}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 border border-border">
                          <p className="text-xs text-muted-foreground mb-1">Memory Limit</p>
                          <p className="font-semibold">{currentQuestion?.memoryLimit} MB</p>
                        </div>
                      </div>

                      {currentQuestion?.constraints && (
                        <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/40">
                          <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-400 mb-1">Constraints</p>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap">{currentQuestion.constraints}</p>
                        </div>
                      )}

                      <h3 className="text-lg font-semibold mb-2">Examples</h3>
                      <div className="space-y-3 mb-4">
                        {currentQuestion?.testCases?.filter(tc => !tc.isHidden).slice(0, 3).map((tc, i) => (
                          <div key={i} className="p-3 rounded-lg bg-muted/50 border border-border">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Example {i + 1}</span>
                              <Badge variant="outline" className="text-[10px]">{tc.points} pts</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                              <div className="p-2 rounded bg-background border border-border">
                                <span className="text-muted-foreground text-[10px] mb-1 block">Input</span>
                                <pre className="whitespace-pre-wrap text-xs">{tc.input}</pre>
                              </div>
                              <div className="p-2 rounded bg-background border border-border">
                                <span className="text-muted-foreground text-[10px] mb-1 block">Output</span>
                                <pre className="whitespace-pre-wrap text-xs">{tc.output}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {currentQuestion?.explanation && (
                        <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/40">
                          <p className="text-xs font-semibold text-green-800 dark:text-green-400 mb-1 flex items-center gap-1">
                            <Lightbulb className="w-3.5 h-3.5" />
                            Explanation
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300 whitespace-pre-wrap">{currentQuestion.explanation}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Code Editor + Output */}
              <div className="lg:col-span-1 flex flex-col h-full space-y-4">
                {/* Code Editor */}
                <Card className="border border-border flex-1 flex flex-col min-h-0">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Code className="w-4 h-4 text-primary" />
                      Code Editor
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 p-0">
                    <CodeEditor
                      language={language}
                      code={code}
                      onChange={handleCodeChange}
                      onCursorChange={handleCursorChange}
                      readOnly={isRunning}
                      theme="vs-dark"
                      height="calc(100% - 60px)"
                      showToolbar
                      onRun={handleRunCode}
                      running={isRunning}
                    />
                  </CardContent>
                </Card>

                {/* Execution Output */}
                <ExecutionOutput
                  result={executionResult}
                  isRunning={isRunning}
                  onClear={() => {
                    setExecutionResult(null);
                    setTestResults([]);
                  }}
                  onRetry={handleRunCode}
                  maximized={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodingInterview;