import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Mic, MicOff, Clock, Users, Laptop, BookOpen, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// ============================================================
// Guidelines Screen Component - Professional Instruction Page
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
        "Read all instructions carefully before starting the interview",
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
        "Ensure your camera is turned ON and positioned at eye level",
        "Verify microphone is working and audio is clear",
        "Use a well-lit environment with minimal background",
        "Close all unnecessary applications to avoid distractions",
        "Ensure stable WiFi or wired internet connection (minimum 5 Mbps)"
      ]
    },
    {
      title: "Interview Rules",
      icon: AlertCircle,
      items: [
        "Maintain a quiet environment with minimal background noise",
        "Dress professionally as you would for a real interview",
        "Do NOT switch tabs, minimize window, or look away from the screen",
        "Do NOT use any external resources or assistance during the interview",
        "Provide clear, concise, and honest answers to each question",
        "Speak at a normal pace and maintain good posture throughout"
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
              Mock Interview Instructions
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
                <li>• <span className="font-medium">Format:</span> 1-on-1 with AI Interviewer</li>
                <li>• <span className="font-medium">Type:</span> Interactive conversation</li>
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
                <li>• <span className="font-medium">Response:</span> Type or speak your answers</li>
                <li>• <span className="font-medium">Feedback:</span> Instant analysis after completion</li>
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
              ⚠ Please check the agreement box to proceed with the interview
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// Main Interview Page Component
// ============================================================
const Interview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleStartTest = () => {
    // Redirect to Voice Interview page
    navigate("/voice-interview");
  };

  const handleBackHome = () => {
    navigate("/");
  };

  return (
    <DashboardLayout>
      <GuidelinesScreen onStart={handleStartTest} onBack={handleBackHome} />
    </DashboardLayout>
  );
};

export default Interview;
