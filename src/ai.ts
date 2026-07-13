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
import { formatCurrency, formatPercent } from './format';
import { getReadinessSummary } from './engine';

const prettify = (s: string): string =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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
    id: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    authHeader: (key) => `Bearer ${key}`,
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', hint: 'Most capable' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', hint: 'Fast & affordable' },
    ],
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    endpoint: 'https://api.minimax.io/v1/chat/completions',
    authHeader: (key) => `Bearer ${key}`,
    models: [
      { id: 'MiniMax-M3', label: 'MiniMax-M3', hint: 'Reasoning model (flagship)' },
      { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax-M2.7-highspeed', hint: 'Balanced conversational' },
    ],
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    endpoint: 'https://api.z.ai/api/paas/v4/chat/completions',
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
];

export const DEFAULT_AI_PROVIDER = 'openai';
export const DEFAULT_AI_MODEL = 'gpt-4o-mini';

/** Get a provider by ID (falls back to OpenAI) */
export function getProvider(providerId: string): AiProvider {
  return AI_PROVIDERS.find((p) => p.id === providerId) ?? AI_PROVIDERS[0];
}

/** Get the default model for a provider */
export function getDefaultModel(providerId: string): string {
  const provider = getProvider(providerId);
  return provider.models[provider.models.length - 1]?.id ?? '';
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
    label: '📋 Fact-check my plan',
    prompt:
      'Please fact-check my retirement plan. Review all assumptions (return rates, inflation, withdrawal rate, tax rate, timeline) for realism. Check if I have adequate expense coverage, appropriate account diversification, and reasonable income sources. Flag anything that seems unrealistic, missing, or potentially risky.',
  },
  {
    id: 'suggest',
    label: '💡 Suggest improvements',
    prompt:
      'Review my retirement plan and suggest specific improvements. Consider: tax optimization strategies, expense gaps, savings rate adequacy, Social Security claiming strategy, account diversification, and any risks I might be overlooking. Be specific and actionable.',
  },
  {
    id: 'scenario',
    label: '🔄 Create a scenario',
    prompt:
      'Based on my current plan, create an alternative retirement scenario. Consider a different retirement age, adjusted savings rate, or modified spending pattern. Use the createScenario JSON format to propose specific changes. Explain your reasoning.',
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
      lines.push(`  - ${exp.name} (${prettify(exp.category)}): ${formatCurrency(exp.annualAmount)}/yr [${phase}]`);
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

export const SYSTEM_PROMPT = `You are a knowledgeable retirement planning assistant integrated into the retirementMe-Off app. You help users analyze their retirement plan, fact-check assumptions, suggest improvements, and create alternative scenarios.

Guidelines:
- Be specific and actionable. Reference actual numbers from the user's plan.
- For financial advice, note that you are an AI assistant, not a certified financial planner.
- Keep responses concise and well-structured. Use bullet points and bold for key findings.
- When suggesting scenario changes, use this JSON format embedded in your response:
  <scenario>
  {
    "name": "Scenario name",
    "description": "Brief description of what changes and why",
    "assumptions": { "retirementAge": 62, "safeWithdrawalRate": 0.035 }
  }
  </scenario>
  Only include assumption fields that should change. Omit fields that stay the same.
- Focus on realistic, evidence-based recommendations. Reference common rules of thumb (4% rule, etc.) when relevant.
- If you notice potential issues (unrealistic returns, missing expenses, tax inefficiencies), flag them clearly.`;

/**
 * Call an AI provider's chat completions API.
 * Supports OpenAI, MiniMax, and Z.ai (GLM).
 */
export async function callAI(
  providerId: string,
  apiKey: string,
  model: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
): Promise<string> {
  const provider = getProvider(providerId);
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: provider.authHeader(apiKey),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1500,
    }),
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

  const data = await response.json();

  const choices = data.choices;
  if (choices && Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    const content = first?.message?.content ?? first?.text ?? first?.delta?.content ?? '';
    if (content) return content;
    // Choice exists but content is empty — inspect why
    const finishReason = first?.finish_reason ?? 'unknown';
    throw new Error(
      `Model returned no content. finish_reason: ${finishReason}. ` +
      `Try a different model or increase max_tokens.`,
    );
  }

  const fallbackContent = data.content ?? data.text ?? data.output ?? data.result;
  if (typeof fallbackContent === 'string') return fallbackContent;

  if (data.created_message?.content) {
    const msg = data.created_message.content;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) {
      const text = msg.map((p: { text?: string; content?: string }) => p.text ?? p.content ?? '').join('\n');
      if (text) return text;
    }
  }

  const responseKeys = Object.keys(data).join(', ');
  const errorMsg = data.error?.message || data.message || data.base_resp?.status_msg || '';
  throw new Error(
    `No response content received. Response keys: [${responseKeys}]` +
    (errorMsg ? `. Error: ${errorMsg}` : '') +
    `. Check that your API key and model name are correct for ${provider.label}.`,
  );
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