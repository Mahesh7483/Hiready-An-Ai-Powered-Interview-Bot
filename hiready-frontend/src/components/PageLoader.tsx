import { Loader2 } from "lucide-react";

/**
 * Full-screen fallback shown while a lazily-loaded route chunk downloads.
 */
export const PageLoader = () => (
  <div className="flex min-h-screen w-full items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  </div>
);