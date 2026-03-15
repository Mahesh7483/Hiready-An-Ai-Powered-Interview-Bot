import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Target, TrendingUp, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { extractResumeText, analyzeResumeWithLLM } from "@/lib/resumeAnalyzer";

const ResumeAnalysis = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setFile(selectedFile);
      toast.success("Resume uploaded successfully!");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === "application/pdf" || droppedFile.name.endsWith(".docx"))) {
      if (droppedFile.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setFile(droppedFile);
      toast.success("Resume uploaded successfully!");
    } else {
      toast.error("Please upload a PDF or DOCX file");
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
    if (!file) {
      toast.error("Please upload your resume");
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

    try {
      // Extract text from the uploaded file
      const resumeText = await extractResumeText(file);

      if (!resumeText.trim()) {
        toast.error("Could not extract text from the file. Please try a different file.");
        setIsAnalyzing(false);
        return;
      }

      // Analyze resume using Groq LLM
      const analysisResult = await analyzeResumeWithLLM(resumeText, targetRole, experienceLevel);

      // Store the analysis result in sessionStorage for the report page
      sessionStorage.setItem("resumeAnalysis", JSON.stringify(analysisResult));

      toast.success("Resume analyzed successfully!");
      navigate("/resume-report");
    } catch (error) {
      console.error("Error analyzing resume:", error);
      toast.error("Failed to analyze resume. Please try again.");
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
                {/* File Upload Area */}
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
                          accept=".pdf,.doc,.docx"
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
                    Supported formats: PDF, DOC, DOCX (Max 10MB)
                  </p>
                </div>

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
                        <SelectItem value="entry">Entry Level (0-2 years)</SelectItem>
                        <SelectItem value="mid">Mid Level (3-5 years)</SelectItem>
                        <SelectItem value="senior">Senior Level (6-10 years)</SelectItem>
                        <SelectItem value="lead">Lead/Principal (10+ years)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
