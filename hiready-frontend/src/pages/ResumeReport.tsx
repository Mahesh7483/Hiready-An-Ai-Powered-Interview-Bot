import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { toast } from "sonner";
import {
  ArrowLeft, FileText, CheckCircle2, AlertTriangle, AlertCircle, TrendingUp, Loader2,
  User, Briefcase, GraduationCap, Code, Mail, Phone, Linkedin, Github, Globe,
  ListChecks, PenLine, Quote, Sparkles, Clock, XCircle, Award,
  ClipboardCopy, Download, ScanSearch, Type, Layers, Percent, Building2,
  Wand2, GraduationCap as CapIcon, Printer,
} from "lucide-react";
import type {
  ResumeAnalysisResult,
  ContactInfo,
  ExperienceEntry,
  SectionAudit,
} from "@/lib/resumeAnalyzer";
import {
  generateCoverLetter, generateImprovedResume, fetchSkillRecommendations,
  type SkillRecommendation,
} from "@/lib/resumeAnalyzer";
import { fetchResumeAnalysis } from "@/lib/historyApi";

const EMPTY_REPORT: ResumeAnalysisResult = {
  candidateName: "Unknown",
  targetRole: "",
  experienceLevel: "",
  extractedSkills: [],
  education: [],
  experienceSummary: "",
  atsScore: 0,
  keywordMatch: 0,
  formatScore: 0,
  overallScore: 0,
  strengths: [],
  improvements: [],
  criticalIssues: [],
  skillsDistribution: { technical: 0, softSkills: 0, tools: 0, languages: 0 },
};

const ContactChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}> = ({ icon, label, value, href }) => (
  <a
    href={href}
    target={href?.startsWith("http") ? "_blank" : undefined}
    rel="noreferrer"
    onClick={!href ? (e) => e.preventDefault() : undefined}
    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors group"
  >
    <span className="text-primary">{icon}</span>
    <span className="min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="block text-sm font-medium text-foreground truncate max-w-[180px]">{value}</span>
    </span>
  </a>
);

const buildContactChips = (contact?: ContactInfo) => {
  if (!contact) return [];
  const chips: Array<{ key: string; icon: React.ReactNode; label: string; value: string; href?: string }> = [];
  const withScheme = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

  if (contact.email)
    chips.push({ key: "email", icon: <Mail className="w-4 h-4" />, label: "Email", value: contact.email, href: `mailto:${contact.email}` });
  if (contact.phone)
    chips.push({ key: "phone", icon: <Phone className="w-4 h-4" />, label: "Phone", value: contact.phone, href: `tel:${contact.phone.replace(/[^\d+]/g, "")}` });
  if (contact.linkedin)
    chips.push({ key: "linkedin", icon: <Linkedin className="w-4 h-4" />, label: "LinkedIn", value: contact.linkedin, href: withScheme(contact.linkedin) });
  if (contact.github)
    chips.push({ key: "github", icon: <Github className="w-4 h-4" />, label: "GitHub", value: contact.github, href: withScheme(contact.github) });
  if (contact.portfolio)
    chips.push({ key: "portfolio", icon: <Globe className="w-4 h-4" />, label: "Portfolio", value: contact.portfolio, href: withScheme(contact.portfolio) });
  return chips;
};

const ScoreBar: React.FC<{ score: number }> = ({ score }) => (
  <div className="flex items-center gap-2 min-w-[110px]">
    <Progress value={Math.max(0, Math.min(100, score))} className="h-1.5 flex-1" />
    <span className="text-xs font-medium text-muted-foreground w-8 text-right">{Math.round(score)}</span>
  </div>
);

/** Big radial gauge for the overall score hero */
const HeroGauge: React.FC<{ score: number }> = ({ score }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 54;
  return (
    <div className="relative w-32 h-32 shrink-0">
      <svg className="w-32 h-32 -rotate-90">
        <circle cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="10" fill="none" className="text-muted" />
        <circle
          cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="10" fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          className={clamped >= 70 ? "text-success" : clamped >= 50 ? "text-warning" : "text-destructive"}
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{Math.round(clamped)}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
};

const ReadoutStat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({ icon, label, value, sub }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border min-w-[150px] flex-1">
    <span className="text-primary">{icon}</span>
    <span className="min-w-0">
      <span className="block text-sm font-bold text-foreground leading-tight">{value}</span>
      <span className="block text-[11px] text-muted-foreground truncate">{label}{sub ? ` · ${sub}` : ""}</span>
    </span>
  </div>
);

const copyText = async (text: string, label = "Copied to clipboard") => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Could not copy — select the text manually");
  }
};

const buildReportMarkdown = (r: ResumeAnalysisResult): string => {
  const lines: string[] = [];
  lines.push(`# Resume Analysis Report`);
  lines.push(`**Candidate:** ${r.candidateName} · **Target Role:** ${r.targetRole} · **Level:** ${r.experienceLevel}`);
  if (r.verdict) lines.push(`\n> ${r.verdict}`);
  lines.push(`\n## Scores\n| Metric | Score |\n|---|---|\n| Overall | ${r.overallScore}/100 |\n| ATS Compatibility | ${r.atsScore}/100 |\n| Keyword Match | ${r.keywordMatch}/100 |\n| Format Quality | ${r.formatScore}/100 |`);
  if (r.bulletAnalysis) {
    lines.push(`\n## Bullet Quality\n- Total bullets: ${r.bulletAnalysis.totalBullets}\n- Quantified: ${r.bulletAnalysis.quantifiedBullets}\n- Action verb score: ${r.bulletAnalysis.actionVerbScore ?? "n/a"}/100`);
    if (r.bulletAnalysis.weakPhrases?.length) lines.push(`- Weak phrases: ${r.bulletAnalysis.weakPhrases.map((p) => `"${p}"`).join(", ")}`);
  }
  if (r.missingKeywords?.length) lines.push(`\n## Missing Keywords\n${r.missingKeywords.map((k) => `- ${k}`).join("\n")}`);
  if (r.sections?.length) {
    lines.push(`\n## Section Audit\n| Section | Status | Words | Score |\n|---|---|---|---|`);
    for (const s of r.sections) lines.push(`| ${s.name} | ${s.present ? "Present" : "Missing"} | ${s.wordCount} | ${s.score}/100 |`);
  }
  if (r.suggestedBullets?.length) {
    lines.push(`\n## Suggested Rewrites`);
    for (const s of r.suggestedBullets) lines.push(`- ~~${s.original}~~\n  → **${s.rewritten}**\n  _(${s.reason})_`);
  }
  lines.push(`\n## Strengths\n${r.strengths.map((s) => `- ${s}`).join("\n")}`);
  lines.push(`\n## Improvements\n${r.improvements.map((s) => `- ${s}`).join("\n")}`);
  if (r.criticalIssues.length) lines.push(`\n## Critical Issues\n${r.criticalIssues.map((s) => `- ${s}`).join("\n")}`);
  lines.push(`\n---\nGenerated by Hiready AI Resume Analyzer`);
  return lines.join("\n");
};

const ResumeReport = () => {
  const navigate = useNavigate();
  const [reportData, setReportData] = useState<ResumeAnalysisResult | null>(null);

  // ── AI tools state (declared before any early return) ──
  const sourceText = sessionStorage.getItem("resumeSourceText") || "";
  const [coverLetter, setCoverLetter] = useState("");
  const [improvedResume, setImprovedResume] = useState("");
  const [recommendations, setRecommendations] = useState<SkillRecommendation[]>([]);
  const [toolBusy, setToolBusy] = useState<"letter" | "resume" | "skills" | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("resumeAnalysis");
    if (!saved) {
      toast.error("No resume analysis found. Please upload and analyze a resume first.");
      navigate("/resume-analysis");
      return;
    }
    try {
      // Merge with defaults so older saved analyses without the new fields still render
      setReportData({ ...EMPTY_REPORT, ...JSON.parse(saved) });
    } catch {
      toast.error("Failed to load analysis data.");
      navigate("/resume-analysis");
      return;
    }
    // Hydrate source text for AI tools from the saved analysis when missing
    if (!sessionStorage.getItem("resumeSourceText")) {
      const id = sessionStorage.getItem("resumeAnalysisId");
      if (id) {
        fetchResumeAnalysis(id)
          .then((full) => {
            if (full.sourceText) sessionStorage.setItem("resumeSourceText", full.sourceText);
          })
          .catch(() => {});
      }
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

  const contactInfo = reportData.contactInfo;
  const experience: ExperienceEntry[] = reportData.experience ?? [];
  const sections: SectionAudit[] = reportData.sections ?? [];
  const bulletAnalysis = reportData.bulletAnalysis;
  const suggestedBullets = reportData.suggestedBullets ?? [];
  const certifications = reportData.certifications ?? [];
  const contactChips = buildContactChips(contactInfo);
  const hasNewSections =
    sections.length > 0 || experience.length > 0 || !!bulletAnalysis || suggestedBullets.length > 0;

  // ── Derived readouts ──
  const sectionsPresent = sections.filter((s) => s.present).length;
  const quantifiedPct =
    bulletAnalysis && bulletAnalysis.totalBullets > 0
      ? Math.round((bulletAnalysis.quantifiedBullets / bulletAnalysis.totalBullets) * 100)
      : null;
  const sectionsAvg = sections.length
    ? Math.round(sections.reduce((acc, s) => acc + s.score, 0) / sections.length)
    : null;
  const actionVerbScore = bulletAnalysis?.actionVerbScore ?? null;

  const radarData = [
    { dimension: "ATS", value: reportData.atsScore },
    { dimension: "Keywords", value: reportData.keywordMatch },
    { dimension: "Format", value: reportData.formatScore },
    ...(actionVerbScore !== null ? [{ dimension: "Action Verbs", value: actionVerbScore }] : []),
    ...(sectionsAvg !== null ? [{ dimension: "Sections", value: sectionsAvg }] : []),
  ];

  const handleDownloadReport = () => {
    const md = buildReportMarkdown(reportData);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-analysis-${(reportData.candidateName || "candidate").toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  // ── AI tools ──
  const hasTools = sourceText.trim().length >= 50;

  const runTool = async (tool: "letter" | "resume" | "skills") => {
    setToolBusy(tool);
    try {
      if (tool === "letter") {
        setCoverLetter(await generateCoverLetter({
          resumeText: sourceText,
          targetRole: reportData.targetRole,
        }));
        toast.success("Cover letter ready");
      } else if (tool === "resume") {
        setImprovedResume(await generateImprovedResume({
          resumeText: sourceText,
          targetRole: reportData.targetRole,
          missingKeywords: reportData.missingKeywords ?? [],
        }));
        toast.success("Improved resume ready");
      } else {
        setRecommendations(await fetchSkillRecommendations(
          reportData.missingKeywords ?? [],
          reportData.targetRole
        ));
        toast.success("Recommendations ready");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI tool failed");
    } finally {
      setToolBusy(null);
    }
  };

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <div className="flex items-center gap-2 print-hide">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 w-4 h-4" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadReport}>
              <Download className="mr-2 w-4 h-4" />
              Export Report
            </Button>
            <Link to="/resume-analysis">
              <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
                <FileText className="mr-2 w-4 h-4" />
                Upload New Resume
              </Button>
            </Link>
          </div>
        </div>

        {/* Hero — overall score + verdict */}
        <Card className="mb-8 border border-border shadow-md overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center gap-6 p-6 bg-gradient-hero">
            <HeroGauge score={reportData.overallScore} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${reportData.overallScore >= 85 ? "bg-success/15 text-success" : reportData.overallScore >= 70 ? "bg-primary/15 text-primary" : reportData.overallScore >= 50 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}`}>
                  {getScoreLabel(reportData.overallScore).toUpperCase()}
                </span>
                <span className="text-xs text-muted-foreground">Overall Resume Score</span>
              </div>
              <p className="text-sm text-foreground font-medium leading-relaxed">
                {reportData.verdict || reportData.experienceSummary}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 text-xs text-muted-foreground">
                <span>ATS: <strong className={getScoreColor(reportData.atsScore)}>{reportData.atsScore}</strong>/100</span>
                <span>Keywords: <strong className={getScoreColor(reportData.keywordMatch)}>{reportData.keywordMatch}</strong>/100</span>
                <span>Format: <strong className={getScoreColor(reportData.formatScore)}>{reportData.formatScore}</strong>/100</span>
              </div>
            </div>
          </div>

          {/* Readout strip */}
          <CardContent className="pt-5 pb-5 border-t border-border">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <ScanSearch className="w-3.5 h-3.5" /> Readouts from your resume
            </p>
            <div className="flex flex-wrap gap-2">
              {typeof reportData.wordCount === "number" && (
                <ReadoutStat icon={<Type className="w-4 h-4" />} label="Words" value={String(reportData.wordCount)} />
              )}
              {bulletAnalysis && typeof bulletAnalysis.totalBullets === "number" && (
                <ReadoutStat icon={<ListChecks className="w-4 h-4" />} label="Bullet points" value={String(bulletAnalysis.totalBullets)} />
              )}
              {quantifiedPct !== null && (
                <ReadoutStat icon={<Percent className="w-4 h-4" />} label="Quantified bullets" value={`${quantifiedPct}%`} />
              )}
              {sections.length > 0 && (
                <ReadoutStat icon={<Layers className="w-4 h-4" />} label={`Sections present (${sectionsPresent}/${sections.length})`} value={`${sectionsPresent}/${sections.length}`} />
              )}
              <ReadoutStat icon={<Code className="w-4 h-4" />} label="Skills detected" value={String(reportData.extractedSkills.length)} />
              {experience.length > 0 && (
                <ReadoutStat icon={<Building2 className="w-4 h-4" />} label="Work entries" value={String(experience.length)} />
              )}
              {certifications.length > 0 && (
                <ReadoutStat icon={<Award className="w-4 h-4" />} label="Certifications" value={String(certifications.length)} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Candidate Info + Contact */}
        <Card className="mb-8 border border-border shadow-md">
          <CardContent className="pt-6 space-y-5">
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

            {/* Contact details */}
            {contactChips.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-1">
                {contactChips.map((chip) => (
                  <ContactChip
                    key={chip.key}
                    icon={chip.icon}
                    label={chip.label}
                    value={chip.value}
                    href={chip.href}
                  />
                ))}
              </div>
            )}
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

        {/* ── NEW: Section Audit ─────────────────────────────── */}
        {sections.length > 0 && (
          <Card className="mb-8 border border-border shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Resume Sections Audit</CardTitle>
              </div>
              <CardDescription>Presence and quality of each standard resume section</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sections.map((section, index) => (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="sm:w-48 flex items-center gap-2 shrink-0">
                      {section.present ? (
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      <span className="text-sm font-medium text-foreground">{section.name}</span>
                    </div>
                    <div className="sm:w-24 shrink-0">
                      {section.present ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                          Present · {section.wordCount} words
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                          Missing
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <ScoreBar score={section.present ? section.score : 0} />
                    </div>
                    {section.feedback && (
                      <p className="text-xs text-muted-foreground sm:max-w-[280px]">{section.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── NEW: Experience Timeline ───────────────────────── */}
        {experience.length > 0 && (
          <Card className="mb-8 border border-border shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                <CardTitle className="text-lg">Work Experience Timeline</CardTitle>
              </div>
              <CardDescription>{experience.length} role{experience.length === 1 ? "" : "s"} extracted from your resume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-6 pl-6">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" aria-hidden />
                {experience.map((entry, index) => (
                  <div key={index} className="relative">
                    <div className="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-primary bg-background" />
                    <div className="p-4 rounded-lg bg-muted/30 border border-border">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{entry.title || "Unknown title"}</p>
                          <p className="text-sm text-muted-foreground">{entry.company || "Unknown company"}</p>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {entry.startDate || "?"} – {entry.endDate || "?"}
                          </p>
                          {entry.duration && entry.duration !== "Unknown" && (
                            <p className="text-xs font-medium text-primary mt-0.5">{entry.duration}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* Education & Certifications */}
        {(reportData.education.length > 0 || certifications.length > 0) && (
          <Card className="mb-8 border border-border shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-accent" />
                <CardTitle className="text-lg">Education & Certifications</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {reportData.education.length > 0 && (
                <ul className="space-y-2">
                  {reportData.education.map((edu, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                      {edu}
                    </li>
                  ))}
                </ul>
              )}
              {certifications.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {certifications.map((cert, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium"
                    >
                      <Award className="w-3 h-3" />
                      {cert}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── NEW: Bullet Quality Panel ──────────────────────── */}
        {bulletAnalysis && typeof bulletAnalysis.totalBullets === "number" && bulletAnalysis.totalBullets > 0 && (
          <Card className="mb-8 border border-border shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <PenLine className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Bullet Point Quality</CardTitle>
              </div>
              <CardDescription>How strong and quantified your achievement statements are</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground">Total Bullets Found</p>
                  <p className="text-2xl font-bold text-foreground">{bulletAnalysis.totalBullets}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground">Quantified Achievements</p>
                  <p className="text-2xl font-bold text-foreground">
                    {bulletAnalysis.quantifiedBullets}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}of {bulletAnalysis.totalBullets}
                    </span>
                  </p>
                  <Progress
                    value={(bulletAnalysis.quantifiedBullets / Math.max(bulletAnalysis.totalBullets, 1)) * 100}
                    className="h-1.5 mt-2"
                  />
                </div>
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground">Action Verb Score</p>
                  <p className={`text-2xl font-bold ${getScoreColor(bulletAnalysis.actionVerbScore ?? 0)}`}>
                    {bulletAnalysis.actionVerbScore ?? 0}/100
                  </p>
                  <Progress value={Math.max(0, Math.min(100, bulletAnalysis.actionVerbScore ?? 0))} className="h-1.5 mt-2" />
                </div>
              </div>

              {(bulletAnalysis.weakPhrases?.length ?? 0) > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Weak phrases detected:</p>
                  <div className="flex flex-wrap gap-2">
                    {bulletAnalysis!.weakPhrases.map((phrase, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium"
                      >
                        "{phrase}"
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Missing Keywords for target role */}
        {(reportData.missingKeywords?.length ?? 0) > 0 && (
          <Card className="mb-8 border-l-4 border-l-destructive border border-border">
            <CardHeader>
              <div className="flex items-center justify-between w-full flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <CardTitle className="text-lg">Missing Keywords for {reportData.targetRole}</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(reportData.missingKeywords!.join(", "), "All keywords copied")}
                >
                  <ClipboardCopy className="mr-2 w-4 h-4" /> Copy All
                </Button>
              </div>
              <CardDescription>Terms recruiters/ATS expect for this role that are absent from your resume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {reportData.missingKeywords!.map((kw, index) => (
                  <button
                    key={index}
                    onClick={() => copyText(kw, `"${kw}" copied`)}
                    title="Click to copy"
                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
                  >
                    {kw}
                    <ClipboardCopy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Suggested Bullet Rewrites ─────────────────── */}
        {suggestedBullets.length > 0 && (
          <Card className="mb-8 border border-border shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between w-full flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">AI-Suggested Rewrites</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    copyText(
                      suggestedBullets.map((s, i) => `${i + 1}. ${s.rewritten}`).join("\n"),
                      "All rewrites copied"
                    )
                  }
                >
                  <ClipboardCopy className="mr-2 w-4 h-4" /> Copy All
                </Button>
              </div>
              <CardDescription>Your weakest bullet points, rewritten for impact</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {suggestedBullets.map((suggestion, index) => (
                <div key={index} className="rounded-lg border border-border overflow-hidden">
                  <div className="p-4 bg-muted/30 border-b border-border">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Quote className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Before</span>
                      </div>
                      <span />
                    </div>
                    <p className="text-sm text-muted-foreground line-through decoration-destructive/50">
                      {suggestion.original}
                    </p>
                  </div>
                  <div className="p-4 bg-success/5">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <PenLine className="w-3.5 h-3.5 text-success shrink-0" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-success">After</span>
                      </div>
                      <button
                        onClick={() => copyText(suggestion.rewritten, "Rewrite copied")}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                        title="Copy rewritten bullet"
                      >
                        <ClipboardCopy className="w-3.5 h-3.5" /> Copy
                      </button>
                    </div>
                    <p className="text-sm text-foreground font-medium">{suggestion.rewritten}</p>
                    {suggestion.reason && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
                        <Sparkles className="w-3 h-3 mt-0.5 text-primary shrink-0" />
                        {suggestion.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!hasNewSections && (
          <Card className="mb-8 p-4 border-dashed border border-border">
            <p className="text-xs text-muted-foreground text-center">
              Tip: Re-upload this resume to get the deep analysis — section audits, experience timeline,
              bullet quality, and AI-suggested rewrites.
            </p>
          </Card>
        )}

        {/* Data Visualizations */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Radar - Resume Dimensions */}
          {radarData.length >= 3 && (
          <Card className="border border-border shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Resume Dimensions</CardTitle>
              <CardDescription>Multi-axis view of your resume health</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
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
          )}

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

        {/* ── AI Tools: cover letter, improved resume, skill plan ── */}
        <Card className="mb-8 border border-border shadow-md print-hide">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">AI Tools</CardTitle>
            </div>
            <CardDescription>
              {hasTools
                ? "Generate a tailored cover letter, a rewritten resume, or a learning plan for your keyword gaps"
                : "Re-run the analysis (upload or paste) to unlock AI tools on this report"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-3">
              <Button variant="outline" disabled={!hasTools || toolBusy !== null} onClick={() => runTool("letter")}>
                {toolBusy === "letter" ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Mail className="mr-2 w-4 h-4" />}
                Cover Letter
              </Button>
              <Button variant="outline" disabled={!hasTools || toolBusy !== null} onClick={() => runTool("resume")}>
                {toolBusy === "resume" ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <FileText className="mr-2 w-4 h-4" />}
                Improved Resume
              </Button>
              <Button
                variant="outline"
                disabled={!hasTools || toolBusy !== null || (reportData.missingKeywords?.length ?? 0) === 0}
                onClick={() => runTool("skills")}
              >
                {toolBusy === "skills" ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <CapIcon className="mr-2 w-4 h-4" />}
                Learning Plan
              </Button>
            </div>

            {coverLetter && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border">
                  <span className="text-sm font-semibold">Tailored Cover Letter</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => copyText(coverLetter, "Cover letter copied")}>
                      <ClipboardCopy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadText(coverLetter, "cover-letter.txt")}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <pre className="p-4 text-sm whitespace-pre-wrap font-sans text-foreground">{coverLetter}</pre>
              </div>
            )}

            {improvedResume && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border">
                  <span className="text-sm font-semibold">Improved Resume</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => copyText(improvedResume, "Resume copied")}>
                      <ClipboardCopy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadText(improvedResume, `improved-resume-${reportData.targetRole.toLowerCase().replace(/\s+/g, "-")}.txt`)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <pre className="p-4 text-xs whitespace-pre-wrap font-mono text-foreground max-h-96 overflow-y-auto">{improvedResume}</pre>
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-accent" /> Learning Plan for Missing Keywords
                </p>
                {recommendations.map((rec, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border text-sm">
                    <span className="font-semibold text-primary">{rec.skill}:</span>{" "}
                    <span className="text-muted-foreground">{rec.recommendation}</span>
                  </div>
                ))}
              </div>
            )}
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
