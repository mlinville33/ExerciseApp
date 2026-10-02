/**
 * Puts two generated things in place before a build:
 *
 * 1. The exercise and rehab libraries, copied out of the backend into src/
 *    where the bundler can reach them. The app seeds its on-device database
 *    from these, and the Python backend reads the same originals, so
 *    backendAPI/src/assets stays the single source of truth.
 *
 * 2. The SQLite WebAssembly build, copied where the browser fallback expects
 *    to fetch it. Only the browser uses this; a phone has real SQLite.
 *
 * Both copies are gitignored. Runs automatically before `npm start` and
 * `npm run build`.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', '..', 'backendAPI', 'src', 'assets');
const target = resolve(here, '..', 'src', 'data', 'library');

const FILES = ['workouts.json', 'rehab.json'];

if (!existsSync(source)) {
  console.error(`Library source not found: ${source}`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });

for (const name of FILES) {
  const from = join(source, name);
  if (!existsSync(from)) {
    console.error(`Missing library file: ${from}`);
    process.exit(1);
  }
  copyFileSync(from, join(target, name));
  console.log(`library: ${name} (${statSync(join(target, name)).size.toLocaleString()} bytes)`);
}

// The browser fallback is served as static files rather than bundled.
//
// jeep-sqlite's ESM build imports node's `crypto`, which webpack 5 will not
// polyfill and CRA will not let us configure around without ejecting. Its
// prebuilt standalone bundle has no such import and self-registers the custom
// element, so it is copied into public/ and loaded with a script tag at
// runtime. The wasm sits beside it because jeep-sqlite fetches it by URL.
const publicAssets = resolve(here, '..', 'public', 'assets');
mkdirSync(publicAssets, { recursive: true });

const wasmFrom = resolve(here, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
if (!existsSync(wasmFrom)) {
  console.error(`Missing ${wasmFrom} - run npm install`);
  process.exit(1);
}
copyFileSync(wasmFrom, join(publicAssets, 'sql-wasm.wasm'));
console.log(`wasm: sql-wasm.wasm (${statSync(join(publicAssets, 'sql-wasm.wasm')).size.toLocaleString()} bytes)`);

const jeepFrom = resolve(here, '..', 'node_modules', 'jeep-sqlite', 'dist', 'jeep-sqlite');
if (!existsSync(jeepFrom)) {
  console.error(`Missing ${jeepFrom} - run npm install`);
  process.exit(1);
}
const jeepTo = join(publicAssets, 'jeep-sqlite');
cpSync(jeepFrom, jeepTo, { recursive: true });
console.log(`web sqlite: ${readdirSync(jeepTo).length} files -> public/assets/jeep-sqlite`);
