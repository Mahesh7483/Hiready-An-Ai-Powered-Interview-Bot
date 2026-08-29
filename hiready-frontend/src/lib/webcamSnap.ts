/**
 * Global registry of the active interview webcam stream.
 * Lets any module capture an evidence snapshot at the moment of a
 * proctoring violation, without prop-drilling the MediaStream around.
 */

let activeStream: MediaStream | null = null;

export function registerWebcamStream(stream: MediaStream | null): void {
  activeStream = stream;
}

/**
 * Grabs a small JPEG snapshot from the live webcam stream.
 * Returns a base64 data URI, or null when no camera is available.
 */
export function captureWebcamSnapshot(): string | null {
  if (!activeStream) return null;
  const video = document.createElement("video");
  try {
    video.srcObject = activeStream;
    video.muted = true;
    video.play();

    const trackSettings = activeStream.getVideoTracks()[0]?.getSettings() ?? {};
    const width = Math.min(trackSettings.width ?? 640, 640);
    const height = Math.min(trackSettings.height ?? 480, 480);

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = Math.round((320 * height) / Math.max(width, 1)) || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.55);
  } catch {
    return null;
  } finally {
    video.srcObject = null;
  }
}
