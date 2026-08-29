/**
 * Utility functions for Voice Interview feature
 */
import { checkAIAvailability } from "@/lib/llm";

/**
 * Check if browser supports required features
 */
export const checkBrowserCompatibility = (): {
  isCompatible: boolean;
  missingFeatures: string[];
} => {
  const missingFeatures: string[] = [];

  // Check for MediaRecorder API
  if (!window.MediaRecorder) {
    missingFeatures.push("MediaRecorder API");
  }

  // Check for getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    missingFeatures.push("getUserMedia API");
  }

  // Check for Web Speech API
  if (!window.speechSynthesis) {
    missingFeatures.push("Web Speech API (Text-to-Speech)");
  }

  return {
    isCompatible: missingFeatures.length === 0,
    missingFeatures,
  };
};

/**
 * Request microphone permissions
 */
export const requestMicrophonePermission = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately - we just wanted to check permission
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.error("Microphone permission denied:", error);
    return false;
  }
};

/**
 * Check if microphone is available
 */
export const checkMicrophoneAvailability = async (): Promise<{
  available: boolean;
  deviceCount: number;
  error?: string;
}> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");

    return {
      available: audioInputs.length > 0,
      deviceCount: audioInputs.length,
    };
  } catch (error) {
    return {
      available: false,
      deviceCount: 0,
      error: (error as Error).message,
    };
  }
};

/**
 * Validate that AI services are available via the backend.
 * API keys live server-side now, so we check backend reachability instead.
 */
export const validateAIAvailability = async (): Promise<{
  isValid: boolean;
  missingKeys: string[];
}> => {
  try {
    const status = await checkAIAvailability();
    if (!status.available) {
      return { isValid: false, missingKeys: [status.error || "Backend AI service"] };
    }
    return { isValid: true, missingKeys: [] };
  } catch {
    return { isValid: false, missingKeys: ["Cannot reach the backend server"] };
  }
};

/**
 * Format time in MM:SS format
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Calculate estimated tokens for text (rough estimate)
 */
export const estimateTokens = (text: string): number => {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
};

/**
 * Estimate API cost for interview
 */
export const estimateInterviewCost = (
  transcriptionMinutes: number,
  totalTokens: number
): {
  deepgramCost: number;
  groqCost: number;
  totalCost: number;
} => {
  // Deepgram: ~$0.0125 per minute
  const deepgramCost = transcriptionMinutes * 0.0125;

  // Groq Llama 3.1 70B: ~$0.00059 per 1K tokens (much cheaper!)
  const groqCost = (totalTokens / 1000) * 0.00059;

  return {
    deepgramCost: Number(deepgramCost.toFixed(4)),
    groqCost: Number(groqCost.toFixed(4)),
    totalCost: Number((deepgramCost + groqCost).toFixed(4)),
  };
};

/**
 * Debug helper - log interview statistics
 */
export const logInterviewStats = (stats: {
  duration: number;
  questionsAsked: number;
  transcriptionLength: number;
  tokensUsed: number;
}) => {
  console.group("📊 Interview Statistics");
  console.log(`Duration: ${formatTime(stats.duration)}`);
  console.log(`Questions Asked: ${stats.questionsAsked}`);
  console.log(`Transcription Length: ${stats.transcriptionLength} characters`);
  console.log(`Estimated Tokens: ${stats.tokensUsed}`);
  
  const costs = estimateInterviewCost(stats.duration / 60, stats.tokensUsed);
  console.log(`Estimated Cost: $${costs.totalCost}`);
  console.log(`  - Deepgram: $${costs.deepgramCost}`);
  console.log(`  - Groq: $${costs.groqCost}`);
  console.groupEnd();
};

/**
 * Get detailed error message for common issues
 */
export const getErrorMessage = (error: unknown): string => {
  const err = error as { name?: string; message?: string };
  if (err.name === "NotAllowedError") {
    return "Microphone access denied. Please grant permission and try again.";
  }
  if (err.name === "NotFoundError") {
    return "No microphone found. Please connect a microphone and try again.";
  }
  if (err.name === "NotReadableError") {
    return "Microphone is being used by another application.";
  }
  if (err.message?.includes("401")) {
    return "Invalid API key. Please check your configuration.";
  }
  if (err.message?.includes("429")) {
    return "API rate limit exceeded. Please try again later.";
  }
  if (err.message?.includes("network")) {
    return "Network error. Please check your internet connection.";
  }
  return err.message || "An unexpected error occurred.";
};

/**
 * Sleep utility for delays
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry wrapper for API calls
 */
export const retryAsync = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: unknown;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(delayMs * (i + 1)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
};
