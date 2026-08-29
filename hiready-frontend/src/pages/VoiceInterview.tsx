import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, X, Volume2, AlertCircle, SkipForward, BookOpen, Laptop, Clock, Users, Briefcase, MonitorSmartphone, ShieldAlert } from "lucide-react";
import CandidateWebcamMonitor from "@/components/proctoring/CandidateWebcamMonitor";
import { sendProctorLog, type ProctorEvent } from "@/lib/proctorLogger";
import { captureWebcamSnapshot } from "@/lib/webcamSnap";
import { saveInterviewSession } from "@/lib/historyApi";
import { detectDevice } from "@/lib/deviceGuard";
import { runAudioCheck, type AudioCheckResult } from "@/lib/audioCheck";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { deepgramService } from "@/lib/deepgram";
import { llmService, type InterviewConfig } from "@/lib/llm";
import {
  checkBrowserCompatibility,
  validateAIAvailability,
  getErrorMessage
} from "@/lib/voiceInterviewUtils";

// ============================================================
// Guidelines Screen Component - Reusable for Voice Interview
// ============================================================
const GuidelinesScreen: React.FC<{
  onStart: () => void;
  onBack: () => void;
}> = ({ onStart, onBack }) => {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [audioChecking, setAudioChecking] = useState(false);
  const [audioCheckResult, setAudioCheckResult] = useState<{ rms: number; status: "quiet" | "moderate" | "noisy"; message: string } | null>(null);

  const handleAudioCheck = async () => {
    setAudioChecking(true);
    try {
      const result = await runAudioCheck();
      setAudioCheckResult(result);
    } catch {
      toast.error("Could not access microphone");
    } finally {
      setAudioChecking(false);
    }
  };

  // Define instruction sections
  const instructionSections = [
    {
      title: "General Instructions",
      icon: BookOpen,
      items: [
        "Read all instructions carefully before starting the voice interview",
        "Ensure you have a stable internet connection throughout the session",
        "Use a device with a working camera and microphone",
        "Complete the interview in one sitting without interruptions",
        "Do not share or discuss interview questions with others"
      ]
    },
    {
      title: "Technical Requirements",
      icon: Laptop,
      items: [
        "Use a desktop or laptop only — mobile phones and tablets are blocked",
        "Ensure your microphone is working and audio is clear",
        "Allow browser microphone permissions when prompted",
        "Use a well-lit environment with minimal background noise",
        "Close all unnecessary applications to avoid distractions",
        "Ensure stable WiFi or wired internet connection (minimum 5 Mbps)"
      ]
    },
    {
      title: "Strict Proctoring Rules — Zero Tolerance",
      icon: ShieldAlert,
      items: [
        "The interview runs in fullscreen. Exiting fullscreen is a violation and you will be forced back in",
        "Switching tabs, minimizing, or clicking another window is a violation",
        "Copy, cut, paste, right-click, and developer tools are completely blocked",
        "Your webcam is monitored throughout — keep your face visible at all times",
        "3 violations = the interview is TERMINATED immediately and flagged in your report",
        "All violations are logged with timestamps to your permanent interview record"
      ]
    }
  ];

  const handleStartClick = () => {
    if (!agreedToTerms) {
      toast.error("Please agree to the instructions before starting");
      return;
    }
    onStart();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl border border-border shadow-2xl animate-in slide-in-from-bottom-5 duration-500">
        
        {/* Header Section */}
        <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border p-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-foreground">
              Voice Interview Instructions
            </h1>
            <p className="text-lg text-muted-foreground">
              Please read all instructions carefully before proceeding
            </p>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-8">
          {/* Duration & Format Cards */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-foreground text-lg">Duration & Format</span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• <span className="font-medium">Duration:</span> Approximately 10-15 minutes</li>
                <li>• <span className="font-medium">Format:</span> Voice conversation with AI</li>
                <li>• <span className="font-medium">Type:</span> Real-time speech recognition</li>
              </ul>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-foreground text-lg">What to Expect</span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• <span className="font-medium">Questions:</span> 5-6 behavioral & technical</li>
                <li>• <span className="font-medium">Response:</span> Speak your answers naturally</li>
                <li>• <span className="font-medium">Analysis:</span> Real-time voice transcription</li>
              </ul>
            </div>
          </div>

          {/* Instruction Sections */}
          <div className="space-y-6 mb-8">
            {instructionSections.map((section, sectionIdx) => {
              const IconComponent = section.icon;
              return (
                <div
                  key={sectionIdx}
                  className="border border-border rounded-lg p-6 bg-card hover:bg-muted/30 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <IconComponent className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {section.title}
                    </h3>
                  </div>

                  <ul className="space-y-3 pl-2">
                    {section.items.map((item, itemIdx) => (
                      <li
                        key={itemIdx}
                        className="flex gap-3 items-start group"
                      >
                        <div className="min-w-fit mt-1">
                          <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold">
                            ✓
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Audio Environment Check */}
          <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-5 mb-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Mic className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Microphone & Environment Check</h3>
                <p className="text-sm text-muted-foreground">Quick 3-second noise level test to ensure your audio is clear</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleAudioCheck}
                disabled={audioChecking}
              >
                <Mic className="mr-2 w-4 h-4" />
                {audioChecking ? "Checking..." : "Run 3-Second Noise Check"}
              </Button>
              {audioCheckResult && (
                <div className="flex-1 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: audioCheckResult.status === "quiet" ? "hsl(var(--success))" : audioCheckResult.status === "moderate" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }}>
                    <div className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: audioCheckResult.status === "quiet" ? "hsl(var(--success))" : audioCheckResult.status === "moderate" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }} />
                  </div>
                  <span className="text-sm font-medium">
                    {audioCheckResult.status === "quiet" ? "Quiet ✓" : audioCheckResult.status === "moderate" ? "Moderate" : "Noisy"}
                  </span>
                </div>
              )}
            </div>
            {audioCheckResult && (
              <p className="text-xs text-muted-foreground">{audioCheckResult.message}</p>
            )}
          </div>

          {/* Agreement Checkbox */}
          <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-5 mb-8 space-y-4">
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={onBack}
              className="flex-1"
            >
              Back to Home
            </Button>
            <Button
              onClick={handleStartClick}
              disabled={!agreedToTerms}
              className="flex-1 bg-gradient-primary hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Test
            </Button>
          </div>

          {/* Helper Text */}
          {!agreedToTerms && (
            <p className="text-xs text-yellow-700 dark:text-yellow-200 mt-3 text-center">
              ⚠ Please check the agreement box to proceed with the voice interview
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// Interview Setup Screen — role-adaptive interview configuration
// ============================================================
const ROLE_SUGGESTIONS = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Data Analyst",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "Mobile Developer",
  "QA Engineer",
];

  const EXPERIENCE_LEVELS = ["Fresher", "Intern", "Entry-Level", "Mid-Level", "Senior-Level"];

const InterviewSetupScreen: React.FC<{
  onContinue: (config: InterviewConfig) => void;
}> = ({ onContinue }) => {
  const [role, setRole] = useState("Frontend Developer");
  const [experienceLevel, setExperienceLevel] = useState("Mid-Level");
  const [jobDescription, setJobDescription] = useState("");
  const [mode, setMode] = useState<"assessment" | "practice">("assessment");
  const [interviewType, setInterviewType] = useState<"technical" | "behavioral">("technical");

  const handleContinue = () => {
    if (!role.trim()) {
      toast.error("Please enter a target job role");
      return;
    }
    onContinue({
      role: role.trim().slice(0, 120),
      experienceLevel,
      jobDescription: jobDescription.trim() || undefined,
      mode,
      interviewType,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border border-border shadow-2xl animate-in slide-in-from-bottom-5 duration-500">
        <div className="bg-gradient-to-r from-primary/10 to-transparent border-b border-border p-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Briefcase className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Interview Setup</h1>
              <p className="text-muted-foreground mt-1">
                Tell us what you're interviewing for — the AI interviewer tailors every question to it
              </p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="job-role">Target Role</Label>
            <Input
              id="job-role"
              placeholder="e.g. React Developer"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={120}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {ROLE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setRole(suggestion)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    role === suggestion
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Experience Level</Label>
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Select experience level" />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Interview Round</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: "technical", title: "Technical", desc: "Skills depth, problem-solving + one behavioral", icon: Briefcase, color: "primary" },
                { id: "behavioral", title: "HR Behavioral", desc: "STAR stories, culture fit, motivation — no technical", icon: Users, color: "accent" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setInterviewType(t.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    interviewType === t.id
                      ? t.color === "primary" ? "border-primary bg-primary/5" : "border-accent bg-accent/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <t.icon className={`w-4 h-4 ${t.color === "primary" ? "text-primary" : "text-accent"}`} /> {t.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Interview Mode</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("assessment")}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === "assessment"
                    ? "border-destructive/60 bg-destructive/5"
                    : "border-border hover:border-destructive/40"
                }`}
              >
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-destructive" /> Assessment
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Strict proctoring. 3 violations = terminated. No copy/paste.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === "practice"
                    ? "border-success/60 bg-success/5"
                    : "border-border hover:border-success/40"
                }`}
              >
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-success" /> Practice
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Relaxed rules. Violations logged but never terminate the session.
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jd">
              Job Description <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="jd"
              placeholder="Paste the job description to focus questions on the exact requirements..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value.slice(0, 2000))}
              rows={5}
            />
            <p className="text-xs text-muted-foreground text-right">
              {jobDescription.length}/2000
            </p>
          </div>

          <Button onClick={handleContinue} className="w-full bg-gradient-primary hover:opacity-90">
            Continue to Instructions
          </Button>
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// Voice Interview Content Component
// ============================================================
const VoiceInterviewContent = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phase, setPhase] = useState<"setup" | "guidelines" | "interview">("setup");

  const [isRecording, setIsRecording] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [caption, setCaption] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [jobRole, setJobRole] = useState("Frontend Developer");
  const [experienceLevel, setExperienceLevel] = useState("Mid-Level");
  const [interviewMode, setInterviewMode] = useState<"assessment" | "practice">("assessment");
  const [interviewType, setInterviewType] = useState<"technical" | "behavioral">("technical");
  const [voiceRate, setVoiceRate] = useState(0.9);
  const [userTranscript, setUserTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [conversationLog, setConversationLog] = useState<Array<{ role: string; text: string }>>([]);
  
  const transcriptBufferRef = useRef("");
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef(`interview_${Date.now()}`);
  // Pause grace period state: lets candidates think mid-answer without being cut off
  const [pauseCountdown, setPauseCountdown] = useState<number | null>(null);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pauseRemainingRef = useRef(0);
  const proctorLogsRef = useRef<ProctorEvent[]>([]);
  const sessionStartRef = useRef<number>(Date.now());

  // ── Delivery metrics: captured per answer (duration, WPM, fillers) ──
  const answerStartRef = useRef<number | null>(null);
  const answerMetricsRef = useRef<
    Array<{ durationSec: number; words: number; wpm: number; fillers: number }>
  >([]);

  const FILLER_RE = /\b(um+|uh+|erm|like|you know|i mean|basically|actually|sort of|kind of)\b/gi;

  const captureAnswerMetric = (transcript: string) => {
    if (!answerStartRef.current) return;
    const durationSec = Math.max(1, Math.round((Date.now() - answerStartRef.current) / 1000));
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    const fillers = (transcript.match(FILLER_RE) || []).length;
    answerMetricsRef.current.push({
      durationSec,
      words,
      wpm: Math.round((words / Math.max(durationSec, 1)) * 60),
      fillers,
    });
    answerStartRef.current = null;
  };

  // ── Strict proctoring: violation tracking (3 violations = terminated) ──
  const MAX_VIOLATIONS = 3;
  const [violationCount, setViolationCount] = useState(0);
  const violationCountRef = useRef(0);
  const endedByViolationsRef = useRef(false);

  const registerViolation = (type: string, message: string) => {
    logProctorEvent(type);
    violationCountRef.current += 1;
    const count = violationCountRef.current;
    setViolationCount(count);

    if (count >= MAX_VIOLATIONS) {
      endedByViolationsRef.current = true;
      toast.error(`Interview TERMINATED — ${MAX_VIOLATIONS} proctoring violations recorded.`, {
        duration: 8000,
      });
      // Give the toast a beat to render before tearing down
      setTimeout(() => handleEndInterview(), 800);
      return;
    }
    toast.warning(`${message} Violation ${count} of ${MAX_VIOLATIONS}. At ${MAX_VIOLATIONS} the interview is auto-terminated.`, {
      duration: 7000,
    });
  };

  // Get user initials for avatar fallback
  const getInitials = (displayName: string | null) => {
    if (!displayName) return "U";
    return displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 1);
  };

  // Derive a display name: prefer displayName, then extract from email, fallback to "Candidate"
  const getCandidateName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) {
      const localPart = user.email.split("@")[0];
      // Turn "john.doe" or "john_doe" into "John Doe"
      return localPart
        .split(/[._-]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
    return "Candidate";
  };

  // Fullscreen only during assessment-mode interviews; exit on unmount
  useEffect(() => {
    if (phase !== "interview" || interviewMode !== "assessment") return;
    const enterFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn("Fullscreen request failed:", err);
      }
    };
    enterFullscreen();

    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [phase, interviewMode]);

  // ── Session timer (live interview only) ──
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (phase !== "interview") return;
    const start = sessionStartRef.current;
    const tick = () => setElapsedSeconds(Math.round((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Helper to log a proctor event locally + send to backend (with webcam evidence)
  const logProctorEvent = (eventName: string) => {
    const snapshot = captureWebcamSnapshot();
    const event: ProctorEvent = {
      event: eventName,
      timestamp: new Date().toISOString(),
      sessionId: sessionIdRef.current,
      ...(snapshot ? { snapshot } : {}),
    };
    proctorLogsRef.current = [...proctorLogsRef.current, event];
    sendProctorLog(event);
  };

  // ── Proctoring listeners: strict in assessment mode, warn-only in practice ──
  useEffect(() => {
    if (phase !== "interview") return;
    const isPractice = interviewMode === "practice";

    const softWarn = (type: string, message: string) => {
      if (isPractice) {
        logProctorEvent(type);
        toast.info(`${message} (logged — practice mode)`, { duration: 3000 });
      } else {
        registerViolation(type, message);
      }
    };

    // Tab switch / window minimized
    const handleVisibilityChange = () => {
      if (document.hidden) {
        softWarn("tab_switch_detected", "Tab switch detected!");
      }
    };

    // Fullscreen exit
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isPractice) {
        registerViolation(
          "fullscreen_exit_detected",
          "Fullscreen mode exited! Re-entering fullscreen."
        );
        // Force back into fullscreen immediately
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };

    // Clicking into another window/monitor
    const handleWindowBlur = () => {
      softWarn("window_blur_detected", "You left the interview window!");
    };

    // Copy / cut / paste blocked (assessment only)
    const blockClipboard = (e: Event) => {
      e.preventDefault();
      registerViolation("clipboard_blocked", `${e.type.charAt(0).toUpperCase()}${e.type.slice(1)} is not allowed during the interview.`);
    };

    // Right-click blocked (assessment only)
    const blockContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      registerViolation("right_click_blocked", "Right-click is disabled during the interview.");
    };

    // DevTools / view-source shortcuts blocked (assessment only)
    const blockShortcuts = (e: KeyboardEvent) => {
      const isDevTools =
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) ||
        ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "U");
      if (isDevTools) {
        e.preventDefault();
        registerViolation("devtools_shortcut_blocked", "Developer tools shortcuts are blocked.");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("blur", handleWindowBlur);

    if (!isPractice) {
      document.addEventListener("copy", blockClipboard);
      document.addEventListener("cut", blockClipboard);
      document.addEventListener("paste", blockClipboard);
      document.addEventListener("contextmenu", blockContextMenu);
      document.addEventListener("keydown", blockShortcuts);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registerViolation only touches refs and stable setters; re-arming listeners on its identity change is not needed
  }, [phase, interviewMode]);

  // Configure the AI interviewer and move to the guidelines screen
  const handleSetupContinue = (config: InterviewConfig) => {
    setJobRole(config.role);
    setExperienceLevel(config.experienceLevel);
    setInterviewMode(config.mode ?? "assessment");
    setInterviewType(config.interviewType ?? "technical");
    llmService.configure(config);
    sessionStorage.setItem("interviewConfig", JSON.stringify(config));
    setPhase("guidelines");
  };

  useEffect(() => {
    if (phase !== "interview") return;

    // Mark when the live interview started (for duration stats)
    sessionStartRef.current = Date.now();

    // Check browser compatibility and backend AI availability
    const compatibility = checkBrowserCompatibility();
    if (!compatibility.isCompatible) {
      toast.error(`Browser not supported. Missing: ${compatibility.missingFeatures.join(", ")}`);
      return;
    }

    let cancelled = false;
    validateAIAvailability().then((apiValidation) => {
      if (cancelled) return;
      if (!apiValidation.isValid) {
        toast.error(`${apiValidation.missingKeys[0] || "AI services unavailable"}`);
        setCaption("⚠️ AI services are unavailable. Please check that the backend is running.");
        return;
      }

      // Start interview with initial question from LLM
      startInterview();
    });

    return () => {
      cancelled = true;
      // Cleanup on unmount
      if (deepgramService.isRecording()) {
        deepgramService.stopLiveTranscription();
      }
      if (recordingTimeoutRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally clearing the latest pending timeout set by startInterview during the effect lifetime
        clearTimeout(recordingTimeoutRef.current);
      }
      if (pauseTimerRef.current) {
        clearInterval(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      // Stop speech synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: interview must start exactly once when phase becomes "interview"; adding startInterview would restart it on every render
  }, [phase]);

  /**
   * Start the interview by getting initial question from LLM
   */
  const startInterview = async () => {
    try {
      setIsAISpeaking(true);
      setCaption("AI Interviewer is preparing the first question...");
      
      const initialQuestion = await llmService.getInitialQuestion();
      
      setCaption(initialQuestion);
      setConversationLog([{ role: "interviewer", text: initialQuestion }]);
      
      // Speak the question using Web Speech API
      speakText(initialQuestion);
      
      setTimeout(() => {
        setIsAISpeaking(false);
      }, 3000);
    } catch (error) {
      console.error("Error starting interview:", error);
      const errorMsg = getErrorMessage(error);
      toast.error(errorMsg);
      setCaption(`❌ ${errorMsg}`);
    }
  };

  /**
   * Skip/Stop the current AI speech
   */
  const skipAudio = () => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsAISpeaking(false);
      toast.info("Audio skipped");
    }
  };

  /**
   * Text-to-Speech using Web Speech API (rate from voice settings)
   */
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = voiceRate;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  /**
   * Toggle recording with Deepgram
   */
  const toggleRecording = async () => {
    if (!isRecording) {
      await startRecording();
    } else {
      stopRecording();
    }
  };

  /**
   * Pause grace period: when Deepgram reports UtteranceEnd, don't cut the
   * candidate off mid-answer — start a visible countdown instead. If they
   * resume speaking (any new transcript), the countdown cancels automatically.
   */
  const cancelPauseCountdown = () => {
    if (pauseTimerRef.current) {
      clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    pauseRemainingRef.current = 0;
    setPauseCountdown(null);
  };

  const beginPauseCountdown = () => {
    if (pauseTimerRef.current) return; // already counting down
    pauseRemainingRef.current = 4;
    setPauseCountdown(4);
    pauseTimerRef.current = setInterval(() => {
      pauseRemainingRef.current -= 1;
      setPauseCountdown(pauseRemainingRef.current);
      if (pauseRemainingRef.current <= 0) {
        if (pauseTimerRef.current) {
          clearInterval(pauseTimerRef.current);
          pauseTimerRef.current = null;
        }
        stopRecording();
      }
    }, 1000);
  };

  /**
   * Start recording user's audio with Deepgram
   */
  const startRecording = async () => {
    try {
      setIsRecording(true);
      isRecordingRef.current = true;
      answerStartRef.current = Date.now();
      setCaption("🎤 Listening to your response...");
      setUserTranscript("");
      setInterimTranscript("");
      transcriptBufferRef.current = "";
      toast.info("Recording started");

      // Start Deepgram live transcription
      await deepgramService.startLiveTranscription(
        (transcript: string, isFinal: boolean) => {
          // User resumed speaking — cancel any pending pause countdown
          cancelPauseCountdown();
          if (isFinal) {
            // Accumulate final transcripts (complete sentences)
            const currentText = transcriptBufferRef.current;
            transcriptBufferRef.current = currentText ? `${currentText} ${transcript}` : transcript;
            setInterimTranscript(""); // Clear interim when we get final
          } else {
            // Show interim results in real-time
            setInterimTranscript(transcript);
          }
        },
        () => {
          // Utterance end detected — start a grace countdown instead of cutting
          // the candidate off. Resuming speech cancels it (see onTranscript).
          if (isRecordingRef.current && transcriptBufferRef.current.trim()) {
            beginPauseCountdown();
          }
        },
        (error: Error) => {
          console.error("Deepgram error:", error);
          const errorMsg = getErrorMessage(error);
          toast.error(errorMsg);
          stopRecording();
        }
      );
    } catch (error) {
      console.error("Failed to start recording:", error);
      const errorMsg = getErrorMessage(error);
      toast.error(errorMsg);
      setIsRecording(false);
      setCaption("");
    }
  };

  /**
   * Stop recording and process the transcript
   */
  const stopRecording = () => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }
    cancelPauseCountdown();

    setIsRecording(false);
    isRecordingRef.current = false;
    deepgramService.stopLiveTranscription();
    
    const finalTranscript = transcriptBufferRef.current.trim();

    if (finalTranscript) {
      captureAnswerMetric(finalTranscript);
      setUserTranscript(finalTranscript);
      setCaption("✅ Recording stopped. Processing your answer...");
      toast.success("Recording stopped");
      
      // Add user response to conversation log
      setConversationLog(prev => [...prev, { role: "user", text: finalTranscript }]);
      
      // Process the response with LLM
      processUserResponse(finalTranscript);
    } else {
      setCaption("");
      toast.warning("No speech detected. Please try again.");
    }
    
    setInterimTranscript("");
  };

  /**
   * Send user's transcript to LLM and get interviewer's response
   */
  const processUserResponse = async (transcript: string) => {
    try {
      setIsProcessing(true);
      setCaption("🤔 AI is thinking...");

      const response = await llmService.getInterviewerResponse(transcript);
      
      setIsAISpeaking(true);
      setCaption(response);
      setConversationLog(prev => [...prev, { role: "interviewer", text: response }]);
      
      // Speak the response
      speakText(response);
      
      setQuestionIndex(prev => prev + 1);
      
      setTimeout(() => {
        setIsAISpeaking(false);
        setIsProcessing(false);
      }, 5000);
      
    } catch (error) {
      console.error("Error processing response:", error);
      const errorMsg = getErrorMessage(error);
      toast.error(errorMsg);
      setIsProcessing(false);
      setCaption("");
    }
  };

  /**
   * End the interview and navigate to report
   */
  const handleEndInterview = async () => {
    // Stop any ongoing recording
    if (isRecording) {
      deepgramService.stopLiveTranscription();
    }

    // Stop speech synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // Exit fullscreen before navigating away
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.warn("Failed to exit fullscreen:", err);
      }
    }

    // Save conversation log to session storage for the report page
    sessionStorage.setItem('interviewConversation', JSON.stringify(conversationLog));
    sessionStorage.setItem('proctorLogs', JSON.stringify(proctorLogsRef.current));
    sessionStorage.setItem(
      'interviewIntegrity',
      JSON.stringify({
        violations: violationCountRef.current,
        maxViolations: MAX_VIOLATIONS,
        terminated: endedByViolationsRef.current || violationCountRef.current >= MAX_VIOLATIONS,
      })
    );

    // Persist the session to the user's history (non-blocking)
    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);

    // Aggregate delivery metrics
    const answers = answerMetricsRef.current;
    const totals = answers.reduce(
      (acc, a) => ({
        words: acc.words + a.words,
        fillers: acc.fillers + a.fillers,
        speakingSec: acc.speakingSec + a.durationSec,
      }),
      { words: 0, fillers: 0, speakingSec: 0 }
    );
    const metricsJson = {
      answers,
      totals: {
        ...totals,
        avgWpm: totals.speakingSec > 0 ? Math.round((totals.words / totals.speakingSec) * 60) : 0,
      },
    };
    sessionStorage.setItem('interviewMetrics', JSON.stringify(metricsJson));

    saveInterviewSession({
      sessionId: sessionIdRef.current,
      role: jobRole,
      experienceLevel,
      mode: interviewMode,
      durationSeconds,
      metricsJson,
      interviewType,
      conversationLog: conversationLog.map((m) => ({
        role: m.role === "user" ? "user" : "interviewer",
        text: m.text,
      })),
      integrity: {
        violations: violationCountRef.current,
        maxViolations: MAX_VIOLATIONS,
        terminated:
          endedByViolationsRef.current || violationCountRef.current >= MAX_VIOLATIONS,
      },
    }).then((id) => {
      if (id) sessionStorage.setItem('interviewSessionId', id);
    });

    toast.success("Interview ended");
    navigate("/interview-report");
  };

  // ── Round structure: maps question index to the strict prompt's plan ──
  const getRoundInfo = (qIndex: number): { label: string; round: number } => {
    const isBehavioral = interviewType === "behavioral";
    if (isBehavioral) {
      if (qIndex === 0) return { label: "Round 1 · Background & Motivation", round: 1 };
      if (qIndex <= 4) return { label: `Round ${qIndex + 1} · Behavioral (STAR)`, round: qIndex + 1 };
      return { label: "Final · Wrap-up", round: 6 };
    }
    if (qIndex <= 1) return { label: "Round 1 · Background", round: 1 };
    if (qIndex === 2) return { label: "Round 2 · Technical Depth", round: 2 };
    if (qIndex === 3) return { label: "Round 3 · Problem Solving", round: 3 };
    if (qIndex === 4) return { label: "Round 4 · Behavioral", round: 4 };
    return { label: "Final · Wrap-up", round: 5 };
  };

  // Phase-based rendering: setup → guidelines → live interview
  if (phase === "setup") {
    return <InterviewSetupScreen onContinue={handleSetupContinue} />;
  }

  if (phase === "guidelines") {
    return (
      <GuidelinesScreen
        onStart={() => setPhase("interview")}
        onBack={() => setPhase("setup")}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card shrink-0">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                <span className="text-white text-sm font-bold">AI</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{jobRole} Interview</h2>
                <Badge variant="outline" className="text-xs">
                  <div className={`w-2 h-2 rounded-full mr-1.5 animate-pulse ${interviewMode === "assessment" ? "bg-success" : "bg-primary"}`} />
                  {interviewMode === "assessment" ? "Technical Interview" : "Practice Session"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Voice speed control */}
              <Select
                value={String(voiceRate)}
                onValueChange={(v) => setVoiceRate(parseFloat(v))}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <Volume2 className="w-3.5 h-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.7">Slow 0.7x</SelectItem>
                  <SelectItem value="0.9">Normal 0.9x</SelectItem>
                  <SelectItem value="1.1">Fast 1.1x</SelectItem>
                </SelectContent>
              </Select>
              {/* Session timer */}
              <span className="hidden sm:inline text-xs text-muted-foreground font-mono tabular-nums px-2 py-1 rounded bg-muted/50 border border-border">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:
                {String(elapsedSeconds % 60).padStart(2, "0")}
              </span>
              {/* Strict proctoring violation counter */}
              <div
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  violationCount === 0
                    ? "border-border text-muted-foreground"
                    : violationCount === 1
                    ? "border-warning/50 bg-warning/10 text-warning"
                    : "border-destructive/50 bg-destructive/10 text-destructive animate-pulse"
                }`}
                title="Proctoring violations — the interview auto-terminates at 3"
              >
                <ShieldAlert className="w-4 h-4" />
                Violations: {violationCount}/{MAX_VIOLATIONS}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEndInterview}
                className="text-destructive hover:text-destructive"
              >
                <X className="w-4 h-4 mr-1" />
                Leave Interview
              </Button>
            </div>
          </div>
        </div>

        {/* Main Interview Area - centered */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-5xl mx-auto px-6 py-8">
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* AI Interviewer Card */}
            <Card className="relative overflow-hidden border-2 border-border bg-card/50 backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
              <div className="relative p-8 flex flex-col items-center justify-center min-h-[320px]">
                <div className={`relative mb-6 ${isAISpeaking ? 'animate-pulse' : ''}`}>
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <div className="w-28 h-28 rounded-full bg-background flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        {isAISpeaking ? (
                          <div className="flex gap-1">
                            <div className="w-1 h-8 bg-primary rounded-full animate-pulse" />
                            <div className="w-1 h-12 bg-primary rounded-full animate-pulse delay-75" />
                            <div className="w-1 h-8 bg-primary rounded-full animate-pulse delay-150" />
                          </div>
                        ) : (
                          <Mic className="w-10 h-10 text-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-1">AI Interviewer</h3>
                <p className="text-sm text-muted-foreground">HiREady AI Assistant</p>
              </div>
            </Card>

            {/* User Card — Webcam Monitor */}
            <Card className="relative overflow-hidden border-2 border-border bg-card/50 backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-primary/5" />
              <div className="relative p-6 flex flex-col items-center justify-center min-h-[320px]">
                <CandidateWebcamMonitor
                  sessionId={sessionIdRef.current}
                  candidateName={getCandidateName()}
                  isRecording={isRecording}
                  onLogsUpdate={(logs) => { proctorLogsRef.current = logs; }}
                />
              </div>
            </Card>
          </div>

          {/* Job Info Banner */}
          <div className="mb-6 p-4 bg-gradient-hero rounded-lg border border-border text-center">
            <p className="text-sm text-muted-foreground">
              What job <span className="font-semibold text-foreground px-2 py-1 bg-background/50 rounded">{experienceLevel}</span> are you targeting?
            </p>
          </div>

          {/* Caption Box */}
          {caption && (
            <Card className="mb-6 p-6 border-2 border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2 animate-pulse" />
                <div className="flex-1">
                  <p className="text-base text-foreground">{caption}</p>
                  {isAISpeaking && (
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                        <span className="text-xs text-muted-foreground">AI is speaking...</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={skipAudio}
                        className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
                      >
                        <SkipForward className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Real-time Transcript Display */}
          {(interimTranscript || userTranscript || transcriptBufferRef.current) && (
            <Card className="mb-6 p-6 border-2 border-accent/20 bg-accent/5">
              <div className="flex items-start gap-3">
                <Mic className="w-5 h-5 text-accent mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground mb-2">Your response:</p>
                  <p className="text-base text-muted-foreground">
                    {isRecording ? (
                      <>
                        {transcriptBufferRef.current}
                        {interimTranscript && (
                          <span className="text-muted-foreground/70"> {interimTranscript}</span>
                        )}
                        <span className="inline-block w-1 h-4 bg-accent ml-1 animate-pulse" />
                      </>
                    ) : (
                      userTranscript
                    )}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Controls */}
          <div className="flex flex-col items-center gap-4">
            <Button
              size="lg"
              onClick={toggleRecording}
              disabled={isAISpeaking || isProcessing}
              className={`w-20 h-20 rounded-full transition-all ${
                isRecording
                  ? "bg-destructive hover:bg-destructive/90 scale-110 shadow-lg shadow-destructive/50"
                  : "bg-gradient-primary hover:opacity-90"
              }`}
            >
              {isRecording ? (
                <MicOff className="w-8 h-8" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </Button>
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEndInterview}
                className="text-destructive hover:text-destructive"
              >
                End Interview
              </Button>
            </div>
            {!isRecording && !isAISpeaking && !isProcessing && (
              <p className="text-sm text-muted-foreground text-center">
                Click the microphone to respond
              </p>
            )}
            {isRecording && (
              <p className="text-sm text-accent font-medium animate-pulse">
                🎤 Recording... (Speak now)
              </p>
            )}
            {isRecording && pauseCountdown !== null && (
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium text-center">
                  ⏸️ Pause detected — still listening. Auto-submitting in {pauseCountdown}s.
                  <br />
                  Just keep talking to continue your answer.
                </p>
                <Button variant="outline" size="sm" onClick={cancelPauseCountdown}>
                  Keep talking
                </Button>
              </div>
            )}
            {isProcessing && (
              <p className="text-sm text-primary font-medium animate-pulse">
                ⏳ Processing your response...
              </p>
            )}
          </div>

          {/* Progress Indicator */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex gap-2">
              {[...Array(Math.min(questionIndex + 1, 10))].map((_, index) => (
                <div
                  key={index}
                  className="h-1 w-12 rounded-full bg-primary transition-all"
                />
              ))}
              {[...Array(Math.max(0, 10 - questionIndex - 1))].map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="h-1 w-12 rounded-full bg-muted transition-all"
                />
              ))}
            </div>
            <p className="text-xs font-medium text-primary">
              {getRoundInfo(questionIndex).label}
            </p>
            <p className="text-xs text-muted-foreground">
              Question {questionIndex + 1} of interview
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Main Voice Interview Page Component
// ============================================================
const VoiceInterview = () => {
  // ── Device guard: interviews are desktop-only ──
  const deviceCheck = detectDevice();
  if (!deviceCheck.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-destructive/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg border-2 border-destructive/40 shadow-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <MonitorSmartphone className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Desktop Required</h1>
          <p className="text-sm font-medium text-destructive uppercase tracking-wide">
            Detected device: {deviceCheck.deviceType}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">{deviceCheck.reason}</p>
          <ul className="text-xs text-muted-foreground text-left list-disc pl-6 space-y-1">
            <li>Fullscreen lock and tab-switch detection</li>
            <li>Live webcam proctoring with face detection</li>
            <li>Copy/paste and right-click blocking</li>
          </ul>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Please switch to a laptop or desktop computer to take the interview.
          </p>
        </Card>
      </div>
    );
  }
  return <VoiceInterviewContent />;
};

export default VoiceInterview;
