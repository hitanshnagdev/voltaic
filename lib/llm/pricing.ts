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
