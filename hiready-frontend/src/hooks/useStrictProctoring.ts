import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendProctorLog, type ProctorEvent } from "@/lib/proctorLogger";
import { captureWebcamSnapshot } from "@/lib/webcamSnap";

/**
 * Tab / fullscreen / clipboard proctoring, as a hook.
 *
 * Extracted from the inline block in pages/VoiceInterview.tsx so a second
 * screen can enforce the same rules rather than reimplement them — and so that
 * what the UI *promises* and what the code *does* come from one place. The
 * coding page previously told candidates "Proctoring: Active" and "3 violations
 * will terminate immediately" while tracking nothing at all.
 *
 * Two modes, deliberately different:
 *
 *   practice    every event is logged for the record, nothing is blocked and
 *               nothing terminates. Surveillance theatre helps no one who is
 *               only rehearsing.
 *   interview   fullscreen is re-entered if exited, clipboard / context menu /
 *               devtools shortcuts are blocked, and `maxViolations` strikes
 *               ends the session via onTerminate.
 *
 * Camera-based detection (no face, multiple people) is a separate concern and
 * already lives in hooks/useProctoringDetection.ts — run both together when a
 * session needs webcam evidence too.
 */

export type ProctoringMode = "practice" | "interview";

export interface StrictProctoringOptions {
  /** Free-form session identifier; travels with every logged event. */
  sessionId: string;
  mode: ProctoringMode;
  /** Listeners only attach while this is true. */
  active: boolean;
  /** Strikes before the session is ended. Ignored in practice mode. */
  maxViolations?: number;
  /** Called once, on the terminating violation. */
  onTerminate?: () => void;
}

export interface StrictProctoringState {
  violationCount: number;
  maxViolations: number;
  /** Every event recorded this session, newest last. */
  events: ProctorEvent[];
  terminated: boolean;
}

const DEFAULT_MAX_VIOLATIONS = 3;

export function useStrictProctoring({
  sessionId,
  mode,
  active,
  maxViolations = DEFAULT_MAX_VIOLATIONS,
  onTerminate,
}: StrictProctoringOptions): StrictProctoringState {
  const [violationCount, setViolationCount] = useState(0);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [terminated, setTerminated] = useState(false);

  // Counters live in refs as well as state: the listeners below are attached
  // once per (active, mode) and would otherwise close over a stale count.
  const countRef = useRef(0);
  const terminatedRef = useRef(false);
  const onTerminateRef = useRef(onTerminate);
  useEffect(() => { onTerminateRef.current = onTerminate; }, [onTerminate]);

  const log = useCallback(
    (event: string) => {
      const snapshot = captureWebcamSnapshot();
      const entry: ProctorEvent = {
        event,
        timestamp: new Date().toISOString(),
        sessionId,
        ...(snapshot ? { snapshot } : {}),
      };
      setEvents((prev) => [...prev, entry]);
      sendProctorLog(entry);
    },
    [sessionId]
  );

  useEffect(() => {
    if (!active) return;
    const strict = mode === "interview";

    /** A strike. Only ever called in interview mode. */
    const strike = (type: string, message: string) => {
      if (terminatedRef.current) return;
      log(type);
      countRef.current += 1;
      const count = countRef.current;
      setViolationCount(count);

      if (count >= maxViolations) {
        terminatedRef.current = true;
        setTerminated(true);
        toast.error(`Session ended — ${maxViolations} proctoring violations recorded.`, {
          duration: 8000,
        });
        // Let the toast paint before the caller tears the session down.
        setTimeout(() => onTerminateRef.current?.(), 800);
        return;
      }
      toast.warning(
        `${message} Violation ${count} of ${maxViolations}. At ${maxViolations} the session ends automatically.`,
        { duration: 7000 }
      );
    };

    /** Logged either way; only a strike when the rules actually say so. */
    const record = (type: string, message: string) => {
      if (strict) {
        strike(type, message);
      } else {
        log(type);
        toast.info(`${message} (logged — practice mode)`, { duration: 3000 });
      }
    };

    const onVisibility = () => {
      if (document.hidden) record("tab_switch_detected", "Tab switch detected.");
    };
    const onBlur = () => record("window_blur_detected", "You left the session window.");

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && strict && !terminatedRef.current) {
        strike("fullscreen_exit_detected", "Fullscreen exited — returning you to it.");
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };

    const blockClipboard = (e: Event) => {
      e.preventDefault();
      const verb = `${e.type.charAt(0).toUpperCase()}${e.type.slice(1)}`;
      strike("clipboard_blocked", `${verb} is not allowed during the interview.`);
    };
    const blockContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      strike("right_click_blocked", "Right-click is disabled during the interview.");
    };
    const blockShortcuts = (e: KeyboardEvent) => {
      const isDevTools =
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) ||
        ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "U");
      if (!isDevTools) return;
      e.preventDefault();
      strike("devtools_shortcut_blocked", "Developer tools shortcuts are blocked.");
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("blur", onBlur);

    if (strict) {
      document.addEventListener("copy", blockClipboard);
      document.addEventListener("cut", blockClipboard);
      document.addEventListener("paste", blockClipboard);
      document.addEventListener("contextmenu", blockContextMenu);
      document.addEventListener("keydown", blockShortcuts);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
    };
  }, [active, mode, maxViolations, log]);

  return { violationCount, maxViolations, events, terminated };
}
