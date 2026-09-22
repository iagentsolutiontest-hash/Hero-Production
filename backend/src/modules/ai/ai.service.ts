import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';

export interface AskHeroContext {
  /** Optional lightweight org context (counts, names) to ground answers — never raw financial records. */
  summary?: string;
}

@Injectable()
export class AiService {
  private get apiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }

  private get model(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  async ask(prompt: string, context?: AskHeroContext): Promise<{ reply: string; model: string }> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Ask Hero is not configured — set OPENAI_API_KEY in the backend .env to enable it.',
      );
    }

    const systemPrompt = [
      "You are Ask Hero, the in-app assistant for Hero Accounting, a small-business bookkeeping product.",
      'Answer accounting, bookkeeping and product questions concisely and practically.',
      'You do not have direct access to the organization\'s ledger — only what is summarized below, if anything.',
      context?.summary ? `Organization snapshot: ${context.summary}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 600,
        }),
      });
    } catch {
      throw new ServiceUnavailableException('Could not reach the AI provider. Please try again shortly.');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Ask Hero request failed (${response.status}). ${detail.slice(0, 300)}`,
      );
    }

    const payload: any = await response.json();
    const reply = payload?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      throw new InternalServerErrorException('Ask Hero returned an empty response.');
    }
    return { reply, model: this.model };
  }
}
