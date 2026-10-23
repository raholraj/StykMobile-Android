/** Multi-provider AI. CapacitorHttp on Android. Models updated Oct 2026. */

export const AI_PROVIDERS = Object.freeze({
  groq: {
    id: 'groq', name: 'Groq', free: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'allam-2-7b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
    ],
    defaultModel: 'openai/gpt-oss-20b',
    keyUrl: 'https://console.groq.com/keys',
    note: 'FREE no card. Best: openai/gpt-oss-20b',
  },
  gemini: {
    id: 'gemini', name: 'Google Gemini', free: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'FREE Google AI Studio key',
  },
  openrouter: {
    id: 'openrouter', name: 'OpenRouter', free: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'openrouter/free',
      'meta-llama/llama-3.3-8b-instruct:free',
      'google/gemma-3n-e4b-it:free',
      'qwen/qwen3-8b:free',
      'qwen/qwen3-14b:free',
      'deepseek/deepseek-r1-0528-qwen3-8b:free',
      'mistralai/devstral-small:free',
      'meta-llama/llama-4-scout:free',
      'meta-llama/llama-4-maverick:free',
      'microsoft/phi-4-reasoning:free',
    ],
    defaultModel: 'openrouter/free',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Use openrouter/free. 402 = credits needed → switch to Groq',
  },
  openai: {
    id: 'openai', name: 'OpenAI', free: false,
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys', note: 'Paid',
  },
  anthropic: {
    id: 'anthropic', name: 'Anthropic Claude', free: false,
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
    defaultModel: 'claude-3-5-haiku-latest',
    keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Paid',
  },
  custom: {
    id: 'custom', name: 'Custom (OpenAI-compatible)', free: true,
    baseUrl: '', models: ['default'], defaultModel: 'default', keyUrl: '',
    note: 'Ollama / LM Studio',
  },
});

export const AI_SETTINGS_KEY = 'stykanimate.ai.settings.v1';

export function defaultAiSettings() {
  return {
    enabled: false, provider: 'groq', apiKey: '',
    model: AI_PROVIDERS.groq.defaultModel,
    customBaseUrl: 'http://localhost:11434/v1', customModel: 'llama3.2',
    temperature: 0.4, maxTokens: 4096,
  };
}

export function loadAiSettings() {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return defaultAiSettings();
    return { ...defaultAiSettings(), ...JSON.parse(raw) };
  } catch { return defaultAiSettings(); }
}

export function saveAiSettings(settings) {
  const next = { ...defaultAiSettings(), ...settings };
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

async function httpRequest({ url, method = 'POST', headers = {}, body, signal }) {
  try {
    const Cap = globalThis.Capacitor;
    if (Cap?.isNativePlatform?.() && Cap?.Plugins?.CapacitorHttp) {
      const res = await Cap.Plugins.CapacitorHttp.request({
        url, method, headers,
        data: body ? JSON.parse(body) : undefined,
        connectTimeout: 60000, readTimeout: 120000,
      });
      const status = res.status ?? 0;
      const data = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? {});
      return {
        ok: status >= 200 && status < 300, status,
        text: async () => data,
        json: async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data),
      };
    }
  } catch (e) { console.warn('[Styk AI] CapacitorHttp fallback', e); }
  return fetch(url, { method, headers, body, signal });
}

export async function chatCompletion({ messages, settings, signal } = {}) {
  const s = settings || loadAiSettings();
  if (!s.enabled) throw new Error('AI disabled. ⚙ → Enable AI + Save.');
  if (!s.apiKey?.trim() && s.provider !== 'custom') {
    throw new Error('No key. ⚙ → Groq → console.groq.com/keys');
  }
  const provider = AI_PROVIDERS[s.provider] || AI_PROVIDERS.groq;
  const model = s.provider === 'custom' ? (s.customModel || 'default') : (s.model || provider.defaultModel);

  if (s.provider === 'gemini') return geminiChat({ messages, apiKey: s.apiKey, model, temperature: s.temperature, maxTokens: s.maxTokens, signal });
  if (s.provider === 'anthropic') return anthropicChat({ messages, apiKey: s.apiKey, model, temperature: s.temperature, maxTokens: s.maxTokens, signal });

  const baseUrl = s.provider === 'custom'
    ? (s.customBaseUrl || 'http://localhost:11434/v1').replace(/\/$/, '')
    : provider.baseUrl;
  const headers = { 'Content-Type': 'application/json' };
  if (s.apiKey?.trim()) headers.Authorization = `Bearer ${s.apiKey.trim()}`;
  if (s.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://app.stykanimate.com';
    headers['X-Title'] = 'StykAnimate AI';
  }

  const res = await httpRequest({
    url: `${baseUrl}/chat/completions`, method: 'POST', headers,
    body: JSON.stringify({ model, messages, temperature: s.temperature ?? 0.4, max_tokens: s.maxTokens ?? 4096 }),
    signal,
  });
  if (!res.ok) throw new Error(parseProviderError(s.provider, res.status, await res.text().catch(() => ''), model));
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from AI.');
  return text;
}

async function geminiChat({ messages, apiKey, model, temperature, maxTokens, signal }) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  const body = { contents, generationConfig: { temperature: temperature ?? 0.4, maxOutputTokens: maxTokens ?? 4096 } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await httpRequest({ url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) throw new Error(parseProviderError('gemini', res.status, await res.text().catch(() => ''), model));
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('Empty Gemini response.');
  return text;
}

async function anthropicChat({ messages, apiKey, model, temperature, maxTokens, signal }) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const converted = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const res = await httpRequest({
    url: 'https://api.anthropic.com/v1/messages', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens ?? 4096, temperature: temperature ?? 0.4, system: system || undefined, messages: converted }),
    signal,
  });
  if (!res.ok) throw new Error(parseProviderError('anthropic', res.status, await res.text().catch(() => ''), model));
  const data = await res.json();
  const text = data.content?.filter(c => c.type === 'text').map(c => c.text).join('') || '';
  if (!text) throw new Error('Empty Claude response.');
  return text;
}

function parseProviderError(provider, status, body, model) {
  let detail = '';
  try { const j = JSON.parse(body); detail = j.error?.message || j.message || j.error || body.slice(0, 240); }
  catch { detail = (body || '').slice(0, 240); }
  if (status === 401 || status === 403) return `Invalid API key (${provider}). ⚙ me naya key daalo.`;
  if (status === 402) return `${provider}: credits chahiye. FREE ke liye Provider=Groq, Model=openai/gpt-oss-20b use karo.`;
  if (status === 429) return `Rate limit (${provider}). 1 min wait ya doosra model.`;
  if (status === 404) return `Model "${model}" nahi mila. ⚙ → Groq → openai/gpt-oss-20b try karo.`;
  if (status === 0) return `Network error (${provider}).`;
  return `${provider} (${status}): ${detail || 'unknown'}`;
}
