import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import HireLayout from "@/components/hire/HireLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, ShieldCheck, ShieldAlert, ShieldX, EyeOff } from "lucide-react";
import { hireAPI, type IntegrityVerdict } from "@/lib/hireApi";

/**
 * Integrity is shown as a verdict on the result, never as proctoring evidence.
 * The recruiter learns whether a score can be trusted without learning why —
 * /hire has no path to ProctorLog at all.
 */
const VERDICT: Record<IntegrityVerdict, { label: string; icon: typeof ShieldCheck; cls: string; help: string }> = {
  clean: {
    label: "Clean", icon: ShieldCheck, cls: "text-success",
    help: "No integrity concerns were recorded during this assessment.",
  },
  flagged: {
    label: "Flagged", icon: ShieldAlert, cls: "text-warning",
    help: "Something was recorded during this assessment. Weigh the score accordingly.",
  },
  invalidated: {
    label: "Invalidated", icon: ShieldX, cls: "text-destructive",
    help: "The assessment was cut short by the anti-cheat. This score does not represent completed work.",
  },
  unknown: {
    label: "Not evaluated", icon: EyeOff, cls: "text-muted-foreground",
    help: "This attempt predates integrity scoring. Absence of a verdict is not a clean verdict.",
  },
};

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

const HireCandidate = () => {
  const { id = "" } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["hire", "candidate", id],
    queryFn: () => hireAPI.getCandidate(id),
    retry: false,
  });

  if (isLoading) {
    return (
      <HireLayout>
        <div className="flex items-center gap-3 text-muted-foreground py-16">
          <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading scorecard…</span>
        </div>
      </HireLayout>
    );
  }

  // A 404 here covers "no such candidate", "never consented", "revoked" and
  // "discoverable only" identically — by design, so the pool cannot be probed.
  if (isError || !data) {
    return (
      <HireLayout>
        <Card className="border border-border max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Not available</CardTitle>
            <CardDescription>
              You do not have access to this candidate. They may not have accepted an invite from
              your company, or they may have revoked it.
            </CardDescription>
          </CardHeader>
        </Card>
      </HireLayout>
    );
  }

  const anonymous = !data.identity;

  return (
    <HireLayout>
      <Link to="/hire" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Pipeline
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          {data.identity ? data.identity.name : "Candidate"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.identity ? data.identity.email : "Your role cannot view candidate identities"}
        </p>
      </div>

      {anonymous && (
        <Card className="border border-border mb-6">
          <CardContent className="py-4 flex items-start gap-3">
            <EyeOff className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              You are signed in as a <strong className="text-foreground">viewer</strong>. Evidence is
              shown; names and email addresses are not. Ask an owner for recruiter access if you need them.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Assessments */}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
        Assessments
      </h2>
      {data.assessments.length === 0 ? (
        <Card className="border border-border mb-8">
          <CardHeader>
            <CardTitle className="text-base">No completed assessments</CardTitle>
            <CardDescription>Results appear here once the candidate finishes one.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4 mb-8">
          {data.assessments.map((a) => {
            const v = VERDICT[a.integrity] ?? VERDICT.unknown;
            const Icon = v.icon;
            const total = a.sections.reduce((s, x) => s + x.score, 0);
            const max = a.sections.reduce((s, x) => s + x.maxScore, 0);
            return (
              <Card key={a.attemptId} className="border border-border">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="text-3xl font-bold text-foreground">
                        {max > 0 ? `${Math.round((total / max) * 100)}%` : "—"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {total}/{max} across {a.sections.length} section
                        {a.sections.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center gap-1.5 font-medium text-sm ${v.cls}`}>
                        <Icon className="w-4 h-4" /> {v.label}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">{v.help}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {a.sections.map((s) => (
                      <div key={s.index}>
                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                          <span className="text-sm font-medium capitalize">{s.type.replace(/-/g, " ")}</span>
                          <span className="text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">{pct(s.percent)}</span>
                            <span className="ml-2">{s.score}/{s.maxScore}</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${s.percent ?? 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Interviews */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Interviews</CardTitle>
            <CardDescription>AI-scored. Recordings are never shared.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.interviews.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No scored interviews.</p>
            ) : (
              <div className="space-y-4">
                {data.interviews.map((iv) => (
                  <div key={iv.sessionId} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{iv.role || "Interview"}</p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round((iv.durationSeconds || 0) / 60)} min · {iv.experienceLevel || "—"}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-foreground shrink-0">
                      {iv.overallScore != null ? `${iv.overallScore}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resume */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Resume</CardTitle>
            <CardDescription>ATS scoring and keyword fit.</CardDescription>
          </CardHeader>
          <CardContent>
            {!data.resume ? (
              <p className="text-sm text-muted-foreground py-4">No resume analysis.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Overall</span>
                  <span className="text-lg font-bold text-foreground">{data.resume.overallScore}%</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">ATS</span>
                  <span className="font-semibold">{data.resume.atsScore}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Keyword match</span>
                  <span className="font-semibold">{data.resume.keywordMatch}</span>
                </div>
                {data.resume.missingKeywords.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground mb-2">Gaps</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.resume.missingKeywords.map((k) => (
                        <Badge key={k} variant="outline" className="font-normal">{k}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HireLayout>
  );
};

export default HireCandidate;
