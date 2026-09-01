import { useEffect, useRef } from "react";

interface Props {
  candidateId?: string;
}

const CameraMonitor: React.FC<Props> = () => {

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let isCancelled = false;
    const videoEl = videoRef.current;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = stream;
        if (videoEl) {
          videoEl.srcObject = stream;
        }
      } catch {
        // Handled silently or via UI notification
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, []);

  return (
    <div className="border rounded-lg p-2 bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        className="rounded-lg"
        width="250"
      />
    </div>
  );
};

export default CameraMonitor;