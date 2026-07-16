import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlanStore } from './store';
import { runProjection } from './engine';
import {
  AI_PROVIDERS,
  CUSTOM_PROVIDER_ID,
  QUICK_ACTIONS,
  SYSTEM_PROMPT,
  buildPlanContext,
  callAI,
  getProvider,
  getDefaultModel,
  parseScenarioSuggestion,
  stripScenarioBlock,
  stripThinkBlocks,
  type ChatMessage,
  type ScenarioSuggestion,
} from './ai';
import { formatPercent } from './format';

const PIN_STORAGE_KEY = 'ai-chat-pinned';

/**
 * Translate raw API/network errors into a friendly message with an actionable
 * hint. The underlying error from callAI() is often a status code or opaque
 * provider string ("Failed to fetch", "401 Unauthorized") that means nothing
 * to a non-developer. We keep the original detail but prepend a plain-English
 * diagnosis + suggested fix so the user knows what to do next.
 *
 * Patterns are matched loosely so provider-specific wording still maps.
 */
function humanizeError(raw: string): string {
  const lower = raw.toLowerCase();

  // Network-level failures (CORS, offline, DNS, blocked). Browsers surface all
  // of these as "Failed to fetch" or "NetworkError" — there's no status code.
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror'.toLowerCase()) ||
    lower.includes('load failed') ||
    lower.includes('network request failed')
  ) {
    return `Couldn't reach the AI provider. This is usually a network or connection issue — check your internet connection and try again. (${raw})`;
  }

  // Auth errors — the API key is missing, invalid, or lacks permission.
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('login fail') ||
    lower.includes('authentication') ||
    lower.includes('api secret key') ||
    lower.includes('not authorized')
  ) {
    return `Your API key was rejected. Check that the key is correct, hasn't been revoked, and belongs to the selected provider in Settings. (${raw})`;
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return `The provider refused access (403). Your API key may lack permission for this model, or the account may be suspended. (${raw})`;
  }

  // Rate limiting / quota.
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return `The provider's rate or quota limit was hit (429). Wait a moment and try again, or check your account usage. (${raw})`;
  }

  // Model not found / unavailable — common with custom endpoints or typos.
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('does not exist'))) {
    return `That model wasn't found. Pick a different model in Settings, or check the spelling if you're using a custom endpoint. (${raw})`;
  }

  // No custom endpoint configured.
  if (lower.includes('no api endpoint set')) {
    return raw;
  }

  // Generic fallback — keep the original detail so nothing is hidden.
  return raw;
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * AI Chat Assistant — can run as a floating modal or pinned sidebar.
 *
 * Lets the user chat with an AI about their retirement plan.
 * Supports fact-checking, suggestions, and scenario creation.
 * All data stays client-side; the user provides their own API key.
 */
export function AiChat() {
  const store = usePlanStore();
  const messages = usePlanStore((s) => s.chatHistory);
  const appendChatMessage = usePlanStore((s) => s.appendChatMessage);
  const setChatHistory = usePlanStore((s) => s.setChatHistory);
  const clearChat = usePlanStore((s) => s.clearChat);
  const [isOpen, setIsOpen] = useState(false);
  const [pinned, setPinned] = useState(() => loadStored<boolean>(PIN_STORAGE_KEY, false));
  const [showSettings, setShowSettings] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(store.aiApiKeys[store.aiProvider] ?? '');
  const [providerInput, setProviderInput] = useState(store.aiProvider);
  const [modelInput, setModelInput] = useState(store.aiModel);
  const [customEndpointInput, setCustomEndpointInput] = useState(store.aiCustomEndpoint);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasApiKey = (store.aiApiKeys[store.aiProvider] ?? '').length > 0;

  // Auto-dismiss transient UI states when their precondition stops holding,
  // so the user never sees stale chips or a half-cleared confirm.
  useEffect(() => {
    if (messages.length === 0) {
      setShowSuggestions(false);
      setConfirmingClear(false);
    }
  }, [messages.length]);
  useEffect(() => {
    if (showSettings) setShowSuggestions(false);
  }, [showSettings]);

  // Validate that the stored model exists for the current provider.
  // The custom provider has no model list, so skip validation for it.
  useEffect(() => {
    if (store.aiProvider === CUSTOM_PROVIDER_ID) return;
    const provider = getProvider(store.aiProvider);
    const isValid = provider.models.some((m) => m.id === store.aiModel);
    if (!isValid) {
      store.setAiModel(getDefaultModel(store.aiProvider));
    }
  }, [store.aiProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && hasApiKey) {
      inputRef.current?.focus();
    }
  }, [isOpen, hasApiKey]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const activeKey = store.aiApiKeys[store.aiProvider] ?? '';
      if (!activeKey) {
        // Surface why nothing happened instead of silently flipping to the
        // settings panel, which reads like a bug (textarea won't clear, no
        // message appears). A visible error + opening settings gives the
        // user both the explanation and the path to fix it.
        setError(`Add an API key for ${getProvider(store.aiProvider).label} to send messages.`);
        setShowSettings(true);
        return;
      }

      const userMsg: ChatMessage = {
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

        appendChatMessage(userMsg);
        setInput('');
        setLoading(true);
        setError(null);

        // Pre-create a placeholder assistant message so the user sees a
        // cursor immediately and tokens can stream in as they arrive.
        const placeholder: ChatMessage = {
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };
        appendChatMessage(placeholder);

        try {
          const results = store.plan.scenarios.map((s) => runProjection(s));
          const planContext = buildPlanContext(store.plan, results, store.activeScenarioId);

          // Send prior turns with their ORIGINAL raw content (not the
          // stripped display version) so the model keeps full context.
          const historyForApi = messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.rawContent ?? m.content,
          }));
          historyForApi.push({ role: 'user', content: text.trim() });

          const apiMessages = [
            { role: 'system' as const, content: SYSTEM_PROMPT },
            { role: 'system' as const, content: `Here is the user's current plan data:\n\n${planContext}` },
            ...historyForApi,
          ];

          // Stream chunks from the API; update the placeholder message after
          // each one so the user sees the answer build in real time.
          let accumulated = '';
          let suggestion: ScenarioSuggestion | undefined;
          for await (const chunk of callAI(
            store.aiProvider,
            activeKey,
            store.aiModel,
            apiMessages,
            store.aiCustomEndpoint,
          )) {
            accumulated += chunk;
            // Re-check the scenario block on each chunk — the model may emit
            // a complete <scenario> tag mid-stream and we want the "Apply"
            // card to appear as soon as it's parseable.
            const detected = parseScenarioSuggestion(accumulated);
            if (detected) suggestion = detected;
            const display = stripScenarioBlock(stripThinkBlocks(accumulated));
            usePlanStore.setState((s) => {
              const next = [...s.chatHistory];
              const last = next[next.length - 1];
              if (last) {
                next[next.length - 1] = {
                  ...last,
                  content: display,
                  rawContent: accumulated,
                  suggestion,
                };
              }
              return { chatHistory: next };
            });
          }
        } catch (e) {
          // Stream failed mid-answer. Show what we got so far plus the error
          // footer, rather than discarding the partial response.
          const raw = e instanceof Error ? e.message : 'Stream interrupted';
          const msg = humanizeError(raw);
          setError(msg);
          usePlanStore.setState((s) => {
            const next = [...s.chatHistory];
            const last = next[next.length - 1];
            if (last) {
              const partial = stripScenarioBlock(stripThinkBlocks(last.rawContent ?? ''));
              next[next.length - 1] = {
                ...last,
                content: partial
                  ? `${partial}\n\n⚠️ ${msg}`
                  : `⚠️ ${msg}`,
              };
            }
            return { chatHistory: next };
          });
        } finally {
          setLoading(false);
        }
      },
    [messages, loading, store, appendChatMessage],
  );

  const handleApplySuggestion = () => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.suggestion) {
      store.applyScenarioSuggestion(lastMsg.suggestion);
      // Persist that the suggestion has been applied so it doesn't render again.
      setChatHistory(
        messages.map((m, i) =>
          i === messages.length - 1 ? { ...m, suggestion: undefined } : m,
        ),
      );
    }
  };

  // Apply a quick-action prompt: fill the textarea (don't auto-send, so the
  // user can edit before committing). Works for both welcome chips and the
  // header Suggestions panel.
  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
    setShowSuggestions(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Clear-history two-step: 🗑️ reveals a ✓/✕ confirm bar; ✓ clears.
  const handleClearConfirm = () => {
    clearChat();
    setConfirmingClear(false);
  };

  const handleSaveSettings = () => {
    store.setAiProvider(providerInput);
    store.setAiApiKey(providerInput, apiKeyInput.trim());
    store.setAiModel(modelInput);
    if (providerInput === CUSTOM_PROVIDER_ID) {
      store.setAiCustomEndpoint(customEndpointInput.trim());
      store.setAiCustomModel(modelInput.trim());
    }
    setShowSettings(false);
  };

  const handleProviderChange = (newProviderId: string) => {
    setProviderInput(newProviderId);
    if (newProviderId === CUSTOM_PROVIDER_ID) {
      setModelInput(store.aiCustomModel || '');
    } else {
      setModelInput(getDefaultModel(newProviderId));
    }
    // Load the key the user previously entered for this provider (or empty),
    // so switching providers never silently drops a saved key.
    setApiKeyInput(store.aiApiKeys[newProviderId] ?? '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // When pinned, auto-open. When unpinned, only show FAB.
  const effectiveOpen = pinned || isOpen;

  // Toggle the .app--ai-pinned class so the main content gets right-padding
  // when the chat sidebar is pinned, preventing content from being hidden.
  useEffect(() => {
    const appEl = document.querySelector('.app');
    if (appEl) {
      appEl.classList.toggle('app--ai-pinned', pinned);
    }
  }, [pinned]);

  // Escape closes the floating chat (not the pinned sidebar — that's a
  // persistent docked panel, closing it via Escape would surprise the user).
  // Also implements a focus trap so Tab cycles within the panel while open.
  const close = () => {
    if (pinned) return; // pinned stays until explicitly unpinned
    setIsOpen(false);
  };
  useEffect(() => {
    if (!effectiveOpen || pinned) return;
    const panel = panelRef.current;
    if (!panel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      // Focus trap: when Tabbing, keep focus inside the panel.
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [effectiveOpen, pinned]);

  // Toggle pin and persist.
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    try {
      localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (next) setIsOpen(true);
  };

  return (
    <>
      {!pinned && (
        <button
          className="ai-chat-fab"
          onClick={() => setIsOpen(!isOpen)}
          title="AI Assistant"
          aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
          aria-expanded={isOpen}
        >
          {isOpen ? '✕' : <><span aria-hidden="true">🤖</span><span className="ai-chat-fab-label">Ask AI</span></>}
        </button>
      )}

      {effectiveOpen && (
        <div
          ref={panelRef}
          className={`ai-chat-panel${pinned ? ' ai-chat-panel--pinned' : ''}`}
          style={pinned ? { width: '420px' } : undefined}
          role="dialog"
          aria-modal={!pinned ? 'true' : undefined}
          aria-label="AI Assistant"
        >
          <div className="ai-chat-header">
            <span className="ai-chat-title">🤖 AI Assistant</span>
            <div className="ai-chat-header-actions">
              <button
                className={`ai-chat-icon-btn${pinned ? ' active' : ''}`}
                onClick={togglePin}
                title={pinned ? 'Unpin from right side' : 'Pin to right side'}
                aria-label={pinned ? 'Unpin from right side' : 'Pin to right side'}
              >
                {pinned ? '📌' : '📍'}
              </button>
              <button
                className={`ai-chat-icon-btn${showSuggestions ? ' active' : ''}`}
                onClick={() => { setShowSettings(false); setShowSuggestions(!showSuggestions); }}
                title="Show prompt suggestions"
                aria-label="Show prompt suggestions"
                aria-expanded={showSuggestions}
              >
                💡
              </button>
              <button
                className="ai-chat-icon-btn"
                onClick={() => setShowSettings(!showSettings)}
                title="Settings"
                aria-label="AI settings"
              >
                ⚙️
              </button>
              {messages.length > 0 && (
                <button
                  className={`ai-chat-icon-btn${confirmingClear ? ' active' : ''}`}
                  onClick={() => setConfirmingClear(!confirmingClear)}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                  aria-expanded={confirmingClear}
                >
                  🗑️
                </button>
              )}
              <button className="ai-chat-icon-btn" onClick={() => { setIsOpen(false); setPinned(false); try { localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(false)); } catch { /* ignore */ } }} title="Close" aria-label="Close AI Assistant">✕</button>
            </div>
          </div>

          {showSettings && (
            <div className="ai-chat-settings">
              <label className="ai-chat-label">
                Provider
                <select value={providerInput} onChange={(e) => handleProviderChange(e.target.value)} className="ai-chat-select">
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="ai-chat-label">
                API Key
                <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="Enter your API key..." className="ai-chat-input" />
              </label>
              <label className="ai-chat-label">
                Model
                {providerInput === CUSTOM_PROVIDER_ID ? (
                  <input type="text" value={modelInput} onChange={(e) => setModelInput(e.target.value)} placeholder="e.g. gpt-4o-mini" className="ai-chat-input" />
                ) : (
                  <select value={modelInput} onChange={(e) => setModelInput(e.target.value)} className="ai-chat-select">
                    {getProvider(providerInput).models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
                    ))}
                  </select>
                )}
              </label>
              {providerInput === CUSTOM_PROVIDER_ID && (
                <label className="ai-chat-label">
                  API Endpoint URL
                  <input type="text" value={customEndpointInput} onChange={(e) => setCustomEndpointInput(e.target.value)} placeholder="https://your-host/chat/completions" className="ai-chat-input" />
                </label>
              )}
              <button className="ai-chat-save-btn" onClick={handleSaveSettings}>Save</button>
              <p className="ai-chat-disclaimer">
                Your API key is stored in your browser only. It is sent directly to {getProvider(providerInput).label} and never to any other server.
              </p>
            </div>
          )}

          {confirmingClear && (
            <div className="ai-chat-clear-confirm" role="alert">
              Clear all messages? This cannot be undone.
              <div className="ai-chat-clear-confirm-actions">
                <button className="ai-chat-clear-confirm-yes" onClick={handleClearConfirm} aria-label="Confirm clear conversation">✓ Yes</button>
                <button className="ai-chat-clear-confirm-no" onClick={() => setConfirmingClear(false)} aria-label="Cancel clear">✕</button>
              </div>
            </div>
          )}

          {/* Suggestions popover — pinned OUTSIDE the scrollable messages
              region (same fix as the clear-confirm bar above) so the 💡
              button stays useful in a long, scrolled conversation. */}
          {showSuggestions && messages.length > 0 && !showSettings && (
            <div className="ai-chat-suggestions-panel">
              <div className="ai-chat-suggestions-label">Try asking</div>
              <div className="ai-chat-quick-actions">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.id}
                    className="ai-chat-quick-btn"
                    onClick={() => handlePromptClick(qa.prompt)}
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ai-chat-messages">

            {messages.length === 0 && !showSettings && (
              <div className="ai-chat-welcome">
                <p className="ai-chat-welcome-title">
                  {hasApiKey
                    ? 'Ask me about your retirement plan!'
                    : `Add a ${getProvider(store.aiProvider).label} API key to get started`}
                </p>
                {!hasApiKey && (
                  <button className="ai-chat-quick-btn" onClick={() => setShowSettings(true)}>
                    ⚙️ Configure API Key
                  </button>
                )}
                {hasApiKey && (
                  <div className="ai-chat-quick-actions">
                    {QUICK_ACTIONS.map((qa) => (
                      <button
                        key={qa.id}
                        className="ai-chat-quick-btn"
                        onClick={() => handlePromptClick(qa.prompt)}
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
                <div className="ai-chat-msg-content">
                  <FormattedContent text={msg.content} />
                </div>
                {msg.suggestion && (
                  <div className="ai-chat-suggestion">
                    <div className="ai-chat-suggestion-header">
                      📋 Proposed Scenario: {msg.suggestion.name}
                    </div>
                    {msg.suggestion.description && (
                      <p className="ai-chat-suggestion-desc">{msg.suggestion.description}</p>
                    )}
                    {msg.suggestion.assumptions && (
                      <div className="ai-chat-suggestion-changes">
                        {Object.entries(msg.suggestion.assumptions).map(([key, val]) => (
                          <span key={key} className="ai-chat-suggestion-change">
                            <strong>{key}:</strong>{' '}
                            {typeof val === 'number' && key.includes('Rate') ? formatPercent(val) : String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="ai-chat-suggestion-actions">
                      <button className="ai-chat-apply-btn" onClick={handleApplySuggestion}>
                        ✓ Create Scenario &amp; Switch to It
                      </button>
                      <p className="ai-chat-suggestion-note">
                        Creates a new scenario with these changes — your current one is kept.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="ai-chat-msg ai-chat-msg-assistant">
                <div className="ai-chat-typing">
                  <span className="ai-chat-typing-dot" />
                  <span className="ai-chat-typing-dot" />
                  <span className="ai-chat-typing-dot" />
                </div>
              </div>
            )}

            {error && (
              <div className="ai-chat-error" role="alert">
                <span>⚠️ {error}</span>
                <button
                  className="ai-chat-error-dismiss"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                  title="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="ai-chat-input-area">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasApiKey ? 'Ask about your plan...' : 'Set API key in settings ⚙️'}
              disabled={loading || !hasApiKey}
              rows={1}
              className="ai-chat-textarea"
            />
            <button
              className="ai-chat-send-btn"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim() || !hasApiKey}
              aria-label="Send message"
              title="Send message"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Lightweight markdown renderer for AI chat messages.
 * Handles: **bold**, headings (###, ##, #), bullet lists, numbered lists,
 * and paragraphs. No external dependencies.
 */
function FormattedContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag key={`list-${elements.length}`} className="ai-chat-list">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>,
      );
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Headings
    if (/^#{1,3}\s/.test(trimmed)) {
      flushList();
      const level = trimmed.match(/^(#{1,3})/)?.[1].length ?? 3;
      const content = trimmed.replace(/^#{1,3}\s/, '');
      if (level <= 2) {
        elements.push(<h4 key={i} className="ai-chat-h4">{renderInline(content)}</h4>);
      } else {
        elements.push(<h5 key={i} className="ai-chat-h5">{renderInline(content)}</h5>);
      }
      continue;
    }

    // Bullet list
    if (/^[-*•]\s/.test(trimmed)) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(trimmed.replace(/^[-*•]\s/, ''));
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(trimmed.replace(/^\d+\.\s/, ''));
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(<p key={i}>{renderInline(trimmed)}</p>);
  }

  flushList();

  return <>{elements}</>;
}

/** Render inline markdown: **bold** */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}