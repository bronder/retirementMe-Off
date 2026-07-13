import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlanStore } from './store';
import { runProjection } from './engine';
import {
  AI_MODELS,
  QUICK_ACTIONS,
  SYSTEM_PROMPT,
  buildPlanContext,
  callAI,
  parseScenarioSuggestion,
  stripScenarioBlock,
  type ChatMessage,
} from './ai';
import { formatPercent } from './format';

/**
 * AI Chat Assistant — floating button + slide-in panel.
 *
 * Lets the user chat with an AI about their retirement plan.
 * Supports fact-checking, suggestions, and scenario creation.
 * All data stays client-side; the user provides their own API key.
 */
export function AiChat() {
  const store = usePlanStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(store.aiApiKey);
  const [modelInput, setModelInput] = useState(store.aiModel);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasApiKey = store.aiApiKey.length > 0;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-focus input when opening
  useEffect(() => {
    if (isOpen && hasApiKey) {
      inputRef.current?.focus();
    }
  }, [isOpen, hasApiKey]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      if (!store.aiApiKey) {
        setShowSettings(true);
        return;
      }

      const userMsg: ChatMessage = {
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      setLoading(true);
      setError(null);

      try {
        // Build plan context for the AI
        const results = store.plan.scenarios.map((s) => runProjection(s));
        const planContext = buildPlanContext(store.plan, results, store.activeScenarioId);

        // Build the API messages: system prompt + plan context + conversation history
        const apiMessages = [
          { role: 'system' as const, content: SYSTEM_PROMPT },
          { role: 'system' as const, content: `Here is the user's current plan data:\n\n${planContext}` },
          ...newMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ];

        const response = await callAI(store.aiApiKey, store.aiModel, apiMessages);

        // Check for embedded scenario suggestion
        const suggestion = parseScenarioSuggestion(response);
        const displayContent = stripScenarioBlock(response);

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: displayContent,
          timestamp: Date.now(),
          suggestion,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get AI response';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, store],
  );

  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt);
  };

  const handleApplySuggestion = () => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.suggestion) {
      store.applyScenarioSuggestion(lastMsg.suggestion);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, suggestion: undefined } : m,
        ),
      );
    }
  };

  const handleSaveSettings = () => {
    store.setAiApiKey(apiKeyInput.trim());
    store.setAiModel(modelInput);
    setShowSettings(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Don't render the chat button if not needed
  return (
    <>
      {/* Floating button */}
      <button
        className="ai-chat-fab"
        onClick={() => setIsOpen(!isOpen)}
        title="AI Assistant"
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="ai-chat-panel">
          {/* Header */}
          <div className="ai-chat-header">
            <span className="ai-chat-title">🤖 AI Assistant</span>
            <div className="ai-chat-header-actions">
              <button
                className="ai-chat-icon-btn"
                onClick={() => setShowSettings(!showSettings)}
                title="Settings"
              >
                ⚙️
              </button>
              <button
                className="ai-chat-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="ai-chat-settings">
              <label className="ai-chat-label">
                OpenAI API Key
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="ai-chat-input"
                />
              </label>
              <label className="ai-chat-label">
                Model
                <select
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  className="ai-chat-select"
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.hint}
                    </option>
                  ))}
                </select>
              </label>
              <button className="ai-chat-save-btn" onClick={handleSaveSettings}>
                Save
              </button>
              <p className="ai-chat-disclaimer">
                Your API key is stored in your browser only. It is sent directly to OpenAI and never to any other server.
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="ai-chat-messages">
            {messages.length === 0 && !showSettings && (
              <div className="ai-chat-welcome">
                <p className="ai-chat-welcome-title">
                  {hasApiKey ? 'Ask me about your retirement plan!' : 'Set up your API key to get started'}
                </p>
                {hasApiKey ? (
                  <div className="ai-chat-quick-actions">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        className="ai-chat-quick-btn"
                        onClick={() => handleQuickAction(action.prompt)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    className="ai-chat-quick-btn"
                    onClick={() => setShowSettings(true)}
                  >
                    ⚙️ Configure API Key
                  </button>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
                <div className="ai-chat-msg-content">
                  {msg.content.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
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
                            {typeof val === 'number' && key.includes('Rate')
                              ? formatPercent(val)
                              : String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="ai-chat-suggestion-actions">
                      <button
                        className="ai-chat-apply-btn"
                        onClick={handleApplySuggestion}
                      >
                        ✓ Apply & Create Scenario
                      </button>
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
              <div className="ai-chat-error">
                ⚠️ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
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
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}