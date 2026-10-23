/**
 * Styk AI Chat panel – floating assistant that knows every feature.
 */
import { AI_PROVIDERS, loadAiSettings, saveAiSettings, chatCompletion } from './ai-providers.mjs';
import { buildSystemPrompt } from './ai-system-prompt.mjs';
import { extractAnimationBlock, applyAnimationPlan, PRESET_ANIMATIONS } from './ai-commands.mjs';

const HISTORY_KEY = 'stykanimate.ai.chat.v1';

export class AiChatPanel {
  constructor({ getEditor, getContext } = {}) {
    this.getEditor = getEditor || (() => window.__stykEditor || null);
    this.getContext = getContext || (() => ({}));
    this.messages = loadHistory();
    this.abort = null;
    this.el = null;
    this.open = false;
  }

  mount(parent = document.body) {
    if (this.el) return this.el;
    const root = document.createElement('div');
    root.id = 'styk-ai-root';
    root.innerHTML = `
      <button type="button" class="styk-ai-fab" id="styk-ai-fab" title="Styk AI Chat" aria-label="Open AI Chat">AI</button>
      <div class="styk-ai-panel" id="styk-ai-panel" hidden>
        <header class="styk-ai-header">
          <div class="styk-ai-title">
            <strong>Styk AI</strong>
            <span class="styk-ai-sub" id="styk-ai-status">Ready</span>
          </div>
          <div class="styk-ai-header-actions">
            <button type="button" class="styk-ai-icon-btn" id="styk-ai-settings" title="AI Settings">⚙</button>
            <button type="button" class="styk-ai-icon-btn" id="styk-ai-clear" title="Clear chat">⌫</button>
            <button type="button" class="styk-ai-icon-btn" id="styk-ai-close" title="Close">✕</button>
          </div>
        </header>
        <div class="styk-ai-presets" id="styk-ai-presets">
          <button type="button" data-preset="wave">Wave</button>
          <button type="button" data-preset="jump">Jump</button>
          <button type="button" data-preset="walk">Walk</button>
          <button type="button" data-preset="help">Help me animate</button>
        </div>
        <div class="styk-ai-messages" id="styk-ai-messages"></div>
        <div class="styk-ai-compose">
          <textarea id="styk-ai-input" rows="2" placeholder="Describe the animation you want… e.g. character waves then jumps"></textarea>
          <button type="button" class="styk-ai-send" id="styk-ai-send">Send</button>
        </div>
        <div class="styk-ai-settings-sheet" id="styk-ai-settings-sheet" hidden>
          <h3>AI Settings</h3>
          <label>Provider
            <select id="styk-ai-provider"></select>
          </label>
          <label>API Key
            <input type="password" id="styk-ai-key" placeholder="Paste key (stored only on this device)" autocomplete="off" />
          </label>
          <label>Model
            <select id="styk-ai-model"></select>
          </label>
          <div id="styk-ai-custom-fields" hidden>
            <label>Custom Base URL
              <input type="text" id="styk-ai-custom-url" placeholder="http://localhost:11434/v1" />
            </label>
            <label>Custom Model
              <input type="text" id="styk-ai-custom-model" placeholder="llama3.2" />
            </label>
          </div>
          <label class="styk-ai-check">
            <input type="checkbox" id="styk-ai-enabled" /> Enable AI
          </label>
          <p class="styk-ai-hint" id="styk-ai-provider-note"></p>
          <p class="styk-ai-hint">Free options: <b>Groq</b>, <b>Gemini</b>, <b>OpenRouter (free models)</b>. Key never leaves your device except to the provider you choose.</p>
          <div class="styk-ai-settings-actions">
            <a id="styk-ai-key-link" href="#" target="_blank" rel="noopener">Get free API key</a>
            <button type="button" id="styk-ai-save-settings">Save</button>
          </div>
        </div>
      </div>
    `;
    parent.appendChild(root);
    this.el = root;
    this._bind();
    this._renderMessages();
    this._fillSettingsForm();
    return root;
  }

  _bind() {
    const $ = (id) => this.el.querySelector(id);
    $('#styk-ai-fab').addEventListener('click', () => this.toggle(true));
    $('#styk-ai-close').addEventListener('click', () => this.toggle(false));
    $('#styk-ai-clear').addEventListener('click', () => {
      this.messages = [];
      saveHistory([]);
      this._renderMessages();
    });
    $('#styk-ai-settings').addEventListener('click', () => {
      const sheet = $('#styk-ai-settings-sheet');
      sheet.hidden = !sheet.hidden;
      if (!sheet.hidden) this._fillSettingsForm();
    });
    $('#styk-ai-save-settings').addEventListener('click', () => this._saveSettingsFromForm());
    $('#styk-ai-provider').addEventListener('change', () => this._onProviderChange());
    $('#styk-ai-send').addEventListener('click', () => this.send());
    $('#styk-ai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
    $('#styk-ai-presets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      const id = btn.getAttribute('data-preset');
      if (id === 'help') {
        $('#styk-ai-input').value = 'Mujhe perfect stick animation banana sikhao. Pose-to-pose workflow samjhao.';
        this.send();
        return;
      }
      this.applyPreset(id);
    });
  }

  toggle(force) {
    this.open = typeof force === 'boolean' ? force : !this.open;
    const panel = this.el.querySelector('#styk-ai-panel');
    const fab = this.el.querySelector('#styk-ai-fab');
    panel.hidden = !this.open;
    fab.classList.toggle('is-open', this.open);
    if (this.open) this.el.querySelector('#styk-ai-input')?.focus();
  }

  _fillSettingsForm() {
    const s = loadAiSettings();
    const provSel = this.el.querySelector('#styk-ai-provider');
    provSel.innerHTML = Object.values(AI_PROVIDERS)
      .map(p => `<option value="${p.id}" ${p.id === s.provider ? 'selected' : ''}>${p.name}${p.free ? ' (free)' : ''}</option>`)
      .join('');
    this.el.querySelector('#styk-ai-key').value = s.apiKey || '';
    this.el.querySelector('#styk-ai-enabled').checked = !!s.enabled;
    this.el.querySelector('#styk-ai-custom-url').value = s.customBaseUrl || '';
    this.el.querySelector('#styk-ai-custom-model').value = s.customModel || '';
    this._onProviderChange(s);
  }

  _onProviderChange(existing) {
    const s = existing || loadAiSettings();
    const id = this.el.querySelector('#styk-ai-provider').value;
    const p = AI_PROVIDERS[id] || AI_PROVIDERS.groq;
    const modelSel = this.el.querySelector('#styk-ai-model');
    modelSel.innerHTML = p.models.map(m => `<option value="${m}" ${m === (s.model || p.defaultModel) ? 'selected' : ''}>${m}</option>`).join('');
    this.el.querySelector('#styk-ai-provider-note').textContent = p.note || '';
    const link = this.el.querySelector('#styk-ai-key-link');
    if (p.keyUrl) {
      link.href = p.keyUrl;
      link.hidden = false;
      link.textContent = `Get ${p.name} key`;
    } else {
      link.hidden = true;
    }
    this.el.querySelector('#styk-ai-custom-fields').hidden = id !== 'custom';
  }

  _saveSettingsFromForm() {
    const settings = {
      enabled: this.el.querySelector('#styk-ai-enabled').checked,
      provider: this.el.querySelector('#styk-ai-provider').value,
      apiKey: this.el.querySelector('#styk-ai-key').value.trim(),
      model: this.el.querySelector('#styk-ai-model').value,
      customBaseUrl: this.el.querySelector('#styk-ai-custom-url').value.trim(),
      customModel: this.el.querySelector('#styk-ai-custom-model').value.trim(),
    };
    saveAiSettings(settings);
    this.el.querySelector('#styk-ai-settings-sheet').hidden = true;
    this._setStatus(settings.enabled ? `On · ${AI_PROVIDERS[settings.provider]?.name || settings.provider}` : 'Disabled');
  }

  _setStatus(text) {
    const el = this.el.querySelector('#styk-ai-status');
    if (el) el.textContent = text;
  }

  _renderMessages() {
    const box = this.el.querySelector('#styk-ai-messages');
    if (!box) return;
    box.innerHTML = '';
    if (!this.messages.length) {
      box.innerHTML = `<div class="styk-ai-empty">
        <p><b>Styk AI</b> app ke har feature ko janta hai.</p>
        <p>Idea likho — jaise <i>"character wave karke jump kare"</i> — ya upar preset dabao.</p>
        <p>Pehle Settings ⚙ me free API key daalo (Groq / Gemini / OpenRouter).</p>
      </div>`;
      return;
    }
    for (const m of this.messages) {
      const div = document.createElement('div');
      div.className = `styk-ai-msg styk-ai-msg-${m.role}`;
      div.innerHTML = formatMessageHtml(m.content);
      if (m.role === 'assistant') {
        const plan = extractAnimationBlock(m.content);
        if (plan) {
          const bar = document.createElement('div');
          bar.className = 'styk-ai-apply-bar';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = '▶ Apply animation to canvas';
          btn.addEventListener('click', () => this._applyPlan(plan));
          bar.appendChild(btn);
          div.appendChild(bar);
        }
      }
      box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
  }

  async applyPreset(id) {
    const plan = PRESET_ANIMATIONS[id];
    if (!plan) return;
    this.messages.push({
      role: 'assistant',
      content: `Preset **${plan.title}** ready.\n\n\`\`\`styk-animation\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\n${plan.notes || ''}`,
    });
    saveHistory(this.messages);
    this._renderMessages();
    this._applyPlan(plan);
  }

  _applyPlan(plan) {
    const editor = this.getEditor();
    const result = applyAnimationPlan(plan, editor);
    this._setStatus(result.ok ? `Applied ${result.framesApplied} frames` : 'Apply issue');
    this.messages.push({
      role: 'assistant',
      content: result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`,
    });
    saveHistory(this.messages);
    this._renderMessages();
  }

  async send() {
    const input = this.el.querySelector('#styk-ai-input');
    const text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    this.messages.push({ role: 'user', content: text });
    saveHistory(this.messages);
    this._renderMessages();

    const settings = loadAiSettings();
    if (!settings.enabled || (!settings.apiKey && settings.provider !== 'custom')) {
      this.messages.push({
        role: 'assistant',
        content: 'AI abhi band hai ya API key nahi hai.\n\n1. ⚙ Settings kholo\n2. Provider choose karo (**Groq** free + fast recommended)\n3. API key paste karo\n4. **Enable AI** tick karo → Save\n\nPhir dobara bhejo. Jab tak key nahi, upar presets (Wave / Jump / Walk) use kar sakte ho.',
      });
      saveHistory(this.messages);
      this._renderMessages();
      return;
    }

    this._setStatus('Thinking…');
    const sendBtn = this.el.querySelector('#styk-ai-send');
    sendBtn.disabled = true;
    if (this.abort) this.abort.abort();
    this.abort = new AbortController();

    try {
      const ctx = this.getContext() || {};
      const system = buildSystemPrompt(ctx);
      const apiMessages = [
        { role: 'system', content: system },
        ...this.messages.slice(-16).map(m => ({ role: m.role, content: m.content })),
      ];
      const reply = await chatCompletion({
        messages: apiMessages,
        settings,
        signal: this.abort.signal,
      });
      this.messages.push({ role: 'assistant', content: reply });
      saveHistory(this.messages);
      this._renderMessages();
      this._setStatus('Ready');
    } catch (e) {
      if (e.name === 'AbortError') return;
      this.messages.push({
        role: 'assistant',
        content: `❌ Error: ${e.message}\n\nTips: key check karo, model badlo, ya Groq/Gemini free tier try karo.`,
      });
      saveHistory(this.messages);
      this._renderMessages();
      this._setStatus('Error');
    } finally {
      sendBtn.disabled = false;
    }
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40)));
  } catch { /* quota */ }
}

function formatMessageHtml(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  let html = escaped
    .replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```\w*\n?/, '').replace(/```$/, '');
      return `<pre class="styk-ai-code">${inner}</pre>`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
  return html;
}

/** Bootstrap helper – call once after app shell is ready */
export function mountStykAi(options) {
  const panel = new AiChatPanel(options);
  panel.mount(document.body);
  window.__stykAi = panel;
  return panel;
}
