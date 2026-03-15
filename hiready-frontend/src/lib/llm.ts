import Groq from "groq-sdk";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LLMService {
  private conversationHistory: Message[] = [];
  private systemPrompt: string;
  private groq: Groq;

  constructor(systemPrompt?: string) {
    this.groq = new Groq({ apiKey: GROQ_API_KEY, dangerouslyAllowBrowser: true });
    this.systemPrompt = systemPrompt || this.getDefaultInterviewerPrompt();
    this.conversationHistory = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];
  }

  /**
   * Get default interviewer system prompt
   */
  private getDefaultInterviewerPrompt(): string {
    return `You are an AI interviewer conducting a professional job interview. Your role is to:
1. Ask relevant questions about the candidate's experience, skills, and qualifications
2. Be professional, friendly, and encouraging
3. Listen carefully to responses and ask follow-up questions
4. Provide constructive feedback when appropriate
5. Keep responses concise and focused (2-3 sentences max)
6. Guide the conversation naturally and professionally

Current interview context:
- Position: Frontend Developer
- Experience Level: Mid-Level
- Focus areas: Technical skills, problem-solving, teamwork, and cultural fit`;
  }

  /**
   * Send user's response to LLM and get interviewer's reply
   */
  async getInterviewerResponse(userTranscript: string): Promise<string> {
    try {
      // Add user message to conversation history
      this.conversationHistory.push({
        role: "user",
        content: userTranscript,
      });

      // Make API call to Groq with Llama 3.1 70B
      const response = await this.groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: this.conversationHistory,
        max_tokens: 150,
        temperature: 0.7,
      });

      const assistantMessage = response.choices[0]?.message?.content || "";

      // Add assistant response to conversation history
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
      const response = await this.groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          ...this.conversationHistory,
          {
            role: "user",
            content: "Please start the interview with an opening greeting and first question.",
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const initialQuestion = response.choices[0]?.message?.content || "";

      // Add to conversation history
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
   * Update system prompt (useful for changing interview context)
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
