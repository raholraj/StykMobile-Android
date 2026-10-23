/**
 * Boots Styk AI after the app shell is ready.
 */
import { mountStykAi } from './ai-chat.mjs';

function waitForStyk(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (globalThis.styk?.editor) return resolve(globalThis.styk.editor);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function boot() {
  if (document.getElementById('styk-ai-root')) return;

  if (!document.querySelector('link[data-styk-ai-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './src/styles/features/ai-chat.css';
    link.setAttribute('data-styk-ai-css', '1');
    document.head.appendChild(link);
  }

  await waitForStyk();

  mountStykAi({
    getEditor: () => globalThis.styk?.editor || globalThis.__stykEditor || null,
    getContext: () => {
      const ed = globalThis.styk?.editor;
      if (!ed?.report) return {};
      return {
        frameCount: ed.report.keyframes?.length ?? 0,
        frameIndex: ed.frameIndex ?? 0,
        hasFigure: Boolean(ed.frame?.objects?.length),
      };
    },
  });
  console.info('[Styk AI] panel ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => boot().catch(console.error));
} else {
  boot().catch(console.error);
}
