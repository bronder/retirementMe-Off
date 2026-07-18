/**
 * AI integration module.
 *
 * Provides:
 * - buildPlanContext(): Serializes the current plan + projection results into a
 *   structured text summary for the LLM.
 * - callAI(): Calls an AI provider's chat completions API directly from the browser.
 * - System prompt and quick-action prompt templates.
 *
 * All data stays client-side. The user's API key is stored in localStorage and
 * is only sent to the AI provider's API endpoint.
 */
import type { Plan, ProjectionResult, Scenario } from './types';
import { formatCurrency, formatPercent, prettify } from './format';
import { getReadinessSummary } from './engine';

/** AI provider definitions */
export interface AiProvider {
  id: string;
  label: string;
  endpoint: string;
  models: { id: string; label: string; hint: string }[];
  /** Auth header builder — returns the Authorization header value */
  authHeader: (apiKey: string) => string;
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'minimax',
    label: 'MiniMax (Coding Plan API)',
    endpoint: 'https://api.minimax.io/v1/chat/completions',
    authHeader: (key) => `Bearer ${key}`,
    models: [
      { id: 'MiniMax-M3', label: 'MiniMax-M3', hint: 'Reasoning model (flagship)' },
      { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed', hint: 'Balanced conversational' },
    ],
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM) (Coding Plan API)',
    endpoint: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
    authHeader: (key) => `Bearer ${key}`,
    models: [
      { id: 'glm-5.2', label: 'GLM-5.2', hint: 'Most capable' },
      { id: 'glm-5.1', label: 'GLM-5.1', hint: 'High performance' },
      { id: 'glm-5', label: 'GLM-5', hint: 'Balanced' },
      { id: 'glm-5-turbo', label: 'GLM-5-Turbo', hint: 'Fast & affordable' },
      { id: 'glm-4-plus', label: 'GLM-4-Plus', hint: 'Previous gen' },
      { id: 'glm-4-flash', label: 'GLM-4-Flash', hint: 'Fast & free' },
      { id: 'glm-4', label: 'GLM-4', hint: 'Previous gen' },
    ],
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    endpoint: '',
    authHeader: (key) => `Bearer ${key}`,
    models: [],
  },
];

export const DEFAULT_AI_PROVIDER = 'minimax';
export const DEFAULT_AI_MODEL = 'MiniMax-M3';

/** Provider ID for the custom OpenAI-compatible option. */
export const CUSTOM_PROVIDER_ID = 'custom';

/** Resolve the endpoint for a provider, applying a custom URL override
 *  when the provider is 'custom'. The customEndpoint should come from the
 *  store (user-supplied). It must be the full chat completions URL, e.g.
 *  https://models.inference.ai.azure.com/chat/completions */
export function resolveEndpoint(providerId: string, customEndpoint: string): string {
  if (providerId === CUSTOM_PROVIDER_ID) {
    return customEndpoint.trim() || '';
  }
  return getProvider(providerId).endpoint;
}

/** Get a provider by ID (falls back to the first available) */
export function getProvider(providerId: string): AiProvider {
  return AI_PROVIDERS.find((p) => p.id === providerId) ?? AI_PROVIDERS[0];
}

/** Get the default model for a provider (the flagship, listed first).
 *  For the custom provider, returns the user-supplied custom model. */
export function getDefaultModel(providerId: string, customModel = ''): string {
  if (providerId === CUSTOM_PROVIDER_ID) return customModel;
  const provider = getProvider(providerId);
  return provider.models[0]?.id ?? '';
}

/** Chat message types for the UI */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  /** Display content (scenario blocks and think blocks stripped) */
  content: string;
  /** Original raw assistant response before stripping. Used so prior
   *  turns in the API payload carry full context (including the scenario
   *  JSON the model previously emitted). */
  rawContent?: string;
  timestamp: number;
  /** Optional scenario suggestion attached to an assistant message */
  suggestion?: ScenarioSuggestion;
}

/** A structured scenario suggestion from the AI */
export interface ScenarioSuggestion {
  name: string;
  description: string;
  assumptions?: Partial<Scenario['assumptions']>;
}

/** Quick-action prompt templates */
export const QUICK_ACTIONS = [
  {
    id: 'fact-check',
    label: 'Reality-check my numbers',
    prompt:
      'Reality-check every number in my plan against real-world US benchmarks, and flag ONLY what is off. For each finding use:\n**[Severity] Problem** — one-sentence diagnosis. Current: X. Benchmark: Y (name the source). Impact: Z.\n\nCheck specifically:\n- Each expense vs BLS Consumer Expenditure Survey medians for a comparable household — line by line. Healthcare is the usual offender: confirm it covers premiums + out-of-pocket + dental/vision and that it outpaces general inflation.\n- Social Security and pension amounts — plausible for the claiming age and earnings history?\n- Do post-retirement expenses drop unrealistically vs pre-retirement? Flag a cliff. (A common error is expenses vanishing the day retirement starts.)\n- Return rates: pre-retirement over 8% or post-retirement over 6% = optimistic; under 3% = overly conservative. Inflation under 2.5% = optimistic (3% is the long-run norm).\n- Withdrawal rate vs the ~4% guideline AND the actual portfolio size.\n\nGive a cited source and a concrete number for every finding. Skip anything that is already reasonable.',
  },
  {
    id: 'risk-check',
    label: 'Find the plan-killers',
    prompt:
      'Find the silent failures that would sink this plan but are not obvious at a glance. For each: **[Severity] Risk** — why it breaks the plan, with the age or dollar where it bites. Impact: Z.\n\nHunt specifically for:\n- Withdrawal rate the portfolio cannot sustain — run it against my balance and first-year expenses.\n- Longevity gap: plan ending too early vs realistic lifespan; if a spouse is present, does the plan cover the longer-lived partner?\n- Sequence-of-returns risk in the first retirement decade.\n- Tax time-bombs: large pre-tax balances with no Roth-conversion strategy, RMDs pushing marginal rates up, or the retirement tax rate set unrealistically low.\n- Long-term care cost blind spot — is it modeled at all?\n- Claiming Social Security before full retirement age without justification.\n\nOnly list risks that genuinely apply to my numbers. Rank Critical → Minor.',
  },
  {
    id: 'scenario',
    label: 'Propose a fix',
    prompt:
      'Identify the single biggest weakness in my plan in one sentence, then propose ONE alternative scenario that fixes it. Output the <scenario> JSON block with specific assumption changes, followed by a 3-sentence rationale tying each change back to the weakness. Do not propose multiple scenarios — pick the highest-impact lever and pull it.',
  },
] as const;

/**
 * Build a structured text summary of the plan for AI context.
 */
export function buildPlanContext(
  plan: Plan,
  results: ProjectionResult[],
  activeScenarioId: string,
): string {
  const lines: string[] = [];

  lines.push('## Retirement Plan Data');
  lines.push(`Plan name: ${plan.name}`);
  lines.push(`Scenarios: ${plan.scenarios.length}`);
  lines.push('');

  for (const scenario of plan.scenarios) {
    const result = results.find((r) => r.scenarioId === scenario.id);
    const a = scenario.assumptions;
    const isActive = scenario.id === activeScenarioId;
    const readiness = result
      ? getReadinessSummary(result, a.retirementAge, a.safeWithdrawalRate)
      : null;

    lines.push(`### Scenario: "${scenario.name}"${isActive ? ' (active)' : ''}`);
    lines.push('');
    lines.push('**Timeline & Assumptions:**');
    lines.push(`- Current age: ${a.currentAge}`);
    lines.push(`- Retirement age: ${a.retirementAge}`);
    lines.push(`- Plan end age: ${a.endAge}`);
    lines.push(`- Inflation rate: ${formatPercent(a.inflationRate)}`);
    lines.push(`- Social Security COLA: ${formatPercent(a.socialSecurityCola)}`);
    lines.push(`- Retirement tax rate: ${formatPercent(a.retirementTaxRate)}`);
    lines.push(`- Safe withdrawal rate: ${formatPercent(a.safeWithdrawalRate)}`);
    lines.push(`- Pre-retirement return: ${formatPercent(a.preRetirementReturn)}`);
    lines.push(`- Post-retirement return: ${formatPercent(a.postRetirementReturn)}`);
    if (a.spouse?.enabled) {
      lines.push(`- Spouse: age ${a.spouse.currentAge}, retires at ${a.spouse.retirementAge}, plan to ${a.spouse.endAge}`);
    }
    lines.push('');

    const totalBalance = scenario.accounts.reduce((s, x) => s + x.balance, 0);
    const totalContrib = scenario.accounts.reduce((s, x) => s + x.annualContribution + x.employerMatch, 0);
    lines.push(`**Accounts** (total: ${formatCurrency(totalBalance)}, annual savings: ${formatCurrency(totalContrib)}):`);
    for (const acct of scenario.accounts) {
      lines.push(
        `  - ${acct.name} (${prettify(acct.type)}): ${formatCurrency(acct.balance)} @ ${formatPercent(acct.annualReturn)}, contributing ${formatCurrency(acct.annualContribution)}/yr${acct.employerMatch > 0 ? ` + ${formatCurrency(acct.employerMatch)} match` : ''}`,
      );
    }
    lines.push('');

    if (scenario.incomeSources.length > 0) {
      lines.push('**Income Sources:**');
      for (const inc of scenario.incomeSources) {
        lines.push(
          `  - ${inc.name} (${prettify(inc.type)}): ${formatCurrency(inc.annualAmount)}/yr, ages ${inc.startAge}${inc.endAge !== null ? `–${inc.endAge}` : '→end'}, ${inc.cola ? 'COLA' : 'fixed'}${inc.taxable ? ', taxable' : ''}`,
        );
      }
      lines.push('');
    }

    const preRetExpenses = scenario.expenses.filter((e) => e.preRetirement).reduce((s, e) => s + e.annualAmount, 0);
    const postRetExpenses = scenario.expenses.filter((e) => e.postRetirement).reduce((s, e) => s + e.annualAmount, 0);
    lines.push(`**Expenses** (pre-ret: ${formatCurrency(preRetExpenses)}/yr, post-ret: ${formatCurrency(postRetExpenses)}/yr):`);
    for (const exp of scenario.expenses) {
      const phase = exp.preRetirement && exp.postRetirement ? 'both' : exp.preRetirement ? 'pre-ret' : 'post-ret';
      // Surface a time-bound expense's age window so the model can reason about
      // costs that begin or end mid-plan (e.g. pet care ending at age 72, a car
      // loan paid off at 68). Omitted entirely when both bounds are null so
      // permanent expenses stay noise-free.
      const window =
        exp.startAge !== null || exp.endAge !== null
          ? ` ages ${exp.startAge ?? 'start'}→${exp.endAge ?? 'lifetime'},`
          : '';
      lines.push(`  - ${exp.name} (${prettify(exp.category)}):${window} ${formatCurrency(exp.annualAmount)}/yr [${phase}]`);
    }
    lines.push('');

    if (scenario.properties && scenario.properties.length > 0) {
      lines.push('**Properties:**');
      for (const prop of scenario.properties) {
        const equity = prop.currentValue - prop.mortgageBalance;
        lines.push(
          `  - ${prop.name} (${prettify(prop.type)}): value ${formatCurrency(prop.currentValue)}, mortgage ${formatCurrency(prop.mortgageBalance)}, equity ${formatCurrency(equity)}, plan: ${prop.planAction ?? 'undecided'}`,
        );
      }
      lines.push('');
    }

    if (scenario.events.length > 0) {
      lines.push('**Life Events:**');
      for (const ev of scenario.events) {
        lines.push(
          `  - ${ev.name || prettify(ev.type)} at age ${ev.age}: cost ${formatCurrency(ev.cost)}, proceeds ${formatCurrency(ev.proceeds)}${ev.ongoingAnnualImpact !== 0 ? `, ongoing ${formatCurrency(ev.ongoingAnnualImpact)}/yr for ${ev.ongoingDurationYears ?? '∞'} yrs` : ''}`,
        );
      }
      lines.push('');
    }

    if (result && readiness) {
      lines.push('**Projection Results:**');
      lines.push(`- Outcome: ${result.success ? 'Sustainable' : `Runs out at age ${result.depletionAge}`}`);
      lines.push(`- Nest egg at retirement: ${formatCurrency(readiness.nestEggAtRetirement)} (${formatCurrency(readiness.nestEggAtRetirementReal)} in today's $)`);
      lines.push(`- First-year withdrawal rate: ${formatPercent(readiness.neededWithdrawalRate)} (safe: ${formatPercent(a.safeWithdrawalRate)})`);
      lines.push(`- First-year income: ${formatCurrency(readiness.firstYearIncome)}`);
      lines.push(`- First-year expenses: ${formatCurrency(readiness.firstYearExpenses)}`);
      lines.push(`- Final assets: ${formatCurrency(result.finalAssetsReal)} (today's $)`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export const SYSTEM_PROMPT = `You are a retirement planning assistant in the retirementMe-Off app. You fact-check plans, suggest improvements, and propose alternative scenarios.

STYLE — follow strictly:
- No preamble, no narration of your own thinking. Do NOT write "Let me think", "I'll analyze", "Oh I see", or any similar filler. Start with the answer.
- Be terse. Short bullets and bold labels only. No paragraph intros, no "In summary", no recaps.
- Lead with findings ranked by severity (Critical → Minor), most important first.
- Reference actual numbers from the plan ($X, Y%, age Z). No vague claims.
- Disqualify yourself from regulated advice: note you are an AI, not a certified financial planner, when giving recommendations.

OUTPUT FORMAT:
- Use bullet points and **bold** for key findings.
- Hard caps: max 12 bullets per section, max 4 sections, one-line bullets.
- If you need more than that, the user asked too broad a question — say so and ask them to scope it.

SCENARIO SUGGESTIONS — when proposing scenario changes, embed this block in your response:
<scenario>
{
  "name": "Scenario name",
  "description": "Brief description of what changes and why",
  "assumptions": { "retirementAge": 62, "safeWithdrawalRate": 0.035 }
}
</scenario>
Only include assumption fields that should change. Omit fields that stay the same.

CONTENT:
- Use evidence-based rules of thumb (4% rule, asset allocation, tax diversification) where relevant.
- Flag issues clearly: unrealistic returns, missing expenses, tax inefficiencies, longevity risk, concentration risk.`;

/**
 * Call an AI provider's chat completions API in **streaming** mode.
 *
 * Returns an `AsyncIterable<string>` that yields content chunks as they arrive
 * from the model — typically every 30-100ms. The caller pulls chunks via
 * `for await (const chunk of stream)` and decides what to do with each
 * (typically: append to a placeholder message in the chat history).
 *
 * Works against any OpenAI-compatible endpoint that supports server-sent
 * events (`stream: true` in the request body). No-tool, no-tools — just text.
 *
 * For non-streaming callers (tests, sync code), wrap with `await streamToString()`.
 *
 * The HTTP error-extraction logic mirrors the pre-streaming version: a
 * 4xx/5xx response throws before any chunks are read.
 */
export async function* callAI(
  providerId: string,
  apiKey: string,
  model: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  customEndpoint = '',
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const provider = getProvider(providerId);
  const endpoint = resolveEndpoint(providerId, customEndpoint);
  if (!endpoint) {
    throw new Error('No API endpoint set. Enter your endpoint URL in Settings.');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: provider.authHeader(apiKey),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      // Generation cap. 1500 tokens (~1100 words) was cutting off thorough
      // plan analyses mid-sentence. 4096 leaves headroom for a full fact-check
      // while staying under every provider's output limit.
      max_tokens: 4096,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `${provider.label} API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) {
        msg = parsed.error.message;
      } else if (parsed.message) {
        msg = parsed.message;
      } else if (parsed.base_resp?.status_msg) {
        msg = parsed.base_resp.status_msg;
      }
      if (response.status === 400 && parsed.base_resp) {
        msg += ` (status code: ${parsed.base_resp.status_code ?? 'unknown'})`;
      }
      if (parsed.error?.param) {
        msg += ` [param: ${parsed.error.param}]`;
      }
    } catch {
      if (errorText) msg = `${msg}: ${errorText.slice(0, 300)}`;
    }
    throw new Error(msg);
  }

  if (!response.body) {
    throw new Error('No response body received (streaming unsupported?).');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line (\n\n). Each event's
      // lines start with "data: " — parse each in turn and yield any
      // delta.content chunks. `[DONE]` is the terminal sentinel.
      let sep: number;
      let safety = 0;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        if (++safety > 100) break; // paranoia: avoid infinite loop on bad framing
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) yield delta;
          } catch {
            // Malformed chunk — skip silently rather than aborting mid-stream.
          }
        }
      }
    }
  } finally {
    // If the caller aborted, cancel the reader to release the underlying
    // network connection promptly. releaseLock() alone leaves the body
    // stream open until GC. Cancel is a no-op if the stream already ended.
    try {
      if (signal?.aborted) await reader.cancel();
    } catch { /* already closed */ }
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

/** Consume a callAI stream into a single string. Useful for tests, sync
 *  code paths, or any caller that doesn't want to deal with chunks. */
export async function streamToString(
  providerId: string,
  apiKey: string,
  model: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  customEndpoint = '',
): Promise<string> {
  let out = '';
  for await (const chunk of callAI(providerId, apiKey, model, messages, customEndpoint)) {
    out += chunk;
  }
  return out;
}

/**
 * Parse a scenario suggestion from the AI response.
 */
export function parseScenarioSuggestion(content: string): ScenarioSuggestion | undefined {
  const match = content.match(/<scenario>\s*([\s\S]*?)\s*<\/scenario>/i);
  if (!match) return undefined;

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed.name === 'string') {
      return {
        name: parsed.name,
        description: parsed.description ?? '',
        assumptions: parsed.assumptions,
      };
    }
  } catch {
    // Invalid JSON, ignore
  }
  return undefined;
}

/**
 * Strip the <scenario> JSON block from the response for display.
 */
export function stripScenarioBlock(content: string): string {
  return content.replace(/<scenario>\s*[\s\S]*?\s*<\/scenario>/i, '').trim();
}

/**
 * Strip <think>, <reasoning>, <reflection>, and similar chain-of-thought blocks.
 * Some models (e.g. MiniMax-M1, GLM reasoning) emit these and they should
 * never be shown to the user.
 */
export function stripThinkBlocks(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<reflection>[\s\S]*?<\/reflection>/gi, '')
    .replace(/<\/?(?:think|thinking|reasoning|reflection)\s*\/?>/gi, '')
    .trim();
}