import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, MessageSquare, CheckCircle2, AlertTriangle, AlertCircle, Loader2, FileText, ShieldAlert } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from "recharts";
import Groq from "groq-sdk";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface ConversationEntry {
  role: "interviewer" | "user";
  text: string;
  timestamp?: string;
}

interface AnalysisResult {
  role: string;
  confidenceScore: number;
  contentScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  rejectionReasons: string[];
  performanceBreakdown: {
    technicalSkills: number;
    communication: number;
    problemSolving: number;
    confidence: number;
  };
  skillsAssessment: {
    technical: number;
    communication: number;
    leadership: number;
    problemSolving: number;
    adaptability: number;
    teamwork: number;
  };
}

interface ProctorLogEntry {
  event: string;
  timestamp: string;
  sessionId: string;
}

const EVENT_LABELS: Record<string, string> = {
  no_face_detected: "Face not detected",
  multiple_faces_detected: "Multiple faces detected",
  multiple_people_detected: "Another person detected",
  camera_permission_denied: "Camera permission denied",
  tab_switch_detected: "Tab switch detected",
  fullscreen_exit_detected: "Fullscreen mode exited",
};

const InterviewReport = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [proctorLogs, setProctorLogs] = useState<ProctorLogEntry[]>([]);
  const [reportData, setReportData] = useState<AnalysisResult>({
    role: "Front-end Developer",
    confidenceScore: 0,
    contentScore: 0,
    overallScore: 0,
    strengths: [],
    improvements: [],
    rejectionReasons: [],
    performanceBreakdown: {
      technicalSkills: 0,
      communication: 0,
      problemSolving: 0,
      confidence: 0,
    },
    skillsAssessment: {
      technical: 0,
      communication: 0,
      leadership: 0,
      problemSolving: 0,
      adaptability: 0,
      teamwork: 0,
    },
  });

  useEffect(() => {
    loadAndAnalyzeInterview();
  }, []);

  const loadAndAnalyzeInterview = async () => {
    // Load conversation from session storage
    const savedConversation = sessionStorage.getItem("interviewConversation");

    // Load proctor logs from session storage
    const savedProctorLogs = sessionStorage.getItem("proctorLogs");
    if (savedProctorLogs) {
      try {
        setProctorLogs(JSON.parse(savedProctorLogs));
      } catch {
        // ignore malformed data
      }
    }
    
    if (!savedConversation) {
      toast.error("No interview data found. Please complete an interview first.");
      return;
    }

    try {
      const conversationData: ConversationEntry[] = JSON.parse(savedConversation);
      setConversation(conversationData);

      // Analyze the interview using Groq
      await analyzeInterviewWithLLM(conversationData);
    } catch (error) {
      console.error("Error loading interview data:", error);
      toast.error("Failed to load interview data");
    }
  };

  const analyzeInterviewWithLLM = async (conversationData: ConversationEntry[]) => {
    setIsAnalyzing(true);

    try {
      const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
      const groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });

      // Format conversation for analysis
      const transcript = conversationData
        .map((entry) => `${entry.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${entry.text}`)
        .join("\n\n");

      const analysisPrompt = `You are an expert interview analyst. Analyze the following interview transcript and provide a detailed assessment.

INTERVIEW TRANSCRIPT:
${transcript}

Please provide a comprehensive analysis in the following JSON format (respond ONLY with valid JSON, no additional text):
{
  "role": "Identified role/position being interviewed for",
  "confidenceScore": <number 0-100>,
  "contentScore": <number 0-100>,
  "overallScore": <number 0-100>,
  "strengths": [
    "Strength point 1",
    "Strength point 2",
    "Strength point 3"
  ],
  "improvements": [
    "Improvement area 1",
    "Improvement area 2",
    "Improvement area 3"
  ],
  "rejectionReasons": [
    "Potential rejection reason 1",
    "Potential rejection reason 2",
    "Potential rejection reason 3"
  ],
  "performanceBreakdown": {
    "technicalSkills": <number 0-100>,
    "communication": <number 0-100>,
    "problemSolving": <number 0-100>,
    "confidence": <number 0-100>
  },
  "skillsAssessment": {
    "technical": <number 0-100>,
    "communication": <number 0-100>,
    "leadership": <number 0-100>,
    "problemSolving": <number 0-100>,
    "adaptability": <number 0-100>,
    "teamwork": <number 0-100>
  }
}

Guidelines:
- confidenceScore: Communication clarity, confidence, articulation (0-100)
- contentScore: Relevance, depth, technical accuracy of answers (0-100)
- overallScore: Average of confidence and content scores
- strengths: 3-5 specific positive observations
- improvements: 3-5 specific areas needing development
- rejectionReasons: 3-5 potential reasons that could lead to rejection
- performanceBreakdown: Detailed scores for key performance areas
  * technicalSkills: Technical knowledge and expertise demonstrated
  * communication: Clarity, articulation, and expression
  * problemSolving: Analytical thinking and problem-solving approach
  * confidence: Self-assurance and composure during interview
- skillsAssessment: Comprehensive skills evaluation
  * technical: Technical competency and knowledge
  * communication: Verbal and non-verbal communication effectiveness
  * leadership: Leadership potential and initiative
  * problemSolving: Critical thinking and analytical abilities
  * adaptability: Flexibility and adaptiveness to situations
  * teamwork: Collaboration and team-oriented mindset
- Ensure all scores are realistic numbers between 0-100
- Base analysis strictly on the actual transcript content`;

      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const analysisText = response.choices[0]?.message?.content || "";
      
      // Parse JSON response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis: AnalysisResult = JSON.parse(jsonMatch[0]);
        setReportData(analysis);
        toast.success("Interview analysis completed!");
      } else {
        throw new Error("Failed to parse analysis response");
      }
    } catch (error) {
      console.error("Error analyzing interview:", error);
      toast.error("Failed to analyze interview. Using default report.");
      // Keep default mock data
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Chart data - derived from LLM analysis
  const performanceData = [
    { category: 'Technical Skills', score: reportData.performanceBreakdown.technicalSkills },
    { category: 'Communication', score: reportData.performanceBreakdown.communication },
    { category: 'Problem Solving', score: reportData.performanceBreakdown.problemSolving },
    { category: 'Confidence', score: reportData.performanceBreakdown.confidence }
  ];

  const radarData = [
    { skill: 'Technical', A: reportData.skillsAssessment.technical, fullMark: 100 },
    { skill: 'Communication', A: reportData.skillsAssessment.communication, fullMark: 100 },
    { skill: 'Leadership', A: reportData.skillsAssessment.leadership, fullMark: 100 },
    { skill: 'Problem Solving', A: reportData.skillsAssessment.problemSolving, fullMark: 100 },
    { skill: 'Adaptability', A: reportData.skillsAssessment.adaptability, fullMark: 100 },
    { skill: 'Teamwork', A: reportData.skillsAssessment.teamwork, fullMark: 100 }
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="h-8 w-px bg-border" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Interview Feedback Report</h1>
              <p className="text-sm text-muted-foreground mt-1">
                For the role of <span className="text-primary font-medium">{reportData.role}</span>
              </p>
            </div>
          </div>
          <Link to="/interview">
            <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
              <MessageSquare className="mr-2 w-4 h-4" />
              Start a New Interview
            </Button>
          </Link>
        </div>

        {/* Analysis Loading State */}
        {isAnalyzing && (
          <Card className="mb-8 border-2 border-primary/50 bg-primary/5">
            <CardContent className="py-8">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">Analyzing Your Interview...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Our AI is reviewing your responses and generating detailed feedback
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Overall Score */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Overall Performance</CardTitle>
              <CardDescription>Combined assessment score</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted" />
                    <circle
                      cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none"
                      strokeDasharray={`${(reportData.overallScore / 100) * 220} 220`}
                      className="text-success"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{reportData.overallScore}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <Progress value={reportData.overallScore} className="h-2" />
                  <p className="text-sm text-muted-foreground mt-2">Good performance</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Confidence Score */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Confidence & Communication</CardTitle>
              <CardDescription>Measures your articulation, clarity, and vocal confidence.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-muted"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${(reportData.confidenceScore / 100) * 220} 220`}
                      className="text-primary"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{reportData.confidenceScore}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <Progress value={reportData.confidenceScore} className="h-2" />
                  <p className="text-sm text-muted-foreground mt-2">Good confidence level</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content Score */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Content & Relevance</CardTitle>
              <CardDescription>Assesses how well your answers align with the role's requirements.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-muted"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${(reportData.contentScore / 100) * 220} 220`}
                      className="text-accent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{reportData.contentScore}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <Progress value={reportData.contentScore} className="h-2" />
                  <p className="text-sm text-muted-foreground mt-2">Strong content quality</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Visualizations */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Bar Chart - Performance Breakdown */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Performance Breakdown</CardTitle>
              <CardDescription>Detailed scoring across key areas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="score" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Radar Chart - Skills Assessment */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Skills Assessment</CardTitle>
              <CardDescription>Comprehensive evaluation across competencies</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="skill" stroke="hsl(var(--muted-foreground))" />
                  <PolarRadiusAxis stroke="hsl(var(--muted-foreground))" />
                  <Radar name="Your Score" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.5} />
                  <Legend />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Strengths */}
        <Card className="mb-6 border-l-4 border-l-success border border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <CardTitle className="text-success">Key Strengths</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {reportData.strengths.map((strength, index) => (
                <li key={index} className="flex items-start gap-3 p-3 rounded-lg bg-success/5">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">{strength}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Areas for Improvement */}
        <Card className="mb-6 border-l-4 border-l-warning border border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <CardTitle className="text-warning">Areas for Improvement</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {reportData.improvements.map((improvement, index) => (
                <li key={index} className="flex items-start gap-3 p-3 rounded-lg bg-warning/5">
                  <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">{improvement}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Potential Rejection Reasons */}
        <Card className="border-l-4 border-l-destructive border border-border mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <CardTitle className="text-destructive">Potential Rejection Reasons</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {reportData.rejectionReasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">{reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Interview Transcript */}
        {conversation.length > 0 && (
          <Card className="border-l-4 border-l-primary border border-border mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <CardTitle className="text-primary">Interview Transcript</CardTitle>
              </div>
              <CardDescription>
                Complete record of your interview conversation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="transcript" className="border-none">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <span className="text-sm font-medium">
                      View Full Transcript ({conversation.length} exchanges)
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 mt-2 max-h-96 overflow-y-auto pr-2">
                      {conversation.map((entry, index) => (
                        <div
                          key={index}
                          className={`p-4 rounded-lg ${
                            entry.role === "interviewer"
                              ? "bg-blue-50 dark:bg-blue-950/30 border-l-4 border-l-blue-500"
                              : "bg-green-50 dark:bg-green-950/30 border-l-4 border-l-green-500"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`text-xs font-bold uppercase tracking-wide ${
                                entry.role === "interviewer"
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-green-600 dark:text-green-400"
                              }`}
                            >
                              {entry.role === "interviewer" ? "🤖 AI Interviewer" : "👤 You"}
                            </span>
                            {entry.timestamp && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">
                            {entry.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Proctoring Activity Log */}
        {proctorLogs.length > 0 && (
          <Card className="border-l-4 border-l-yellow-500 border border-border mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                <CardTitle className="text-yellow-600 dark:text-yellow-400">Proctoring Activity Log</CardTitle>
              </div>
              <CardDescription>
                Suspicious events detected during the interview ({proctorLogs.length} events)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="proctor-logs" className="border-none">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <span className="text-sm font-medium">
                      View Proctoring Log ({proctorLogs.length} events)
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 mt-2 max-h-72 overflow-y-auto pr-2">
                      {proctorLogs.map((log, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/40"
                        >
                          <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {EVENT_LABELS[log.event] || log.event.replace(/_/g, " ")}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Next Steps */}
        <div className="mt-8 p-6 bg-gradient-hero rounded-lg border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Recommended Next Steps</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <Link to="/resume-analysis" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Optimize Your Resume</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Improve your resume's ATS compatibility and get more interview calls
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/interview" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Practice More</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Take another mock interview to improve your skills
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-sm">Review Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Access our library of interview tips and best practices
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default InterviewReport;
