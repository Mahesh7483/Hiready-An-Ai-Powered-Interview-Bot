import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface QueryErrorProps {
  /** What could not be loaded, as a noun phrase: "your saved resumes". */
  what: string;
  /** The error TanStack handed back. */
  error?: unknown;
  /** Wire this to the query's refetch so the user can try again in place. */
  onRetry?: () => void;
  /** Drop the Card wrapper — for use inside a table cell, which already has one. */
  compact?: boolean;
  className?: string;
}

/**
 * What a failed fetch should look like.
 *
 * A page that renders `data?.rows ?? []` draws its EMPTY state whenever the
 * data is missing — and eleven pages here did. "No users found", "No jobs
 * yet", "Nobody to show" were all shown for a backend that was simply down.
 *
 * The worst was the consent screen, which told a candidate that no company
 * could see their data — the most reassuring possible sentence, and false,
 * printed at exactly the moment the truth was unknown.
 *
 * `isError` alone is NOT enough to catch this, which I only found by killing
 * the API and watching the page still lie. When TanStack cannot reach the
 * server it may PAUSE the query rather than fail it, leaving:
 *
 *     status 'pending' · fetchStatus 'paused'
 *     isLoading false · isError false · data undefined
 *
 * — which slips past both an `isLoading` branch and an `isError` branch and
 * lands on the empty state. The invariant that actually holds is simpler:
 * **never claim a list is empty while `data` is undefined.** Callers here
 * pass `isError || data === undefined`.
 *
 * An empty result and an unanswered question are different things and must
 * never look alike. This says which one happened, and offers the way out.
 */
export const QueryError = ({ what, error, onRetry, compact, className }: QueryErrorProps) => {
  const message = error instanceof Error ? error.message : null;

  const body = (
    <div className={compact ? "text-center space-y-2" : "py-8 text-center space-y-3"}>
      <AlertTriangle
        className={`text-destructive mx-auto ${compact ? "w-6 h-6" : "w-8 h-8"}`}
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="font-medium text-foreground">Could not load {what}</p>
        <p className="text-sm text-muted-foreground">
          {/* Deliberately not "there is nothing here" — we do not know that. */}
          This is a problem reaching the server, not an empty list.
        </p>
        {message && (
          <p className="text-xs text-muted-foreground/80 font-mono pt-1 break-words">
            {message}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );

  if (compact) return body;

  return (
    <Card className={`border-destructive/30 bg-destructive/5 ${className ?? ""}`}>
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
};

export default QueryError;
