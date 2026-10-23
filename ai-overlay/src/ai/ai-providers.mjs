/**
 * Multi-provider AI client. Uses CapacitorHttp on Android (bypasses CORS) and fetch on web.
 */

export const AI_PROVIDERS = Object.freeze({
  groq: {
    id: 'groq', name: 'Groq', free: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier – fast. Best free option.',
  },
  gemini: {
    id: 'gemini', name: 'Google Gemini', free: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier with good limits.',
  },
  openrouter: {
    id: 'openrouter', name: 'OpenRouter', free: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['google/gemma-2-9b-it:free', 'meta-llama/llama-3.2-3b-instruct:free', 'qwen/qwen-2.5-7b-instruct:free', 'mistralai/mistral-7b-instruct:free', 'openai/gpt-4o-mini'],
    defaultModel: 'google/gemma-2-9b-it:free',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Many free models + paid.',
  },
  openai: {
    id: 'openai', name: 'OpenAI', free: false,
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Paid. High quality.',
  },
  anthropic: {
    id: 'anthropic', name: 'Anthropic Claude', free: false,
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
    defaultModel: 'claude-3-5-haiku-latest',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Paid. Excellent reasoning.',
  },
  custom: {
    id: 'custom', name: 'Custom (OpenAI-compatible)', free: true,
    baseUrl: '', models: ['default'], defaultModel: 'default', keyUrl: '',
    note: 'LM Studio, Ollama, Together, etc.',
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
        ok: status >= 200 && status < 300,
        status,
        text: async () => data,
        json: async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data),
      };
    }
  } catch (e) {
    console.warn('[Styk AI] CapacitorHttp failed, fetch fallback', e);
  }
  return fetch(url, { method, headers, body, signal });
}

export async function chatCompletion({ messages, settings, signal } = {}) {
  const s = settings || loadAiSettings();
  if (!s.enabled) throw new Error('AI disabled. AI panel → ⚙ → Enable AI.');
  if (!s.apiKey?.trim() && s.provider !== 'custom') {
    throw new Error('No API key. AI panel → ⚙ → paste Groq/Gemini key.');
  }
  const provider = AI_PROVIDERS[s.provider] || AI_PROVIDERS.groq;
  const model = s.provider === 'custom' ? (s.customModel || 'default') : (s.model || provider.defaultModel);

  if (s.provider === 'gemini') {
    return geminiChat({ messages, apiKey: s.apiKey, model, temperature: s.temperature, maxTokens: s.maxTokens, signal });
  }
  if (s.provider === 'anthropic') {
    return anthropicChat({ messages, apiKey: s.apiKey, model, temperature: s.temperature, maxTokens: s.maxTokens, signal });
  }

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
  if (!res.ok) throw new Error(parseProviderError(s.provider, res.status, await res.text().catch(() => '')));
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
  if (!res.ok) throw new Error(parseProviderError('gemini', res.status, await res.text().catch(() => '')));
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('Empty response from Gemini.');
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
  if (!res.ok) throw new Error(parseProviderError('anthropic', res.status, await res.text().catch(() => '')));
  const data = await res.json();
  const text = data.content?.filter(c => c.type === 'text').map(c => c.text).join('') || '';
  if (!text) throw new Error('Empty response from Claude.');
  return text;
}

function parseProviderError(provider, status, body) {
  let detail = '';
  try { const j = JSON.parse(body); detail = j.error?.message || j.message || j.error || body.slice(0, 200); }
  catch { detail = (body || '').slice(0, 200); }
  if (status === 401 || status === 403) return `Invalid API key for ${provider}.`;
  if (status === 429) return `Rate limit on ${provider}. Wait or switch model.`;
  if (status === 404) return `Model not found on ${provider}.`;
  if (status === 0) return `Network error reaching ${provider}.`;
  return `${provider} error (${status}): ${detail || 'unknown'}`;
}
