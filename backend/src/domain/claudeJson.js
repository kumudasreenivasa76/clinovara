/** One place for "ask Claude for structured JSON". Marketing drafting, the campaign planner and prompt tools all use it. */
let client = null;
export const MODEL = 'claude-opus-5-5';

export const aiOn = () => process.env.CLINOVARA_AI !== 'rules' && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function claudeJson({ system, user, schema, maxTokens = 1000 }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  client ||= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL, max_tokens: maxTokens, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    system, messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  });
  if (response.stop_reason === 'refusal') throw new Error('Model declined');
  return JSON.parse(response.content.find((b) => b.type === 'text').text);
}
