import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Loader2,
  Clock,
  Users,
  Briefcase,
  Code,
  ShieldAlert,
  Lightbulb,
  Square,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { CodeEditor } from "@/components/coding/CodeEditor";
import { ExecutionOutput, type ExecutionResult } from "@/components/coding/ExecutionOutput";
import { getAuthHeaders, API_BASE_URL } from "@/lib/api";
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
  testCases: Array<{ input: string; output: string; isHidden: boolean; points: number }>;
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

const CodingInterview = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CodingAnalysisResult | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [outputMaximized, setOutputMaximized] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const [peerName, setPeerName] = useState<string | null>(null);
  const remoteCodeRef = useRef(false);
  const codeRef = useRef(code);
  const langRef = useRef(language);
  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { langRef.current = language; }, [language]);

  // Session id from URL or generated — shareable via ?session=xxx
  const collabSessionIdRef = useRef<string>(
    searchParams.get("session") || `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
  useEffect(() => {
    if (!searchParams.get("session")) {
      const next = new URLSearchParams(searchParams);
      next.set("session", collabSessionIdRef.current);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once on mount

  // Questions to use: selected subset if any, else fetched list
  const activeQuestions = useMemo(() => {
    return config.questions.length > 0 ? config.questions : questions;
  }, [config.questions, questions]);
  const currentQuestion = activeQuestions[currentQuestionIndex];
  const totalQuestions = activeQuestions.length;

  const DEFAULT_CODE: Record<string, string> = useMemo(() => ({
    python: `def solve():\n    # Write your solution here\n    pass\n\nif __name__ == "__main__":\n    solve()`,
    javascript: `function solve() {\n  // Write your solution here\n}\n\nsolve();`,
    typescript: `function solve(): void {\n  // Write your solution here\n}\n\nsolve();`,
    java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}`,
    go: `package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n}`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}`,
    rust: `fn main() {\n    // Write your solution here\n}`,
  }), []);

  // Persist code per question
  useEffect(() => {
    if (!currentQuestion) return;
    const key = `hiready:code:${currentQuestion._id}:${language}`;
    const saved = localStorage.getItem(key);
    if (saved) setCode(saved);
    else setCode(currentQuestion.starterCode?.[language] || DEFAULT_CODE[language] || "");
  }, [currentQuestion, language, DEFAULT_CODE]);

  useEffect(() => {
    if (!currentQuestion) return;
    const key = `hiready:code:${currentQuestion._id}:${language}`;
    if (code) localStorage.setItem(key, code);
  }, [code, currentQuestion, language]);

  // Collab
  useEffect(() => {
    if (phase !== "interview") return;
    const socket = connectCollab(collabSessionIdRef.current, "candidate");
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("coding:state", { code: codeRef.current, language: langRef.current, cursor: null });
    });
    socket.on("coding:peer-joined", (p: { name?: string }) => {
      setPeerName(p?.name || "Interviewer");
      socket.emit("coding:state", { code: codeRef.current, language: langRef.current, cursor: null });
    });
    socket.on("coding:peer-left", () => setPeerName(null));
    socket.on("coding:code", (p: { code?: string }) => {
      if (typeof p?.code === "string" && p.code !== codeRef.current) {
        remoteCodeRef.current = true;
        setCode(p.code);
      }
    });
    socket.on("coding:error", (p: { error?: string }) => { if (p?.error) toast.error(p.error); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on("connect_error" as never, (err: any) => {
      toast.error(err?.message || "Collab connection failed");
    });
    socket.on("disconnect", () => setPeerName(null));
    return () => { socket.disconnect(); socketRef.current = null; setPeerName(null); };
  }, [phase]);

  const lastCursorEmitRef = useRef(0);
  const handleCodeChange = (next: string) => {
    setCode(next);
    if (!remoteCodeRef.current) socketRef.current?.emit("coding:code", { code: next, file: "main" });
    remoteCodeRef.current = false;
  };
  const handleCursorChange = (pos: { line: number; column: number }) => {
    const now = Date.now();
    if (now - lastCursorEmitRef.current > 80) {
      lastCursorEmitRef.current = now;
      socketRef.current?.emit("coding:cursor", { ...pos, file: "main" });
    }
  };

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`${API_BASE_URL}/code/questions?limit=50`, { headers: getAuthHeaders() });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to load (${res.status})`);
        }
        const data = await res.json();
        setQuestions(data.questions || []);
        if ((data.questions || []).length === 0) toast.info("No coding questions available — contact admin");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load questions");
        console.error(e);
      } finally { setIsLoading(false); }
    };
    fetchQuestions();
  }, []);

  const handleStartInterview = async () => {
    const qs = config.questions.length > 0 ? config.questions : questions;
    if (qs.length === 0) { toast.error("Please select at least one question"); return; }
    // If user selected subset, ensure activeQuestions reflects it
    if (config.questions.length === 0) {
      // auto-pick first question if none selected
      setConfig(prev => ({ ...prev, questions: qs.slice(0, 1) }));
    }
    setCurrentQuestionIndex(0);
    setPhase("interview");
    setExecutionResult(null);
    setShowReport(false);
    setAnalysisResult(null);
    try { await document.documentElement.requestFullscreen?.(); } catch { /* ignore */ }
  };

  const handleRunCode = async () => {
    if (!code.trim()) { toast.error("Please write some code first"); return; }
    setIsRunning(true);
    setExecutionResult(null);
    try {
      const endpoint = currentQuestion ? `${API_BASE_URL}/code/run-tests/${currentQuestion._id}` : `${API_BASE_URL}/code/execute`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code, language, input: "", timeLimit: currentQuestion?.timeLimit || 10000, memoryLimit: currentQuestion?.memoryLimit || 256 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) { toast.error("Session expired, please login again"); throw new Error(err.error || "Unauthorized"); }
        throw new Error(err.error || `Execution failed (${res.status})`);
      }
      const result = await res.json();
      // Normalize to ExecutionResult for ExecutionOutput
      const execResult: ExecutionResult = result.testResults ? {
        success: !!result.success,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: result.success ? 0 : 1,
        executionTime: result.testResults?.[0]?.executionTime || 0,
        timedOut: false,
        testResults: result.testResults,
      } : result;
      setExecutionResult(execResult);
      if (typeof result.passedCount === "number") {
        if (result.success) toast.success(`All ${result.total} test cases passed! 🎉`);
        else toast.warning(`${result.passedCount}/${result.total} test cases passed`);
      } else if (result.success) toast.success("Execution succeeded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execution failed");
    } finally { setIsRunning(false); }
  };

  const handleSubmit = async () => {
    if (!code.trim()) { toast.error("Please write some code before submitting"); return; }
    if (!currentQuestion) { toast.error("No question selected"); return; }
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/code/submit/${currentQuestion._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code, language }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) { toast.error("Session expired"); throw new Error(err.error || "Unauthorized"); }
        throw new Error(err.error || `Submission failed (${res.status})`);
      }
      const data = await res.json();
      setExecutionResult({
        success: data.status === "accepted",
        stdout: "",
        stderr: "",
        exitCode: data.status === "accepted" ? 0 : 1,
        executionTime: data.testResults?.reduce((s: number, r: { executionTime?: number }) => s + (r.executionTime || 0), 0) || 0,
        timedOut: data.status === "time_limit_exceeded",
        testResults: data.testResults,
      });
      toast.success(data.status === "accepted" ? `Accepted! Score ${data.score}/${data.maxScore} 🎉` : `${data.passedCount}/${data.total} tests passed`);
      await analyzeSolution(`Status: ${data.status}, Passed: ${data.passedCount}/${data.total}, Score: ${data.score}/${data.maxScore}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally { setIsAnalyzing(false); }
  };

  const analyzeSolution = async (extraContext?: string) => {
    if (!code.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ai/interview-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ transcript: `Problem: ${currentQuestion?.title}\n\nSolution:\n${code}${extraContext ? `\n\nTest results: ${extraContext}` : ""}`, targetRole: config.role }),
      });
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || `Analysis failed (${res.status})`);
      const analysis = await res.json();
      setAnalysisResult(analysis);
      setShowReport(true);
    } catch (e) { console.error(e); toast.error("Analysis failed"); }
  };

  const handleLanguageChange = (newLanguage: string) => {
    const prevCode = code;
    const currentStarter = currentQuestion?.starterCode?.[newLanguage];
    const fallback = DEFAULT_CODE[newLanguage] || "";
    const nextCode = currentStarter !== undefined && currentStarter !== "" ? currentStarter : fallback;
    // If user has unsaved custom code, confirm overwrite
    const hasCustom = prevCode && prevCode !== (currentQuestion?.starterCode?.[language] || DEFAULT_CODE[language] || "");
    if (hasCustom) {
      const ok = window.confirm("Switch language will replace your current code with starter code. Continue?");
      if (!ok) return;
    }
    setLanguage(newLanguage);
    setCode(nextCode);
  };

  const handleExitInterview = () => {
    if (!window.confirm("End the coding session and return to the dashboard? Your current session progress will be lost.")) return;
    try { document.exitFullscreen?.(); } catch { /* ignore */ }
    navigate("/dashboard");
  };

  useEffect(() => {
    const h = () => {};
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const goNext = () => setCurrentQuestionIndex(i => Math.min(totalQuestions - 1, i + 1));
  const goPrev = () => setCurrentQuestionIndex(i => Math.max(0, i - 1));

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

  const LANGUAGES = [
    { value: "python", label: "Python", icon: "🐍" },
    { value: "javascript", label: "JavaScript", icon: "🟨" },
    { value: "typescript", label: "TypeScript", icon: "🔷" },
    { value: "java", label: "Java", icon: "☕" },
    { value: "go", label: "Go", icon: "🐹" },
    { value: "cpp", label: "C++", icon: "🔷" },
    { value: "rust", label: "Rust", icon: "🦀" },
  ];

  if (showReport && analysisResult) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <Card>
            <CardHeader><CardTitle>Submission Report</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded bg-muted"><p className="text-xs text-muted-foreground">Overall</p><p className="text-xl font-bold">{analysisResult.overallScore ?? "-"}</p></div>
                <div className="p-3 rounded bg-muted"><p className="text-xs text-muted-foreground">Confidence</p><p className="text-xl font-bold">{analysisResult.confidenceScore ?? "-"}</p></div>
                <div className="p-3 rounded bg-muted"><p className="text-xs text-muted-foreground">Content</p><p className="text-xl font-bold">{analysisResult.contentScore ?? "-"}</p></div>
              </div>
              {analysisResult.strengths && <div><h4 className="font-semibold">Strengths</h4><ul className="list-disc pl-5 text-sm">{analysisResult.strengths.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
              {analysisResult.improvements && <div><h4 className="font-semibold">Improvements</h4><ul className="list-disc pl-5 text-sm">{analysisResult.improvements.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
              {analysisResult.rejectionReasons && <div><h4 className="font-semibold">Risk</h4><ul className="list-disc pl-5 text-sm">{analysisResult.rejectionReasons.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
              <ExecutionOutput result={executionResult} isRunning={false} onClear={()=>{}} onRetry={handleRunCode} maximized={false} onMaximizeToggle={()=>setOutputMaximized(!outputMaximized)} />
              <div className="flex gap-2">
                <Button onClick={()=>{setShowReport(false); if(currentQuestionIndex < totalQuestions-1) goNext();}}>Next Question</Button>
                <Button variant="outline" onClick={()=> setShowReport(false)}>Back to Editor</Button>
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border p-8 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Code className="w-6 h-6 text-primary" /></div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Coding Interview Setup</h1>
                <p className="text-muted-foreground mt-1">Configure your coding interview</p>
                {peerName && <p className="text-xs text-success">Peer: {peerName}</p>}
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6 bg-card rounded-b-xl border border-border">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Role</label>
              <input type="text" value={config.role} onChange={(e)=>setConfig({...config, role:e.target.value})} placeholder="e.g., Software Engineer" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Experience Level</label>
                <select value={config.experienceLevel} onChange={(e)=>setConfig({...config, experienceLevel:e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="Fresher">Fresher</option><option value="Intern">Intern</option><option value="Entry-Level">Entry Level</option><option value="Mid-Level">Mid Level</option><option value="Senior-Level">Senior Level</option><option value="Lead">Lead</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Interview Type</label>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {id:"coding", label:"Coding", desc:"Algorithms", icon:Code},
                    {id:"technical", label:"Technical", desc:"System Design", icon:Briefcase},
                    {id:"behavioral", label:"Behavioral", desc:"STAR", icon:Users},
                  ].map(type=> (
                    <button key={type.id} onClick={()=>setConfig({...config, interviewType:type.id as InterviewConfig["interviewType"]})} className={`p-3 rounded-lg border-2 text-left ${config.interviewType===type.id?"border-primary bg-primary/5":"border-border hover:border-primary/50"}`}>
                      <div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-lg"><type.icon className="w-5 h-5 text-primary" /></div><div><p className="font-medium">{type.label}</p><p className="text-xs text-muted-foreground">{type.desc}</p></div></div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Questions ({config.questions.length} selected)</label>
              <div className="max-h-60 overflow-y-auto border border-border rounded-lg p-3">
                {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                 : questions.length===0 ? <p className="text-sm text-muted-foreground text-center py-4">No coding questions available</p>
                 : <div className="space-y-2">{questions.map((q)=> {
                     const checked = config.questions.some(s => s._id === q._id);
                     return (
                     <label key={q._id} className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                       <Checkbox checked={checked} onCheckedChange={()=> setConfig(prev=> ({...prev, questions: prev.questions.some(s=>s._id===q._id) ? prev.questions.filter(s=>s._id!==q._id) : [...prev.questions, q]}))} />
                       <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{q.title}</p><div className="flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="text-[10px] capitalize">{q.difficulty}</Badge><Badge variant="outline" className="text-[10px]">{q.category}</Badge></div></div>
                     </label>
                 )})}</div>}
              </div>
              {questions.length>0 && <p className="text-xs text-muted-foreground">Leave empty to practice with first available question. Selected questions will be used in interview order.</p>}
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Button>
              <Button className="flex-1 bg-gradient-primary hover:opacity-90" onClick={() => setPhase("guidelines")} disabled={config.questions.length===0 && questions.length===0}>Continue to Guidelines</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "guidelines") {
    // ... keep guidelines same but ensure Start button works
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border p-8 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><ShieldAlert className="w-6 h-6 text-destructive" /></div>
              <div><h1 className="text-3xl font-bold">Coding Interview Guidelines</h1><p className="text-lg text-muted-foreground mt-1">Please read all instructions carefully</p></div>
            </div>
          </div>
          <div className="p-6 space-y-6 bg-card rounded-b-xl border border-border">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-blue-600 rounded-lg"><Clock className="w-5 h-5 text-white" /></div><span className="font-semibold text-lg">Duration & Format</span></div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Duration: {currentQuestion?.timeLimit ? `${Math.ceil(currentQuestion.timeLimit/60000)} min` : "Timed per question"}</li>
                  <li>• Format: Coding challenge with AI interviewer</li>
                  <li>• Session: <code className="text-xs bg-muted px-1 rounded">{collabSessionIdRef.current}</code> (share URL with interviewer)</li>
                </ul>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-purple-600 rounded-lg"><Code className="w-5 h-5 text-white" /></div><span className="font-semibold text-lg">Environment</span></div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Language: {LANGUAGES.find(l=>l.value===language)?.label}</li>
                  <li>• Fullscreen: Required</li>
                  <li>• Proctoring: Active</li>
                  {peerName && <li className="text-success">• Peer: {peerName} joined</li>}
                </ul>
              </div>
            </div>
            <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-5 mb-6">
              <div className="flex items-start gap-3">
                <Checkbox checked={agreedToTerms} onCheckedChange={(v)=>setAgreedToTerms(v as boolean)} className="mt-1" />
                <label className="text-sm cursor-pointer flex-1"><span className="font-semibold">I agree to the instructions and understand that violations will terminate my interview</span><p className="text-xs text-muted-foreground mt-1">3 violations (tab, fullscreen, clipboard) will terminate immediately.</p></label>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Dashboard
              </Button>
              <Button variant="outline" onClick={()=> setPhase("setup")} className="flex-1">Back to Setup</Button>
              <Button onClick={handleStartInterview} disabled={!agreedToTerms} className="flex-1 bg-gradient-primary hover:opacity-90 disabled:opacity-50">Start Coding Interview</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        <div className="border-b border-border bg-card shrink-0">
          <div className="max-w-full mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center"><Code className="w-4 h-4 text-white" /></div>
              <div>
                <h2 className="text-lg font-semibold">{config.role} — Coding Interview</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs"><span className="w-2 h-2 rounded-full bg-success mr-1.5 animate-pulse" />Live</Badge>
                  {peerName && <Badge variant="secondary" className="text-xs">{peerName} watching</Badge>}
                  <span className="text-xs text-muted-foreground">Session: {collabSessionIdRef.current.slice(0,12)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goPrev} disabled={currentQuestionIndex===0}><ChevronLeft className="w-4 h-4" />Prev</Button>
              <span className="text-xs text-muted-foreground">Q {currentQuestionIndex+1}/{totalQuestions}</span>
              <Button variant="outline" size="sm" onClick={goNext} disabled={currentQuestionIndex>=totalQuestions-1}>Next<ChevronRight className="w-4 h-4" /></Button>
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map(lang=> <SelectItem key={lang.value} value={lang.value}><span className="flex items-center gap-2">{lang.icon} {lang.label}</span></SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={handleExitInterview}><Minimize2 className="w-4 h-4 mr-1" />End Session</Button>
              <Button variant="ghost" size="sm" onClick={handleSubmit} disabled={isAnalyzing}><Square className="w-4 h-4 mr-1" />{isAnalyzing?"Analyzing...":"Submit"}</Button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex">
          <div className="w-full max-w-6xl mx-auto px-4 py-6 flex-1">
            <div className="grid lg:grid-cols-3 gap-4 h-full">
              <div className="lg:col-span-2 flex flex-col h-full">
                <Card className="border border-border h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs capitalize">{currentQuestion?.difficulty}</Badge><Badge variant="outline" className="text-[10px]">{currentQuestion?.category}</Badge></div>
                      <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Question {currentQuestionIndex + 1} of {totalQuestions}</span><Badge variant="outline" className="text-xs">Live</Badge></div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <h2 className="text-xl font-bold mb-2">{currentQuestion?.title}</h2>
                      <div className="text-muted-foreground mb-4 whitespace-pre-wrap">{currentQuestion?.description}</div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-muted/50 border"><p className="text-xs text-muted-foreground mb-1">Time Limit</p><p className="font-semibold">{currentQuestion?.timeLimit ? `${Math.ceil(currentQuestion.timeLimit/60000)} min` : "No limit"}</p></div>
                        <div className="p-3 rounded-lg bg-muted/50 border"><p className="text-xs text-muted-foreground mb-1">Memory Limit</p><p className="font-semibold">{currentQuestion?.memoryLimit} MB</p></div>
                      </div>
                      {currentQuestion?.constraints && <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200"><p className="text-xs font-semibold text-yellow-800 dark:text-yellow-400 mb-1">Constraints</p><p className="text-sm whitespace-pre-wrap">{currentQuestion.constraints}</p></div>}
                      <h3 className="text-lg font-semibold mb-2">Examples</h3>
                      <div className="space-y-3 mb-4">
                        {currentQuestion?.testCases?.filter(tc=>!tc.isHidden).slice(0,3).map((tc,i)=> (
                          <div key={i} className="p-3 rounded-lg bg-muted/50 border">
                            <div className="flex items-center gap-2 mb-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Example {i+1}</span><Badge variant="outline" className="text-[10px]">{tc.points} pts</Badge></div>
                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                              <div className="p-2 rounded bg-background border"><span className="text-muted-foreground text-[10px] mb-1 block">Input</span><pre className="whitespace-pre-wrap text-xs">{tc.input}</pre></div>
                              <div className="p-2 rounded bg-background border"><span className="text-muted-foreground text-[10px] mb-1 block">Output</span><pre className="whitespace-pre-wrap text-xs">{tc.output}</pre></div>
                            </div>
                          </div>
                        ))}
                        {(!currentQuestion?.testCases || currentQuestion.testCases.filter(tc=>!tc.isHidden).length===0) && <p className="text-sm text-muted-foreground">No examples — hidden tests only.</p>}
                      </div>
                      {currentQuestion?.explanation && <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200"><p className="text-xs font-semibold text-green-800 dark:text-green-400 mb-1 flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" />Explanation</p><p className="text-sm whitespace-pre-wrap">{currentQuestion.explanation}</p></div>}
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="lg:col-span-1 flex flex-col h-full space-y-4">
                <Card className="border border-border flex-1 flex flex-col min-h-0">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm flex items-center gap-2"><Code className="w-4 h-4 text-primary" />Code Editor</CardTitle></CardHeader>
                  <CardContent className="flex-1 p-0 flex flex-col min-h-[400px]">
                    <CodeEditor language={language} code={code} onChange={handleCodeChange} onCursorChange={handleCursorChange} readOnly={isRunning} theme="vs-dark" height="100%" showToolbar onRun={handleRunCode} running={isRunning} />
                  </CardContent>
                </Card>
                <ExecutionOutput result={executionResult} isRunning={isRunning} onClear={()=> setExecutionResult(null)} onRetry={handleRunCode} maximized={outputMaximized} onMaximizeToggle={()=> setOutputMaximized(v=>!v)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodingInterview;
