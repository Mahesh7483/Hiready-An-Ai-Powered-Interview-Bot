import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Mic, MicOff, X, Volume2, AlertCircle, SkipForward, BookOpen, Laptop, Clock, Users } from "lucide-react";
import CandidateWebcamMonitor from "@/components/proctoring/CandidateWebcamMonitor";
import { sendProctorLog, type ProctorEvent } from "@/lib/proctorLogger";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { deepgramService } from "@/lib/deepgram";
import { llmService } from "@/lib/llm";
import { 
  checkBrowserCompatibility, 
  validateApiKeys, 
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
        "Ensure your microphone is working and audio is clear",
        "Allow browser microphone permissions when prompted",
        "Use a well-lit environment with minimal background noise",
        "Close all unnecessary applications to avoid distractions",
        "Ensure stable WiFi or wired internet connection (minimum 5 Mbps)"
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

          {/* Agreement Checkbox */}
          <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-5 mb-8 space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                className="mt-1"
              />
              <label className="text-sm text-foreground cursor-pointer flex-1">
                <span className="font-semibold">I agree to the instructions and understand the rules</span>
                <p className="text-xs text-muted-foreground mt-1">
                  By checking this box, you confirm that you have read and understood all the instructions and agree to follow the interview rules.
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
// Voice Interview Content Component
// ============================================================
const VoiceInterviewContent = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [caption, setCaption] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [jobRole, setJobRole] = useState("Frontend Developer");
  const [experienceLevel, setExperienceLevel] = useState("Mid-Level");
  const [userTranscript, setUserTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [conversationLog, setConversationLog] = useState<Array<{ role: string; text: string }>>([]);
  
  const transcriptBufferRef = useRef("");
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef(`interview_${Date.now()}`);
  const proctorLogsRef = useRef<ProctorEvent[]>([]);

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

  // Enter fullscreen on mount, exit on unmount
  useEffect(() => {
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
  }, []);

  // Helper to log a proctor event locally + send to backend
  const logProctorEvent = (eventName: string) => {
    const event: ProctorEvent = {
      event: eventName,
      timestamp: new Date().toISOString(),
      sessionId: sessionIdRef.current,
    };
    proctorLogsRef.current = [...proctorLogsRef.current, event];
    sendProctorLog(event);
  };

  // Detect tab switch (visibility change)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        toast.warning("Warning: Tab switch detected! This activity has been logged.", {
          duration: 5000,
        });
        logProctorEvent("tab_switch_detected");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Detect fullscreen exit (user pressed Escape or exited fullscreen)
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Only warn if fullscreen was exited while the component is still mounted
      if (!document.fullscreenElement) {
        toast.warning("Warning: Fullscreen mode exited! This activity has been logged.", {
          duration: 5000,
        });
        logProctorEvent("fullscreen_exit_detected");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    // Check browser compatibility and API keys
    const compatibility = checkBrowserCompatibility();
    if (!compatibility.isCompatible) {
      toast.error(`Browser not supported. Missing: ${compatibility.missingFeatures.join(", ")}`);
      return;
    }

    const apiValidation = validateApiKeys();
    if (!apiValidation.isValid) {
      toast.error(`Missing API keys: ${apiValidation.missingKeys.join(", ")}`);
      setCaption("⚠️ API keys not configured. Please check .env file and restart the server.");
      return;
    }

    // Start interview with initial question from LLM
    startInterview();

    return () => {
      // Cleanup on unmount
      if (deepgramService.isRecording()) {
        deepgramService.stopLiveTranscription();
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      // Stop speech synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
   * Text-to-Speech using Web Speech API
   */
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
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
   * Start recording user's audio with Deepgram
   */
  const startRecording = async () => {
    try {
      setIsRecording(true);
      isRecordingRef.current = true;
      setCaption("🎤 Listening to your response...");
      setUserTranscript("");
      setInterimTranscript("");
      transcriptBufferRef.current = "";
      toast.info("Recording started");

      // Start Deepgram live transcription
      await deepgramService.startLiveTranscription(
        (transcript: string, isFinal: boolean) => {
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
          // Utterance end detected - user stopped speaking
          console.log("Utterance ended, stopping recording...");
          if (isRecordingRef.current && transcriptBufferRef.current.trim()) {
            // Only auto-stop if we have captured some text
            stopRecording();
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

    setIsRecording(false);
    isRecordingRef.current = false;
    deepgramService.stopLiveTranscription();
    
    const finalTranscript = transcriptBufferRef.current.trim();
    
    if (finalTranscript) {
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

    toast.success("Interview ended");
    navigate("/interview-report");
  };

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
                  <div className="w-2 h-2 rounded-full bg-success mr-1.5 animate-pulse" />
                  Technical Interview
                </Badge>
              </div>
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
  return (
    <VoiceInterviewContent />
  );
};

export default VoiceInterview;
