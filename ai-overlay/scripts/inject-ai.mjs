#!/usr/bin/env node
/**
 * Injects Styk AI feature into an extracted StykAnimate project root.
 * Usage: node ai-overlay/scripts/inject-ai.mjs [projectRoot]
 */
import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const overlayRoot = path.resolve(here, '..');
const projectRoot = path.resolve(process.argv[2] || process.cwd());

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  console.log('Injecting Styk AI into', projectRoot);

  const files = [
    ['src/ai/ai-providers.mjs', 'src/ai/ai-providers.mjs'],
    ['src/ai/ai-system-prompt.mjs', 'src/ai/ai-system-prompt.mjs'],
    ['src/ai/ai-commands.mjs', 'src/ai/ai-commands.mjs'],
    ['src/ai/ai-chat.mjs', 'src/ai/ai-chat.mjs'],
    ['src/ai/ai-bootstrap.mjs', 'src/ai/ai-bootstrap.mjs'],
    ['src/styles/features/ai-chat.css', 'src/styles/features/ai-chat.css'],
  ];

  for (const [fromRel, toRel] of files) {
    const from = path.join(overlayRoot, fromRel);
    const to = path.join(projectRoot, toRel);
    if (!(await exists(from))) {
      console.warn('  skip missing', fromRel);
      continue;
    }
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    console.log('  +', toRel);
  }

  const indexPath = path.join(projectRoot, 'index.html');
  if (!(await exists(indexPath))) {
    console.warn('index.html not found – skip HTML patch');
    return;
  }
  let html = await readFile(indexPath, 'utf8');

  const connectExtra = [
    'https://api.groq.com',
    'https://generativelanguage.googleapis.com',
    'https://openrouter.ai',
    'https://api.openai.com',
    'https://api.anthropic.com',
    'http://localhost:*',
    'http://127.0.0.1:*',
  ].join(' ');

  if (html.includes("connect-src 'self'") && !html.includes('api.groq.com')) {
    html = html.replace(
      /connect-src 'self'/g,
      `connect-src 'self' ${connectExtra}`,
    );
    console.log('  ~ CSP connect-src expanded for AI providers');
  }

  if (!html.includes('ai-bootstrap.mjs')) {
    html = html.replace(
      /<\/body>/i,
      '    <script type="module" src="./src/ai/ai-bootstrap.mjs"></script>\n  </body>',
    );
    console.log('  ~ index.html: ai-bootstrap.mjs script added');
  }

  await writeFile(indexPath, html);
  console.log('Styk AI injection complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
