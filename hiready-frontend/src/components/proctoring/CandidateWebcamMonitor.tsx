import { Badge } from "@/components/ui/badge";
import {
  useProctoringDetection,
  WARNING_MESSAGES,
  type WarningType,
} from "@/hooks/useProctoringDetection";
import type { ProctorEvent } from "@/lib/proctorLogger";
import { AlertCircle, Camera, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useEffect } from "react";

interface Props {
  sessionId: string;
  candidateName: string;
  isRecording?: boolean;
  /** Parent can grab the live logs via this callback */
  onLogsUpdate?: (logs: ProctorEvent[]) => void;
}

const CandidateWebcamMonitor: React.FC<Props> = ({
  sessionId,
  candidateName,
  isRecording = false,
  onLogsUpdate,
}) => {
  const {
    status,
    warnings,
    logs,
    cameraDenied,
    modelsLoading,
    modelError,
    videoRef,
  } = useProctoringDetection(sessionId);

  // Notify parent whenever logs change so they can be persisted on interview end
  useEffect(() => {
    onLogsUpdate?.(logs);
  }, [logs, onLogsUpdate]);

  const hasWarnings = warnings.length > 0;

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Webcam Feed */}
      <div
        className={`relative mb-4 rounded-xl overflow-hidden border-2 ${
          cameraDenied
            ? "border-destructive/50 bg-destructive/5"
            : hasWarnings
            ? "border-yellow-500/50"
            : "border-primary/30"
        }`}
        style={{ width: 240, height: 180 }}
      >
        {cameraDenied ? (
          <div className="flex flex-col items-center justify-center w-full h-full gap-2 bg-muted/50 p-4 text-center">
            <Camera className="w-10 h-10 text-destructive" />
            <p className="text-xs text-destructive font-medium">
              Camera access is required for the interview.
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Recording indicator overlay */}
            {isRecording && (
              <div className="absolute top-2 right-2">
                <Badge variant="destructive" className="animate-pulse text-[10px] px-1.5 py-0.5">
                  REC
                </Badge>
              </div>
            )}
            {/* Model loading overlay */}
            {modelsLoading && !cameraDenied && (
              <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Loading AI models...</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Candidate name */}
      <h3 className="text-xl font-semibold text-foreground mb-1">{candidateName} (You)</h3>
      <p className="text-sm text-muted-foreground mb-3">Candidate</p>

      {/* Status line */}
      {!cameraDenied && (
        <div className="w-full max-w-[260px]">
          {modelError ? (
            <div className="flex items-center gap-2 text-xs text-destructive px-3 py-1.5 bg-destructive/10 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{modelError}</span>
            </div>
          ) : modelsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Loading detection models...</span>
            </div>
          ) : (
            <>
              {/* Detection status */}
              <div
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md mb-1.5 ${
                  hasWarnings
                    ? "text-yellow-700 dark:text-yellow-400 bg-yellow-500/10"
                    : "text-green-700 dark:text-green-400 bg-green-500/10"
                }`}
              >
                {hasWarnings ? (
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{status}</span>
              </div>

              {/* Warning banners */}
              {warnings.map((w: WarningType) => (
                <div
                  key={w}
                  className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-md mb-1"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{WARNING_MESSAGES[w]}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CandidateWebcamMonitor;
