import { MonitorSmartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { detectDevice } from "@/lib/deviceGuard";

interface DesktopOnlyProps {
  /** What is being gated, lowercase, for the copy: "aptitude test". */
  activity: string;
  children: React.ReactNode;
}

/**
 * Refuse a proctored activity on a phone or tablet, before it starts.
 *
 * lib/deviceGuard.ts existed and guarded exactly one of four proctored
 * surfaces — the voice interview. Meanwhile AptitudeTest and CodingInterview
 * both run useStrictProctoring and call requestFullscreen, and
 * AssessmentPipeline rolls its own visibilitychange listener. On a phone none
 * of that works: fullscreen is refused, the webcam monitor cannot run, and the
 * candidate accrues violations for a machine failing rather than for anything
 * they did.
 *
 * Better to be told up front than to be failed for it halfway through. The
 * check was already written; it was only wired to one page because the copy
 * was interview-specific, which is now a prop.
 */
export const DesktopOnly = ({ activity, children }: DesktopOnlyProps) => {
  const check = detectDevice();
  if (check.allowed) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-destructive/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-2 border-destructive/40 shadow-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <MonitorSmartphone className="w-8 h-8 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Desktop required</h1>
        <p className="text-sm font-medium text-destructive uppercase tracking-wide">
          Detected device: {check.deviceType}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The {activity} is proctored, and the proctoring cannot run in a mobile
          browser. Starting it here would record violations you did not commit.
        </p>
        <ul className="text-xs text-muted-foreground text-left list-disc pl-6 space-y-1">
          <li>Fullscreen lock and tab-switch detection</li>
          <li>Live webcam monitoring with face detection</li>
          <li>Copy/paste and right-click blocking</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Please switch to a laptop or desktop computer to continue.
        </p>
      </Card>
    </div>
  );
};

export default DesktopOnly;
