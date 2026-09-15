import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, CheckCircle2, Clock, Loader2, Lightbulb, TrendingUp, XCircle,
} from "lucide-react";

export interface SubmissionTestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  executionTime: number;
  error?: string;
  isHidden: boolean;
}

export interface SubmissionOutcome {
  submissionId: string;
  status: "accepted" | "wrong_answer" | "time_limit_exceeded" | "runtime_error";
  passedCount: number;
  total: number;
  score: number;
  maxScore: number;
  testResults: SubmissionTestResult[];
}

export interface CodeReview {
  strengths: string[];
  improvements: string[];
  complexity: { time: string; space: string };
  verdict?: string;
}

/** Verdict → how it reads and how it looks. Literal classes for the JIT. */
const VERDICT: Record<SubmissionOutcome["status"], { label: string; cls: string; note: string }> = {
  accepted: {
    label: "Accepted",
    cls: "bg-success/10 text-success border-success/20",
    note: "Every test passed, including the hidden ones.",
  },
  wrong_answer: {
    label: "Wrong answer",
    cls: "bg-destructive/10 text-destructive border-destructive/20",
    note: "The code ran, but at least one case produced the wrong output.",
  },
  time_limit_exceeded: {
    label: "Time limit exceeded",
    cls: "bg-warning/10 text-warning border-warning/20",
    note: "A case ran past the sandbox budget — the approach is likely too slow.",
  },
  runtime_error: {
    label: "Runtime error",
    cls: "bg-destructive/10 text-destructive border-destructive/20",
    note: "Execution crashed before finishing. See the failing case below.",
  },
};

interface SubmissionResultProps {
  outcome: SubmissionOutcome;
  review: CodeReview | null;
  reviewLoading: boolean;
  reviewError: string | null;
  onBackToEditor: () => void;
  onNextQuestion?: () => void;
}

/**
 * What the submission actually produced.
 *
 * This replaces a panel built from `/ai/interview-analyze` — the VOICE
 * interview analyser — which returned "confidenceScore" and "contentScore" for
 * a block of code. The real signal was always in the submit response: verdict,
 * score, and per-case results with hidden cases masked server-side. The AI
 * review is now a code-shaped second opinion beside that, not a substitute.
 */
export const SubmissionResult: React.FC<SubmissionResultProps> = ({
  outcome, review, reviewLoading, reviewError, onBackToEditor, onNextQuestion,
}) => {
  const verdict = VERDICT[outcome.status] ?? VERDICT.wrong_answer;
  const firstFailure = outcome.testResults.find((t) => !t.passed);

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="border border-border">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {outcome.status === "accepted"
                    ? <CheckCircle2 className="w-5 h-5 text-success" />
                    : <XCircle className="w-5 h-5 text-destructive" />}
                  <Badge variant="outline" className={verdict.cls}>{verdict.label}</Badge>
                </CardTitle>
                <CardDescription className="mt-1">{verdict.note}</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {outcome.score}<span className="text-base text-muted-foreground">/{outcome.maxScore}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {outcome.passedCount} of {outcome.total} tests
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {firstFailure && (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">First failing case</CardTitle>
              <CardDescription>
                {firstFailure.isHidden
                  ? "This is a hidden case, so its input and expected output stay masked."
                  : "Fix this one first — later failures often share a cause."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3 font-mono text-xs">
              {(["input", "expected", "actual"] as const).map((field) => (
                <div key={field} className="rounded border border-border bg-muted/40 p-2 overflow-x-auto">
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    {field}
                  </span>
                  <pre className="whitespace-pre-wrap break-words">{firstFailure[field] || "—"}</pre>
                </div>
              ))}
              {firstFailure.error && (
                <p className="sm:col-span-3 text-destructive whitespace-pre-wrap">{firstFailure.error}</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm">All cases</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 px-4 font-medium">#</th>
                    <th className="py-2 px-4 font-medium">Result</th>
                    <th className="py-2 px-4 font-medium">Visibility</th>
                    <th className="py-2 px-4 font-medium text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {outcome.testResults.map((t, i) => (
                    <tr key={`${i}-${t.executionTime}`} className="border-b border-border last:border-0">
                      <td className="py-2 px-4 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="py-2 px-4">
                        <span className={t.passed
                          ? "inline-flex items-center gap-1.5 text-success"
                          : "inline-flex items-center gap-1.5 text-destructive"}>
                          {t.passed
                            ? <CheckCircle2 className="w-3.5 h-3.5" />
                            : <XCircle className="w-3.5 h-3.5" />}
                          {t.passed ? "Passed" : t.error || "Failed"}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">
                        {t.isHidden ? "Hidden" : "Sample"}
                      </td>
                      <td className="py-2 px-4 text-right text-muted-foreground tabular-nums">
                        {t.executionTime}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" /> Code review
            </CardTitle>
            <CardDescription>On the solution you submitted, not the ideal one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Reviewing your code…
              </div>
            ) : reviewError ? (
              <p className="text-sm text-muted-foreground">{reviewError}</p>
            ) : review ? (
              <>
                {review.verdict && <p className="text-sm text-foreground">{review.verdict}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      <Clock className="w-3 h-3" /> Time complexity
                    </p>
                    <p className="text-sm font-medium text-foreground">{review.complexity.time}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      <TrendingUp className="w-3 h-3" /> Space complexity
                    </p>
                    <p className="text-sm font-medium text-foreground">{review.complexity.space}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold text-success mb-2">What worked</h3>
                    <ul className="space-y-1.5">
                      {review.strengths.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-success mt-0.5">•</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-warning mb-2">What to change</h3>
                    <ul className="space-y-1.5">
                      {review.improvements.map((s) => (
                        <li key={s} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-warning mt-0.5">•</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 pb-6">
          <Button variant="outline" onClick={onBackToEditor}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to editor
          </Button>
          {onNextQuestion && (
            <Button onClick={onNextQuestion} className="bg-gradient-primary hover:opacity-90">
              Next question
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
