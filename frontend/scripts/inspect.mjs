/**
 * Drives a real Chrome over the DevTools protocol and evaluates an expression
 * in the page, in real time.
 *
 * Headless Chrome's --virtual-time-budget races the clock forward, which starves
 * IndexedDB and WebAssembly work and makes anything asynchronous look like it
 * hangs. This talks to the browser directly instead, so waits are real waits.
 *
 * Usage:
 *   node scripts/inspect.mjs <url> <expression> [timeoutMs]
 *
 * The expression is evaluated repeatedly until it returns something other than
 * null/undefined, or the timeout expires. It may return a promise.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

const [url, expression, timeoutArg] = process.argv.slice(2);
if (!url || !expression) {
  console.error('usage: node scripts/inspect.mjs <url> <expression> [timeoutMs]');
  process.exit(1);
}
const timeoutMs = Number(timeoutArg) || 45000;

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error('No Chrome found');
  process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const port = 9222 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'inspect-'));

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=430,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

function cleanup() {
  try { child.kill(); } catch { /* already gone */ }
  // Chrome may still hold the profile directory for a moment after it is
  // killed; a leftover temp folder is not worth failing the run over.
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
  catch { /* the OS will clear it */ }
}

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* browser not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome did not expose a debugging target');
}

let nextId = 1;

function connect(wsUrl) {
  return new Promise((ready, fail) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const waiting = pending.get(message.id);
      if (waiting) {
        pending.delete(message.id);
        if (message.error) waiting.fail(new Error(message.error.message));
        else waiting.ready(message.result);
      }
    });

    socket.addEventListener('error', () => fail(new Error('DevTools socket error')));
    socket.addEventListener('open', () =>
      ready({
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { ready: res, fail: rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close: () => socket.close(),
      })
    );
  });
}

try {
  const session = await connect(await findTarget());
  await session.send('Runtime.enable');
  await session.send('Page.enable');
  await session.send('Page.navigate', { url });

  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    await sleep(500);
    const result = await session.send('Runtime.evaluate', {
      expression: `(async () => { try { return JSON.stringify(await (${expression})); }
                    catch (e) { return JSON.stringify({ __error: String(e && e.message || e) }); } })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const value = result?.result?.value;
    if (value === undefined || value === null) continue;
    last = value;
    const parsed = JSON.parse(value);
    if (parsed !== null && parsed !== undefined && parsed !== false) {
      console.log(JSON.stringify(parsed, null, 2));
      session.close();
      cleanup();
      process.exit(0);
    }
  }

  console.error('TIMED OUT. Last value:', last);
  session.close();
  cleanup();
  process.exit(2);
} catch (error) {
  console.error('inspect failed:', error.message);
  cleanup();
  process.exit(1);
}
