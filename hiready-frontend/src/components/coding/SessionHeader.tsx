import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Braces, Clock, Loader2, LogOut, Play, Send, ShieldAlert, ShieldCheck,
} from "lucide-react";
import type { ProctoringMode } from "@/hooks/useStrictProctoring";
import { LANGUAGES, formatClock } from "@/lib/coding";

interface SessionHeaderProps {
  title: string;
  mode: ProctoringMode;
  /** Seconds left, or null when no timer is running. */
  remaining: number | null;
  totalSeconds: number;
  violationCount: number;
  maxViolations: number;
  language: string;
  onLanguageChange: (next: string) => void;
  onRun: () => void;
  onSubmit: () => void;
  onExit: () => void;
  isRunning: boolean;
  isSubmitting: boolean;
  disabled?: boolean;
}

/**
 * The session bar: what the candidate is doing, how long is left, and how many
 * strikes they have.
 *
 * The violation counter is only rendered in interview mode, because only there
 * does it mean anything. The old guidelines screen claimed "3 violations will
 * terminate immediately" on a page that tracked none — the fix is to show the
 * real count where the rule is real, and show nothing where it is not.
 */
export const SessionHeader: React.FC<SessionHeaderProps> = ({
  title, mode, remaining, totalSeconds, violationCount, maxViolations,
  language, onLanguageChange, onRun, onSubmit, onExit,
  isRunning, isSubmitting, disabled = false,
}) => {
  const strict = mode === "interview";
  const pct = totalSeconds > 0 && remaining !== null
    ? Math.max(0, Math.min(100, (remaining / totalSeconds) * 100))
    : 100;

  // Literal class strings — a template-built one is invisible to Tailwind's JIT.
  const clockClass = remaining === null
    ? "text-muted-foreground"
    : remaining <= 60
      ? "text-destructive"
      : remaining <= 300
        ? "text-warning"
        : "text-foreground";

  return (
    <header className="border-b border-border bg-card">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
            <Braces className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                variant="outline"
                className={strict
                  ? "text-[10px] bg-destructive/10 text-destructive border-destructive/20"
                  : "text-[10px] bg-success/10 text-success border-success/20"}
              >
                {strict
                  ? <ShieldAlert className="w-3 h-3 mr-1" />
                  : <ShieldCheck className="w-3 h-3 mr-1" />}
                {strict ? "Interview" : "Practice"}
              </Badge>
              {strict && (
                <span className="text-[11px] text-muted-foreground">
                  Violations {violationCount}/{maxViolations}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {remaining !== null && (
            <div className="flex items-center gap-2 mr-1">
              <Clock className={`w-4 h-4 ${clockClass}`} />
              <span className={`font-mono text-sm tabular-nums ${clockClass}`}>
                {formatClock(remaining)}
              </span>
              <Progress value={pct} className="w-20 h-1.5 hidden sm:block" />
            </div>
          )}

          <Select value={language} onValueChange={onLanguageChange} disabled={disabled}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={onRun} disabled={isRunning || disabled}>
            {isRunning
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <Play className="w-4 h-4 mr-1.5" />}
            Run
          </Button>

          <Button
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting || disabled}
            className="bg-gradient-primary hover:opacity-90"
          >
            {isSubmitting
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <Send className="w-4 h-4 mr-1.5" />}
            Submit
          </Button>

          <Button size="sm" variant="ghost" onClick={onExit}>
            <LogOut className="w-4 h-4 mr-1.5" /> End
          </Button>
        </div>
      </div>
    </header>
  );
};
