import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface AskHeroContext {
  /** Optional lightweight org context (counts, names) to ground answers — never raw financial records. */
  summary?: string;
}

@Injectable()
export class AiService {
  private get openAiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }

  private get openAiModel(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  private get geminiKey(): string | undefined {
    return process.env.GEMINI_API_KEY;
  }

  private get geminiModel(): string {
    return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  async ask(
    prompt: string,
    context?: AskHeroContext,
  ): Promise<{ reply: string; model: string }> {
    const systemPrompt = [
      'You are Ask Hero, the in-app assistant for Hero Accounting, a small-business bookkeeping product.',
      'Answer accounting, bookkeeping and product questions concisely and practically.',
      "You do not have direct access to the organization's ledger — only what is summarized below, if anything.",
      context?.summary
        ? `Organization snapshot: ${context.summary}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    // Try OpenAI first
    if (this.openAiKey) {
      try {
        return await this.askOpenAI(
          prompt,
          systemPrompt,
          this.openAiKey,
        );
      } catch (error: any) {
        console.warn(
          `OpenAI unavailable (${error?.status || 'unknown'}). Falling back to Gemini.`,
        );
      }
    }

    // Fallback to Gemini
    if (this.geminiKey) {
      try {
        return await this.askGemini(
          prompt,
          systemPrompt,
          this.geminiKey,
        );
      } catch (error: any) {
        console.error(
          'Gemini fallback failed:',
          error?.message || error,
        );
      }
    }

    if (!this.openAiKey && !this.geminiKey) {
      throw new ServiceUnavailableException(
        'Ask Hero is not configured. Please configure OPENAI_API_KEY or GEMINI_API_KEY.',
      );
    }

    throw new ServiceUnavailableException(
      'Ask Hero is temporarily unavailable. Please try again shortly.',
    );
  }

  private async askOpenAI(
    prompt: string,
    systemPrompt: string,
    apiKey: string,
  ): Promise<{ reply: string; model: string }> {
    let response: Response;

    try {
      response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.openAiModel,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_completion_tokens: 600,
          }),
        },
      );
    } catch {
      const error: any = new Error(
        'Could not reach OpenAI.',
      );

      error.status = 503;
      throw error;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');

      const error: any = new Error(
        `OpenAI request failed (${response.status}).`,
      );

      error.status = response.status;
      error.detail = detail.slice(0, 500);

      throw error;
    }

    const payload: any = await response.json();

    const reply =
      payload?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      const error: any = new Error(
        'OpenAI returned an empty response.',
      );

      error.status = 502;
      throw error;
    }

    return {
      reply,
      model: this.openAiModel,
    };
  }

  private async askGemini(
    prompt: string,
    systemPrompt: string,
    apiKey: string,
  ): Promise<{ reply: string; model: string }> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${this.geminiModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: systemPrompt,
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 600,
          },
        }),
      });
    } catch {
      throw new Error('Could not reach Gemini.');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');

      throw new Error(
        `Gemini request failed (${response.status}). ${detail.slice(0, 300)}`,
      );
    }

    const payload: any = await response.json();

    const reply = payload?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text)
      .filter(Boolean)
      .join('')
      ?.trim();

    if (!reply) {
      throw new Error('Gemini returned an empty response.');
    }

    return {
      reply,
      model: this.geminiModel,
    };
  }
}
