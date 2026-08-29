import { apiFetch, getAuthHeaders, API_BASE_URL } from "./api";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InterviewConfig {
  role: string;
  experienceLevel: string;
  jobDescription?: string;
  /** assessment = strict proctoring + no help; practice = relaxed rules */
  mode?: "assessment" | "practice";
  /** technical = full structure; behavioral = HR-style, no technical rounds */
  interviewType?: "technical" | "behavioral";
}

const DEFAULT_CONFIG: InterviewConfig = {
  role: "Frontend Developer",
  experienceLevel: "Mid-Level",
};

/**
 * Builds the STRICT interviewer system prompt from the interview
 * configuration. The interviewer is deliberately rigorous: it probes
 * weak answers, never reveals answers, and follows a structured plan.
 */
export function buildInterviewerSystemPrompt(
  config: InterviewConfig = DEFAULT_CONFIG
): string {
  const jdSection = config.jobDescription?.trim()
    ? `\n- Job description (prioritize questions that map to these requirements):\n---\n${config.jobDescription.trim().slice(0, 2000)}\n---`
    : "";

  const levelCalibration: Record<string, string> = {
    Fresher:
      "The candidate is a fresher (campus / no professional experience). Focus on fundamentals, CS basics, projects, coursework, and learning ability. Still hold a high bar for clarity of thought.",
    Intern:
      "The candidate is applying for an internship. Focus on fundamentals, academic projects, and eagerness to learn. Expect clean reasoning over deep experience.",
    "Entry-Level":
      "The candidate has 0-2 years of experience. Probe fundamentals plus one real project in depth.",
    "Mid-Level":
      "The candidate has 3-5 years of experience. Expect ownership of features/systems, trade-off discussions, and debugging stories.",
    "Senior-Level":
      "The candidate has 6+ years of experience. Probe architecture decisions, scalability, mentoring, incident handling, and hard trade-offs.",
  };
  const calibration =
    levelCalibration[config.experienceLevel] ??
    `The candidate is at ${config.experienceLevel} level.`;

  const isBehavioral = config.interviewType === "behavioral";

  const roundStructure = isBehavioral
    ? `7. Follow this structure (HR / behavioral-only interview — NO technical questions):
   - Turn 1: Brief intro (one line) + first question about the candidate's background and motivation.
   - Turns 2-5: Behavioral questions only (teamwork, conflict, failure, deadlines, leadership). Require concrete examples; probe for the RESULT of each story.
   - Turn 6: At most one more probing question, then say EXACTLY: "Thank you. That concludes the interview." and nothing else.`
    : `7. Follow this structure:
   - Turn 1: Brief intro (one line) + your first question about their background with ${config.role}.
   - Turns 2-3: Technical depth for ${config.role}${jdSection}. Escalate difficulty with each follow-up.
   - Turn 4: A practical problem-solving/scenario question for a ${config.experienceLevel} ${config.role}.
   - Turn 5: One behavioral question (conflict, failure, deadline pressure).
   - Turn 6+: At most one more probing question, then say EXACTLY: "Thank you. That concludes the interview." and nothing else.`;

  return `You are "HiREady", a STRICT senior interviewer with 15+ years of experience hiring for ${config.role} positions${isBehavioral ? " (HR round)" : ""}. You conduct rigorous, realistic interviews.

STRICT RULES — follow ALL of them:
1. ONE question at a time. Never ask two questions in one turn.
2. Keep every message under 4 sentences. No pleasantries beyond the brief intro and the closing.
3. NEVER reveal answers, correct the candidate, or give hints. You evaluate; you do not teach.
4. If an answer is vague, generic, buzzword-heavy, or copied-sounding, CHALLENGE it: ask "why", "how exactly", or request a concrete example. Probe up to TWO times before moving on.
5. Do NOT praise weak or incomplete answers. Stay neutral. Only acknowledge genuinely strong points briefly ("Good, that covers it.").
6. If the candidate tries to change topic, joke around, or asks YOU questions, redirect firmly back to the interview.
${roundStructure}
8. Candidate experience calibration: ${calibration}
9. Ask questions relevant ONLY to ${config.role}${isBehavioral ? ", from an HR/behavioral perspective" : ""}. Current interview context:
   - Position: ${config.role}
   - Experience Level: ${config.experienceLevel}
   - Interview Type: ${isBehavioral ? "HR Behavioral Round" : "Technical Interview"}${jdSection}

Remember: realistic, firm, professional. Short messages. One question per turn. Never break character.`;
}

export class LLMService {
  private conversationHistory: Message[] = [];
  private systemPrompt: string;
  private config: InterviewConfig;

  constructor(config?: InterviewConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.systemPrompt = buildInterviewerSystemPrompt(this.config);
    this.resetConversation();
  }

  /**
   * Update the interview context and reset the conversation.
   */
  configure(config: Partial<InterviewConfig>): void {
    this.config = { ...this.config, ...config };
    this.systemPrompt = buildInterviewerSystemPrompt(this.config);
    this.resetConversation();
  }

  getConfig(): InterviewConfig {
    return { ...this.config };
  }

  /**
   * Call the backend AI proxy with the current conversation.
   */
  private async chatWithBackend(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ messages: this.conversationHistory.slice(-20) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `AI request failed (${response.status})`);
    }

    const data = await response.json();
    return data.reply || "";
  }

  /**
   * Send user's response to LLM and get interviewer's reply
   */
  async getInterviewerResponse(userTranscript: string): Promise<string> {
    try {
      this.conversationHistory.push({
        role: "user",
        content: userTranscript,
      });

      const assistantMessage = await this.chatWithBackend();

      this.conversationHistory.push({
        role: "assistant",
        content: assistantMessage,
      });

      return assistantMessage;
    } catch (error) {
      console.error("Error getting LLM response:", error);
      throw error;
    }
  }

  /**
   * Get initial interview question
   */
  async getInitialQuestion(): Promise<string> {
    try {
      // Kickoff instruction is sent to the model but not persisted in history
      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          messages: [
            ...this.conversationHistory,
            {
              role: "user",
              content:
                "Please start the interview with an opening greeting and your first question.",
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `AI request failed (${response.status})`);
      }

      const data = await response.json();
      const initialQuestion = data.reply || "";

      this.conversationHistory.push({
        role: "assistant",
        content: initialQuestion,
      });

      return initialQuestion;
    } catch (error) {
      console.error("Error getting initial question:", error);
      // Fallback question if API fails
      return "Hello! Thank you for joining today's interview. Let's start with a simple question - can you tell me a bit about yourself and your background?";
    }
  }

  /**
   * Reset conversation history
   */
  resetConversation(): void {
    this.conversationHistory = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];
  }

  /**
   * Get full conversation history
   */
  getConversationHistory(): Message[] {
    return this.conversationHistory;
  }

  /**
   * Update system prompt directly (overrides the generated one)
   */
  updateSystemPrompt(newPrompt: string): void {
    this.systemPrompt = newPrompt;
    this.conversationHistory[0] = {
      role: "system",
      content: newPrompt,
    };
  }
}

// Export singleton instance
export const llmService = new LLMService();

/**
 * Lightweight check that the backend AI service is reachable and configured.
 */
export async function checkAIAvailability(): Promise<{
  available: boolean;
  error?: string;
}> {
  if (!localStorage.getItem("token")) {
    return { available: false, error: "Sign in required for the voice interview" };
  }
  try {
    const res = await apiFetch("/test");
    if (!res.ok) return { available: false, error: `Backend unreachable (${res.status})` };
    return { available: true };
  } catch {
    return { available: false, error: "Cannot reach the backend server" };
  }
}
