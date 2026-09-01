/**
 * Global registry of the active interview webcam stream and video element.
 * Lets any module capture an evidence snapshot at the moment of a
 * proctoring violation, without prop-drilling the MediaStream around.
 */

let activeStream: MediaStream | null = null;
let activeVideoEl: HTMLVideoElement | null = null;

export function registerWebcamStream(
  stream: MediaStream | null,
  videoEl?: HTMLVideoElement | null
): void {
  activeStream = stream;
  activeVideoEl = videoEl || null;
}

/**
 * Grabs a small JPEG snapshot from the live webcam stream or active video element.
 * Returns a base64 data URI, or null when no camera is available.
 */
export function captureWebcamSnapshot(): string | null {
  if (!activeStream && !activeVideoEl) return null;

  try {
    const video = activeVideoEl && activeVideoEl.readyState >= 2 ? activeVideoEl : null;
    if (video) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.55);
    }
    return null;
  } catch {
    return null;
  }
}

