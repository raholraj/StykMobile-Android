#!/usr/bin/env node
/**
 * Injects Styk AI into the built mobile/www (or project root as fallback).
 * MUST run AFTER prepare-www / android:sync web build, otherwise files are wiped.
 *
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

const AI_FILES = [
  'src/ai/ai-providers.mjs',
  'src/ai/ai-system-prompt.mjs',
  'src/ai/ai-commands.mjs',
  'src/ai/ai-chat.mjs',
  'src/ai/ai-bootstrap.mjs',
  'src/styles/features/ai-chat.css',
];

async function copyAiInto(targetRoot) {
  let n = 0;
  for (const rel of AI_FILES) {
    const from = path.join(overlayRoot, rel);
    const to = path.join(targetRoot, rel);
    if (!(await exists(from))) {
      console.warn('  skip missing overlay', rel);
      continue;
    }
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    console.log('  +', path.relative(projectRoot, to));
    n++;
  }
  return n;
}

async function patchIndexHtml(indexPath) {
  if (!(await exists(indexPath))) {
    console.warn('  no index.html at', indexPath);
    return false;
  }
  let html = await readFile(indexPath, 'utf8');
  let changed = false;

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
    html = html.replace(/connect-src 'self'/g, `connect-src 'self' ${connectExtra}`);
    changed = true;
    console.log('  ~ CSP connect-src expanded');
  }
  if (!html.includes('api.groq.com') && /connect-src [^;]+/.test(html)) {
    html = html.replace(/(connect-src [^;]+)/, `$1 ${connectExtra}`);
    changed = true;
    console.log('  ~ CSP connect-src appended');
  }

  if (!html.includes('ai-bootstrap.mjs')) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, '    <script type="module" src="./src/ai/ai-bootstrap.mjs"></script>\n  </body>');
    } else {
      html += '\n<script type="module" src="./src/ai/ai-bootstrap.mjs"></script>\n';
    }
    changed = true;
    console.log('  ~ ai-bootstrap.mjs script added');
  }

  if (changed) await writeFile(indexPath, html);
  return changed;
}

async function patchCapacitorConfig(configPath) {
  if (!(await exists(configPath))) return false;
  try {
    const raw = await readFile(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    cfg.plugins = cfg.plugins || {};
    cfg.plugins.CapacitorHttp = { enabled: true };
    cfg.android = cfg.android || {};
    cfg.android.allowMixedContent = true;
    await writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n');
    console.log('  ~ CapacitorHttp enabled in', path.relative(projectRoot, configPath));
    return true;
  } catch (e) {
    console.warn('  capacitor config patch failed', e.message);
    return false;
  }
}

async function main() {
  console.log('Injecting Styk AI into', projectRoot);

  const wwwRoot = path.join(projectRoot, 'mobile', 'www');
  const targets = [];
  if (await exists(wwwRoot)) targets.push(wwwRoot);
  targets.push(projectRoot);

  for (const t of targets) {
    console.log('Target:', path.relative(projectRoot, t) || '.');
    await copyAiInto(t);
    await patchIndexHtml(path.join(t, 'index.html'));
  }

  await patchCapacitorConfig(path.join(projectRoot, 'mobile', 'capacitor.config.json'));

  const check = path.join(wwwRoot, 'src', 'ai', 'ai-bootstrap.mjs');
  if (await exists(wwwRoot)) {
    if (await exists(check)) console.log('OK: AI present in mobile/www');
    else console.error('ERROR: AI missing from mobile/www after inject');
  }

  console.log('Styk AI injection complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
