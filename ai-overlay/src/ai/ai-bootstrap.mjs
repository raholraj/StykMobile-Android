/**
 * Boots Styk AI after the main app is ready.
 * Safe to load as a module from index.html.
 */
import { mountStykAi } from './ai-chat.mjs';

function whenReady(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(fn, 0);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(fn, 0));
  }
}

function findEditor() {
  return window.__stykEditor
    || window.editor
    || window.app?.editor
    || window.styk?.editor
    || null;
}

function buildContext() {
  const editor = findEditor();
  const report = editor?.report;
  let figureSummary = 'default Blue stick figure';
  try {
    const fig = report?.keyframes?.[0]?.objects?.[0]?.figure
      || report?.keyframes?.[0]?.object?.figure;
    if (fig?.segments?.length) {
      figureSummary = `${fig.name || 'Figure'} · ${fig.segments.length} segments: `
        + fig.segments.map(s => `${s.segment_id}:${s.name || s.segment_kind}`).join(', ');
    }
  } catch { /* ignore */ }
  return {
    figureSummary,
    frameCount: report?.keyframes?.length,
    currentFrame: editor?.frameIndex ?? 0,
    fps: report?.fps || report?._styk?.fps || 12,
    canvas: report ? { width: report.canvas_width, height: report.canvas_height } : null,
  };
}

whenReady(() => {
  // Inject CSS once
  if (!document.getElementById('styk-ai-css')) {
    const link = document.createElement('link');
    link.id = 'styk-ai-css';
    link.rel = 'stylesheet';
    link.href = './src/styles/features/ai-chat.css';
    document.head.appendChild(link);
  }

  const panel = mountStykAi({
    getEditor: findEditor,
    getContext: buildContext,
  });

  // Expose for debugging / future editor hooks
  window.StykAI = {
    panel,
    open: () => panel.toggle(true),
    close: () => panel.toggle(false),
  };

  console.info('[Styk AI] Ready — open the AI button (bottom-right).');
});
