import { useEffect, useRef } from "react";

interface Props {
  candidateId: string;
}

const CameraMonitor: React.FC<Props> = ({ candidateId }) => {

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {

    const startCamera = async () => {
      try {

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

      } catch (err) {
        alert("Camera permission is required to start interview");
      }
    };

    startCamera();

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