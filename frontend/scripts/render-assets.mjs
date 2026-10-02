/**
 * Renders the SVG sources in assets/ to the PNGs that @capacitor/assets needs.
 *
 * There is no image library in this toolchain, so Chrome does the rasterising:
 * each SVG is loaded in a headless window sized to match, and screenshotted.
 * The SVGs stay the source of truth, so the icon can be edited as text.
 *
 * Usage: node scripts/render-assets.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const TARGETS = [
  { svg: 'icon.svg', png: 'icon.png', size: 1024, transparent: false },
  { svg: 'icon-foreground.svg', png: 'icon-foreground.png', size: 1024, transparent: true },
  { svg: 'icon-background.svg', png: 'icon-background.png', size: 1024, transparent: false },
  { svg: 'splash.svg', png: 'splash.png', size: 2732, transparent: false },
  { svg: 'splash.svg', png: 'splash-dark.png', size: 2732, transparent: false },
];

const TYPES = { '.html': 'text/html', '.svg': 'image/svg+xml' };

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error('No Chrome or Edge found. Checked:\n  ' + CHROME_CANDIDATES.join('\n  '));
  process.exit(1);
}

const assets = resolve('assets');
mkdirSync(assets, { recursive: true });

// Headless Chrome refuses to load file:// pages, so the artwork is served over
// loopback for the few seconds the render takes.
const server = createServer((request, response) => {
  const name = decodeURIComponent(request.url.split('?')[0].replace(/^\//, ''));
  const path = join(assets, name);
  if (!path.startsWith(assets) || !existsSync(path)) {
    response.writeHead(404).end('not found');
    return;
  }
  const ext = name.slice(name.lastIndexOf('.'));
  response.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
  response.end(readFileSync(path));
});

function run(bin, args) {
  return new Promise((done) => {
    const child = spawn(bin, args, { stdio: 'ignore' });
    child.on('close', done);
    child.on('error', () => done(1));
  });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Chrome hands back control before the PNG has been flushed to disk. */
async function waitForFile(path, seconds = 20) {
  for (let i = 0; i < seconds * 4; i += 1) {
    if (existsSync(path) && statSync(path).size > 0) return true;
    await sleep(250);
  }
  return false;
}

const port = await new Promise((ready) => {
  server.listen(0, '127.0.0.1', () => ready(server.address().port));
});

let failed = false;

for (const target of TARGETS) {
  if (!existsSync(join(assets, target.svg))) {
    console.error(`missing source: ${target.svg}`);
    failed = true;
    break;
  }

  // A wrapper page pins the SVG to an exact pixel box with no margin, so the
  // screenshot is the artwork and nothing else.
  const pageName = `.render-${target.png}.html`;
  writeFileSync(
    join(assets, pageName),
    `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}
img{display:block;width:${target.size}px;height:${target.size}px}</style>
<img src="/${target.svg}">`,
    'utf8'
  );

  // Chrome silently skips the screenshot when another instance holds the same
  // profile, so every render gets a throwaway one.
  const profile = mkdtempSync(join(tmpdir(), 'render-'));
  const out = join(assets, target.png);
  rmSync(out, { force: true });

  await run(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-data-dir=${profile}`,
    `--window-size=${target.size},${target.size}`,
    `--default-background-color=${target.transparent ? '00000000' : 'ff070c16'}`,
    '--virtual-time-budget=4000',
    `--screenshot=${out}`,
    `http://127.0.0.1:${port}/${pageName}`,
  ]);

  const landed = await waitForFile(out);
  rmSync(join(assets, pageName), { force: true });
  rmSync(profile, { recursive: true, force: true });

  if (!landed) {
    console.error(`FAILED to render ${target.png}`);
    failed = true;
    break;
  }
  console.log(`rendered ${target.png} (${target.size}x${target.size})`);
}

server.close();

if (failed) process.exit(1);
console.log('\nNext: npx @capacitor/assets generate');
