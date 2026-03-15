import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

// Deepgram configuration
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";

export class DeepgramService {
  private deepgram;
  private connection: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;

  constructor() {
    this.deepgram = createClient(DEEPGRAM_API_KEY);
  }

  /**
   * Initialize live transcription with Deepgram
   */
  async startLiveTranscription(
    onTranscript: (text: string, isFinal: boolean) => void,
    onUtteranceEnd?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      // Get user's microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Create Deepgram live connection
      this.connection = this.deepgram.listen.live({
        model: "nova-2",
        language: "en",
        smart_format: true,
        interim_results: true,
        punctuate: true,
        utterance_end_ms: 1000,
      });

      // Handle connection open
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram connection opened");

        // Setup MediaRecorder to send audio to Deepgram
        this.mediaRecorder = new MediaRecorder(this.audioStream!, {
          mimeType: "audio/webm",
        });

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && this.connection) {
            this.connection.send(event.data);
          }
        };

        this.mediaRecorder.start(250); // Send audio chunks every 250ms
      });

      // Handle transcription results
      this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;
        
        if (transcript && transcript.trim() !== "") {
          onTranscript(transcript, isFinal);
        }
      });

      // Handle utterance end (end of speech detected)
      this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        console.log("Utterance ended - silence detected");
        if (onUtteranceEnd) {
          onUtteranceEnd();
        }
      });

      // Handle errors
      this.connection.on(LiveTranscriptionEvents.Error, (error: Error) => {
        console.error("Deepgram error:", error);
        if (onError) onError(error);
      });

      // Handle connection close
      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("Deepgram connection closed");
      });

    } catch (error) {
      console.error("Failed to start live transcription:", error);
      if (onError) onError(error as Error);
      throw error;
    }
  }

  /**
   * Stop live transcription and cleanup resources
   */
  stopLiveTranscription(): void {
    try {
      // Stop media recorder
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }

      // Stop audio tracks
      if (this.audioStream) {
        this.audioStream.getTracks().forEach((track) => track.stop());
      }

      // Close Deepgram connection
      if (this.connection) {
        this.connection.finish();
      }

      // Reset references
      this.mediaRecorder = null;
      this.audioStream = null;
      this.connection = null;

      console.log("Transcription stopped and resources cleaned up");
    } catch (error) {
      console.error("Error stopping transcription:", error);
    }
  }

  /**
   * Check if Deepgram is currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === "recording";
  }

  /**
   * Transcribe pre-recorded audio file
   */
  async transcribeAudioFile(audioBlob: Blob): Promise<string> {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audio = new Uint8Array(arrayBuffer);

      const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
        audio,
        {
          model: "nova-2",
          language: "en",
          smart_format: true,
          punctuate: true,
        }
      );

      if (error) {
        throw error;
      }

      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      return transcript;
    } catch (error) {
      console.error("Failed to transcribe audio file:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const deepgramService = new DeepgramService();
