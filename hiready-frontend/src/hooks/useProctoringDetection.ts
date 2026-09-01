import { useEffect, useRef, useState, useCallback } from "react";
import * as blazeface from "@tensorflow-models/blazeface";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs";
import { sendProctorLog, type ProctorEvent } from "@/lib/proctorLogger";
import { registerWebcamStream, captureWebcamSnapshot } from "@/lib/webcamSnap";

const DETECTION_INTERVAL_MS = 1500;
/** Same violation type is persisted at most once per window (prevents DB spam every 1.5s) */
const LOG_DEDUPE_MS = 10000;

export type WarningType =
  | "no_face_detected"
  | "multiple_faces_detected"
  | "multiple_people_detected"
  | "camera_permission_denied";

export const WARNING_MESSAGES: Record<WarningType, string> = {
  no_face_detected: "Face not detected. Please stay in front of the camera.",
  multiple_faces_detected: "Multiple people detected in frame.",
  multiple_people_detected: "Another person detected in the frame.",
  camera_permission_denied: "Camera access is required for the interview.",
};

export interface ProctoringState {
  status: string;
  warnings: WarningType[];
  logs: ProctorEvent[];
  cameraDenied: boolean;
  modelsLoading: boolean;
  modelError: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
}

let modelsPromise: Promise<[blazeface.BlazeFaceModel, cocoSsd.ObjectDetection]> | null = null;

async function getSharedModels(): Promise<[blazeface.BlazeFaceModel, cocoSsd.ObjectDetection]> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const [faceModel, personModel] = await Promise.all([
        blazeface.load(),
        cocoSsd.load({ base: "lite_mobilenet_v2" }),
      ]);
      return [faceModel, personModel];
    })();
  }
  return modelsPromise;
}

export function useProctoringDetection(sessionId: string): ProctoringState {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [status, setStatus] = useState("Initializing camera...");
  const [warnings, setWarnings] = useState<WarningType[]>([]);
  const [logs, setLogs] = useState<ProctorEvent[]>([]);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  const blazefaceModelRef = useRef<blazeface.BlazeFaceModel | null>(null);
  const cocoModelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastLoggedRef = useRef<Record<string, number>>({});

  // --------------- helpers ---------------

  const logEvent = useCallback(
    (event: WarningType) => {
      const now = Date.now();
      if (now - (lastLoggedRef.current[event] ?? 0) < LOG_DEDUPE_MS) return;
      lastLoggedRef.current[event] = now;
      const entry: ProctorEvent = {
        event,
        timestamp: new Date().toISOString(),
        sessionId,
        // Evidence snapshot at the moment of the violation (admin evidence gallery)
        snapshot: captureWebcamSnapshot() ?? undefined,
      };
      setLogs((prev) => [...prev, entry]);
      sendProctorLog(entry);
    },
    [sessionId]
  );

  // --------------- camera setup ---------------

  useEffect(() => {
    let cancelled = false;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        registerWebcamStream(stream, videoRef.current);
        setCameraDenied(false);
      } catch {
        if (cancelled) return;
        setCameraDenied(true);
        setStatus("Camera access is required for the interview.");
        setWarnings(["camera_permission_denied"]);
        logEvent("camera_permission_denied");
      }
    }

    setupCamera();

    return () => {
      cancelled = true;
      registerWebcamStream(null, null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [logEvent]);

  // --------------- model loading ---------------

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      try {
        const [faceModel, personModel] = await getSharedModels();
        if (cancelled) return;
        blazefaceModelRef.current = faceModel;
        cocoModelRef.current = personModel;
        setModelsLoading(false);
        setStatus("Models loaded. Monitoring...");
      } catch {
        if (!cancelled) {
          setModelError("Computer vision detection models failed to load.");
        }
      }
    }

    loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  // --------------- detection loop ---------------

  useEffect(() => {
    if (cameraDenied || modelsLoading || modelError) return;

    let isMounted = true;
    let isProcessing = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    async function runDetection() {
      if (!isMounted) return;
      const video = videoRef.current;

      if (video && video.readyState >= 4 && !isProcessing) {
        isProcessing = true;
        try {
          // Face detection via BlazeFace
          const faces = blazefaceModelRef.current
            ? await blazefaceModelRef.current.estimateFaces(video, false)
            : [];

          // Person detection via COCO-SSD
          const predictions = cocoModelRef.current
            ? await cocoModelRef.current.detect(video)
            : [];

          if (!isMounted) return;

          const newWarnings: WarningType[] = [];

          // Face logic
          if (faces.length === 0) {
            newWarnings.push("no_face_detected");
            logEvent("no_face_detected");
          } else if (faces.length > 1) {
            newWarnings.push("multiple_faces_detected");
            logEvent("multiple_faces_detected");
          }

          // Person logic
          const personCount = predictions.filter((p) => p.class === "person").length;
          if (personCount > 1) {
            newWarnings.push("multiple_people_detected");
            logEvent("multiple_people_detected");
          }

          setWarnings((prev) => {
            const isSame = prev.length === newWarnings.length && prev.every((w, i) => w === newWarnings[i]);
            return isSame ? prev : newWarnings;
          });

          if (newWarnings.length === 0) {
            setStatus("Face detected");
          } else {
            setStatus(
              newWarnings.map((w) => WARNING_MESSAGES[w]).join(" | ")
            );
          }
        } catch {
          // Silently recover — single frame inference error should not break loop
        } finally {
          isProcessing = false;
        }
      }

      if (isMounted) {
        timerId = setTimeout(runDetection, DETECTION_INTERVAL_MS);
      }
    }

    runDetection();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [cameraDenied, modelsLoading, modelError, logEvent]);

  return {
    status,
    warnings,
    logs,
    cameraDenied,
    modelsLoading,
    modelError,
    videoRef,
  };
}
