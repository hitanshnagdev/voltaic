// USD per million tokens. Update quarterly — pricing at https://www.anthropic.com/pricing
export const PRICING: Record<
  string,
  { input: number; output: number }
> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
};

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}

/**
 * Estimate the per-turn cost of an agent chat call as a function of
 * model + retrievalLimit. Used by the ConfigurePanel "Sources per
 * answer" slider for live cost prediction.
 *
 * Calibration (rough, based on observed Compliance Reviewer turns):
 *   - System prompt + custom prompt overhead: ~700 tokens
 *   - Document list block: ~400 tokens (50-doc cap)
 *   - Retrieved atoms: ~300 tokens each (mix of spec paragraphs and
 *     submittal_field/response/page snippets)
 *   - Question + chat history overhead: ~400 tokens
 *   - Output: ~700 tokens average answer
 *
 * The numbers are estimates intended for an order-of-magnitude UI
 * preview, not billing. Real costs land via the llm_calls log.
 */
export function estimateChatTurnCostUsd(
  model: string,
  retrievalLimit: number,
): number | null {
  const p = PRICING[model];
  if (!p) return null;
  const SYSTEM_OVERHEAD = 700;
  const DOC_LIST_OVERHEAD = 400;
  const TOKENS_PER_ATOM = 300;
  const HISTORY_AND_QUESTION = 400;
  const TYPICAL_OUTPUT = 700;
  const tokensIn =
    SYSTEM_OVERHEAD +
    DOC_LIST_OVERHEAD +
    retrievalLimit * TOKENS_PER_ATOM +
    HISTORY_AND_QUESTION;
  return (tokensIn * p.input + TYPICAL_OUTPUT * p.output) / 1_000_000;
}
