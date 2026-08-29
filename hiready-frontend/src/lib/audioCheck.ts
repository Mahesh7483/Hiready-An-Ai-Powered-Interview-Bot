/**
 * Quick microphone noise-level check.
 * Returns a promise that resolves with the average RMS level (0-1)
 * and a human-readable status.
 */
export interface AudioCheckResult {
  rms: number;
  status: "quiet" | "moderate" | "noisy";
  message: string;
}

/**
 * Runs a 3-second audio check using the browser's AudioContext.
 * Returns the average RMS level and a classification.
 */
export async function runAudioCheck(): Promise<AudioCheckResult> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const AudioCtx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioCtx();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  const samples: number[] = [];

  const checkDuration = 3000; // 3 seconds
  const startTime = Date.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      // Compute RMS from frequency data (approximation)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255; // normalize 0-1
      samples.push(rms);

      if (Date.now() - startTime < 3000) {
        requestAnimationFrame(tick);
      } else {
        stream.getTracks().forEach((t) => t.stop());
        audioContext.close().catch(() => {});
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });

  const avgRms = samples.reduce((a, b) => a + b, 0) / samples.length;

  let status: "quiet" | "moderate" | "noisy";
  let message: string;
  if (avgRms < 0.02) {
    status = "quiet";
    message = "Background noise is very low — excellent for the interview.";
  } else if (avgRms < 0.08) {
    status = "moderate";
    message = "Background noise is acceptable. Try to find a slightly quieter spot if possible.";
  } else {
    status = "noisy";
    message = "Background noise is high. Please find a quieter location before starting.";
  }

  return { rms: avgRms, status, message };
}