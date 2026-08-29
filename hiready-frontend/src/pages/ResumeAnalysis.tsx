import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Target, TrendingUp, CheckCircle2, Sparkles, ScanLine, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { extractResumeText, analyzeResumeWithLLM, ScannedResumeError } from "@/lib/resumeAnalyzer";
import { saveResumeAnalysis } from "@/lib/historyApi";

const ResumeAnalysis = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<"upload" | "paste">("upload");
  const [pastedText, setPastedText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanWarning, setScanWarning] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setFile(selectedFile);
      setScanWarning(null);
      toast.success("Resume uploaded successfully!");
    }
  };

  const isAcceptedResumeFile = (f: File) =>
    f.type === "application/pdf" ||
    f.name.toLowerCase().endsWith(".pdf") ||
    f.name.toLowerCase().endsWith(".docx") ||
    f.name.toLowerCase().endsWith(".doc") ||
    f.type === "text/plain" ||
    f.name.toLowerCase().endsWith(".txt");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isAcceptedResumeFile(droppedFile)) {
      if (droppedFile.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setFile(droppedFile);
      setScanWarning(null);
      toast.success("Resume uploaded successfully!");
    } else {
      toast.error("Please upload a PDF, DOCX, or TXT file");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleAnalyze = async () => {
    if (inputMode === "upload" && !file) {
      toast.error("Please upload your resume");
      return;
    }
    if (inputMode === "paste" && pastedText.trim().length < 50) {
      toast.error("Pasted resume must be at least 50 characters");
      return;
    }
    if (!targetRole) {
      toast.error("Please enter your target role");
      return;
    }
    if (!experienceLevel) {
      toast.error("Please select your experience level");
      return;
    }

    setIsAnalyzing(true);
    setScanWarning(null);

    try {
      // Get the resume text — extracted from the file or pasted directly
      const resumeText = inputMode === "paste" ? pastedText : await extractResumeText(file!);

      if (!resumeText.trim()) {
        toast.error("Could not extract text from the file. Please try a different file.");
        setIsAnalyzing(false);
        return;
      }

      // Analyze resume via the backend AI proxy
      const analysisResult = await analyzeResumeWithLLM(
        resumeText,
        targetRole,
        experienceLevel,
        jobDescription.trim() || undefined
      );

      // Store the analysis result in sessionStorage for the report page
      sessionStorage.setItem("resumeAnalysis", JSON.stringify(analysisResult));
      sessionStorage.setItem("resumeSourceText", resumeText);

      // Persist to the user's history (non-blocking — report shows even if save fails)
      saveResumeAnalysis({
        targetRole,
        experienceLevel,
        resultJson: analysisResult,
        sourceText: resumeText.slice(0, 30000),
      }).then((id) => {
        if (id) sessionStorage.setItem("resumeAnalysisId", id);
      });

      toast.success("Resume analyzed successfully!");
      navigate("/resume-report");
    } catch (error) {
      console.error("Error analyzing resume:", error);
      if (error instanceof ScannedResumeError) {
        setScanWarning(error.message);
        toast.error(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to analyze resume. Please try again.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Resume Analysis</h1>
          <p className="text-muted-foreground">
            Get AI-powered insights on your resume's ATS compatibility, strengths, and areas for improvement
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Upload Card */}
          <div className="lg:col-span-2">
            <Card className="border border-border shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle>Upload Your Resume</CardTitle>
                    <CardDescription>Drag & drop or browse to upload</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Input mode tabs */}
                <div className="flex gap-2 p-1 rounded-lg bg-muted/60 w-fit">
                  <button
                    type="button"
                    onClick={() => setInputMode("upload")}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                      inputMode === "upload" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Upload className="w-4 h-4" /> Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("paste")}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                      inputMode === "paste" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ClipboardPaste className="w-4 h-4" /> Paste Text
                  </button>
                </div>

                {/* File Upload Area */}
                {inputMode === "upload" && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Upload className="w-8 h-8 text-primary" />
                    </div>
                    {file ? (
                      <div>
                        <p className="text-sm font-medium text-foreground">{file.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-medium text-foreground mb-1">
                            Upload Your Resume
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Drag & drop your resume here, or click to browse
                          </p>
                        </div>
                        <Input
                          id="file-upload"
                          type="file"
                          accept=".pdf,.doc,.docx,.txt"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <Label htmlFor="file-upload">
                          <Button variant="outline" asChild>
                            <span>Browse Files</span>
                          </Button>
                        </Label>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Supported formats: PDF, DOCX, TXT (Max 10MB)
                  </p>
                </div>
                )}

                {/* Paste text area */}
                {inputMode === "paste" && (
                  <div className="space-y-2">
                    <Label htmlFor="resume-text">Paste your resume content</Label>
                    <textarea
                      id="resume-text"
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder={"Paste the full text of your resume here...\n\nExample:\nJane Doe — jane@email.com | (555) 123-4567\n\nEXPERIENCE\nData Analyst, Acme Corp (2022 - Present)\n- Built dashboards used by 200+ stakeholders..."}
                      rows={12}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y font-mono"
                    />
                    <p className={`text-xs ${pastedText.trim().length >= 50 ? "text-success" : "text-muted-foreground"}`}>
                      {pastedText.trim().length} characters {pastedText.trim().length < 50 && "(minimum 50)"}
                    </p>
                  </div>
                )}

                {/* Scanned / image-only PDF warning */}
                {scanWarning && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/40">
                    <ScanLine className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Text extraction failed</p>
                      <p className="text-xs text-muted-foreground mt-1">{scanWarning}</p>
                    </div>
                  </div>
                )}

                {/* Role and Experience */}
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="targetRole">Target Role *</Label>
                    <Input
                      id="targetRole"
                      placeholder="e.g. Software Engineer, Data Scientist"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="experienceLevel">Experience Level *</Label>
                    <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fresher">Fresher (Campus / No experience)</SelectItem>
                        <SelectItem value="entry">Entry Level (0-2 years)</SelectItem>
                        <SelectItem value="mid">Mid Level (3-5 years)</SelectItem>
                        <SelectItem value="senior">Senior Level (6-10 years)</SelectItem>
                        <SelectItem value="lead">Lead/Principal (10+ years)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Optional JD for exact keyword matching */}
                <div className="space-y-2">
                  <Label htmlFor="jd-match">
                    Job Description <span className="text-muted-foreground text-xs">(optional — enables exact JD matching)</span>
                  </Label>
                  <textarea
                    id="jd-match"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value.slice(0, 3000))}
                    placeholder="Paste the job description to get an exact keyword gap against THIS posting instead of generic role expectations…"
                    rows={4}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                  />
                  <p className="text-xs text-muted-foreground text-right">{jobDescription.length}/3000</p>
                </div>

                {/* Analyze Button */}
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="w-full bg-gradient-primary hover:opacity-90 transition-opacity"
                >
                  {isAnalyzing ? (
                    <>
                      <Sparkles className="mr-2 w-4 h-4 animate-spin" />
                      Analyzing Resume...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 w-4 h-4" />
                      Analyze Resume
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Benefits Sidebar */}
          <div className="space-y-6">
            {/* What You'll Get Card */}
            <Card className="border border-border">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center mb-2">
                  <Target className="w-5 h-5 text-success" />
                </div>
                <CardTitle className="text-lg">What You'll Get</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">ATS compatibility score</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Strength & weakness analysis</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Keyword optimization tips</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Role-specific suggestions</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Interview prep insights</span>
                </div>
              </CardContent>
            </Card>

            {/* Success Rate Card */}
            <Card className="border border-border bg-gradient-hero">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-lg">Boost Your Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Candidates with optimized resumes are <strong className="text-primary">3x more likely</strong> to get interview calls
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ResumeAnalysis;
