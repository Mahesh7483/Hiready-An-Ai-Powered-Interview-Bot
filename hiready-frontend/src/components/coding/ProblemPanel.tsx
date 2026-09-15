import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Cpu, Timer } from "lucide-react";

export interface CodingQuestionDetail {
  _id: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  tags?: string[];
  constraints?: string;
  explanation?: string;
  /** Sandbox execution budget in MILLISECONDS — not the time you have to solve it. */
  timeLimit?: number;
  /** Sandbox memory ceiling in MB. */
  memoryLimit?: number;
  starterCode?: Record<string, string>;
  testCases?: Array<{ input: string; output: string; isHidden: boolean; points: number }>;
}

/** Difficulty → token class. Literal strings: Tailwind's JIT cannot see built ones. */
const DIFFICULTY_CLASS: Record<string, string> = {
  easy: "bg-success/10 text-success border-success/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  hard: "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * The problem statement.
 *
 * Note what the limits row says and does not say. `timeLimit` is the sandbox's
 * per-run execution budget — 2000ms by default. The previous version rendered
 * it as `Math.ceil(timeLimit / 60000)` minutes and presented it as the time the
 * candidate had to solve the problem, so a 2-second sandbox cap displayed as
 * "1 min". It is shown here in seconds, labelled as what it is.
 */
export const ProblemPanel: React.FC<{ question: CodingQuestionDetail }> = ({ question }) => {
  const examples = (question.testCases ?? []).filter((tc) => !tc.isHidden).slice(0, 3);

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Badge variant="outline" className={`capitalize ${DIFFICULTY_CLASS[question.difficulty] ?? ""}`}>
          {question.difficulty}
        </Badge>
        <Badge variant="outline" className="capitalize">{question.category}</Badge>
        {(question.tags ?? []).slice(0, 3).map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
        ))}
      </div>

      <h1 className="text-xl font-bold text-foreground mb-3">{question.title}</h1>

      <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed mb-5">
        {question.description}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            <Timer className="w-3 h-3" /> Per run
          </div>
          <p className="text-sm font-semibold text-foreground">
            {((question.timeLimit ?? 2000) / 1000).toFixed(1)}s
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            <Cpu className="w-3 h-3" /> Memory
          </div>
          <p className="text-sm font-semibold text-foreground">{question.memoryLimit ?? 256} MB</p>
        </div>
      </div>

      {question.constraints && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 mb-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning mb-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Constraints
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{question.constraints}</p>
        </div>
      )}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Examples
      </h2>
      {examples.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-5">
          No worked examples — this problem is graded on hidden tests only.
        </p>
      ) : (
        <div className="space-y-3 mb-5">
          {examples.map((tc, i) => (
            <div key={`${tc.input}-${i}`} className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Example {i + 1}
                </span>
                <Badge variant="outline" className="text-[10px]">{tc.points} pts</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 font-mono text-xs">
                <div className="rounded border border-border bg-background p-2 overflow-x-auto">
                  <span className="block text-[10px] text-muted-foreground mb-1">Input</span>
                  <pre className="whitespace-pre-wrap break-words">{tc.input}</pre>
                </div>
                <div className="rounded border border-border bg-background p-2 overflow-x-auto">
                  <span className="block text-[10px] text-muted-foreground mb-1">Expected</span>
                  <pre className="whitespace-pre-wrap break-words">{tc.output}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {question.explanation && (
        <details className="rounded-lg border border-border bg-muted/40 p-3">
          {/* Collapsed by default: an explanation visible from the start is a
              spoiler, not a hint. */}
          <summary className="text-xs font-semibold text-foreground cursor-pointer select-none">
            Show approach hint
          </summary>
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
            {question.explanation}
          </p>
        </details>
      )}
    </div>
  );
};
