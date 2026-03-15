import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, FileText, CheckCircle2, AlertTriangle, AlertCircle, TrendingUp, Loader2, User, Briefcase, GraduationCap, Code } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";
import type { ResumeAnalysisResult } from "@/lib/resumeAnalyzer";

const ResumeReport = () => {
  const navigate = useNavigate();
  const [reportData, setReportData] = useState<ResumeAnalysisResult | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("resumeAnalysis");
    if (!saved) {
      toast.error("No resume analysis found. Please upload and analyze a resume first.");
      navigate("/resume-analysis");
      return;
    }
    try {
      setReportData(JSON.parse(saved));
    } catch {
      toast.error("Failed to load analysis data.");
      navigate("/resume-analysis");
    }
  }, [navigate]);

  if (!reportData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  // Chart data
  const scoreData = [
    { name: 'ATS Score', score: reportData.atsScore },
    { name: 'Keywords', score: reportData.keywordMatch },
    { name: 'Format', score: reportData.formatScore }
  ];

  const skillsDistribution = [
    { name: 'Technical', value: reportData.skillsDistribution.technical },
    { name: 'Soft Skills', value: reportData.skillsDistribution.softSkills },
    { name: 'Tools', value: reportData.skillsDistribution.tools },
    { name: 'Languages', value: reportData.skillsDistribution.languages }
  ];

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--success))', 'hsl(var(--warning))'];

  const getScoreLabel = (score: number) => {
    if (score >= 85) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Needs Improvement";
    return "Poor";
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-success";
    if (score >= 70) return "text-primary";
    if (score >= 50) return "text-warning";
    return "text-destructive";
  };

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
              <h1 className="text-3xl font-bold text-foreground">Resume Analysis Report</h1>
              <p className="text-sm text-muted-foreground mt-1">
                For <span className="text-primary font-medium">{reportData.targetRole}</span> position
              </p>
            </div>
          </div>
          <Link to="/resume-analysis">
            <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
              <FileText className="mr-2 w-4 h-4" />
              Upload New Resume
            </Button>
          </Link>
        </div>

        {/* Candidate Info */}
        <Card className="mb-8 border border-border shadow-md">
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Candidate</p>
                  <p className="text-sm font-medium">{reportData.candidateName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target Role</p>
                  <p className="text-sm font-medium">{reportData.targetRole}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Experience</p>
                  <p className="text-sm font-medium capitalize">{reportData.experienceLevel}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overall Score</p>
                  <p className={`text-sm font-bold ${getScoreColor(reportData.overallScore)}`}>{reportData.overallScore}%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Experience Summary */}
        <Card className="mb-8 border border-border shadow-md">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{reportData.experienceSummary}</p>
          </CardContent>
        </Card>

        {/* Score Overview */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* ATS Score */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">ATS Compatibility</CardTitle>
              <CardDescription>How well your resume passes ATS systems</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted" />
                    <circle
                      cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none"
                      strokeDasharray={`${(reportData.atsScore / 100) * 220} 220`}
                      className="text-success"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{reportData.atsScore}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <Progress value={reportData.atsScore} className="h-2" />
                  <p className={`text-sm mt-2 ${getScoreColor(reportData.atsScore)}`}>{getScoreLabel(reportData.atsScore)} compatibility</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Keyword Match */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Keyword Match</CardTitle>
              <CardDescription>Relevance to target role requirements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted" />
                    <circle
                      cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none"
                      strokeDasharray={`${(reportData.keywordMatch / 100) * 220} 220`}
                      className="text-warning"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{reportData.keywordMatch}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <Progress value={reportData.keywordMatch} className="h-2" />
                  <p className={`text-sm mt-2 ${getScoreColor(reportData.keywordMatch)}`}>{getScoreLabel(reportData.keywordMatch)} match</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Format Score */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Format Quality</CardTitle>
              <CardDescription>Structure and readability assessment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted" />
                    <circle
                      cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="8" fill="none"
                      strokeDasharray={`${(reportData.formatScore / 100) * 220} 220`}
                      className="text-primary"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{reportData.formatScore}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <Progress value={reportData.formatScore} className="h-2" />
                  <p className={`text-sm mt-2 ${getScoreColor(reportData.formatScore)}`}>{getScoreLabel(reportData.formatScore)} format</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Extracted Skills */}
        {reportData.extractedSkills.length > 0 && (
          <Card className="mb-8 border border-border shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Extracted Skills</CardTitle>
              </div>
              <CardDescription>Skills identified from your resume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {reportData.extractedSkills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Education */}
        {reportData.education.length > 0 && (
          <Card className="mb-8 border border-border shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-accent" />
                <CardTitle className="text-lg">Education & Certifications</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {reportData.education.map((edu, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                    {edu}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Data Visualizations */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Bar Chart - Score Breakdown */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Score Breakdown</CardTitle>
              <CardDescription>Detailed analysis of resume components</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={scoreData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
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

          {/* Pie Chart - Skills Distribution */}
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Skills Distribution</CardTitle>
              <CardDescription>Breakdown of skill categories in your resume</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={skillsDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="hsl(var(--primary))"
                    dataKey="value"
                  >
                    {skillsDistribution.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
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

        {/* Critical Issues */}
        <Card className="border-l-4 border-l-destructive border border-border mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <CardTitle className="text-destructive">Critical Issues to Fix</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {reportData.criticalIssues.map((issue, index) => (
                <li key={index} className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">{issue}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Next Steps */}
        <div className="p-6 bg-gradient-hero rounded-lg border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Recommended Next Steps</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <Link to="/resume-analysis" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Update & Re-analyze</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Make improvements and upload your updated resume
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/interview" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Practice Interview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Prepare for interviews with our AI interviewer
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-sm">
                  <TrendingUp className="w-4 h-4 inline mr-1" />
                  Success Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Learn best practices for resume optimization
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ResumeReport;
