# Native builds (Android + iOS)

The React app is wrapped with [Capacitor](https://capacitorjs.com) 8. The web
build in `build/` is copied into a native shell for each platform — there is no
second codebase, and no component is platform specific.

```
frontend/
  capacitor.config.ts   shared native config
  assets/               icon + splash SVG sources, and the PNGs rendered from them
  android/              generated Android Studio project (committed)
  ios/                  generated Xcode project (committed)
```

Both native folders are committed on purpose: you edit real files in them
(`AndroidManifest.xml`, `Info.plist`, signing config). Everything `cap sync`
regenerates — the copied web assets, `capacitor.config.json` — is gitignored,
as are keystores.

## Everyday workflow

| Command | Does |
| --- | --- |
| `npm run sync` | Web build, then copy into both native projects |
| `npm run android` | Sync, then open Android Studio |
| `npm run ios` | Sync, then open Xcode (macOS only) |
| `npm run apk` | Sync, then build a debug APK |
| `npm run assets` | Re-render icons/splash from SVG and regenerate every size |

Any time you change web code you must `sync` before the native app sees it —
the native projects hold a *copy* of `build/`, not a link to it.

## Android

### One-time setup

1. **Android Studio** (includes the SDK and a bundled JDK 21).
2. In the SDK Manager, install the **Android 16 (API 36)** platform.
3. Set `ANDROID_HOME` to your SDK path, e.g.
   `C:\Users\<you>\AppData\Local\Android\Sdk`.

The generated project targets **API 36**, minimum **API 24 (Android 7.0)**,
Gradle 8.14.3 with AGP 8.13 — which needs **JDK 17 or newer**. The JDK bundled
with Android Studio satisfies this, so you do not need a separate install;
`npm run apk` from a plain terminal does, so either install a JDK or build from
inside Android Studio.

Verify with `npx cap doctor`.

### Building the APK

```
npm run apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Install it by copying the file to the phone and opening it (you will be asked to
allow installs from that source once), or with `adb install <path>`.

A **debug** APK is all you need for your own device — no Play Store account, no
review, no signing key. A release build only matters if you ever publish.

### There is no backend

The app carries its own SQLite database. Nothing is fetched, there is no server
to start, no account, and it works in a gym basement with no signal.

`src/api.js` is the whole data layer's public surface; it used to be an HTTP
client and is now backed by `src/data/`, which is a port of the FastAPI routers.
No component knows the difference.

On a phone this is native SQLite. In a browser the same plugin runs SQLite
compiled to WebAssembly and persists to IndexedDB, so `npm start` on Windows
exercises exactly the same queries - which is how the port was tested without a
device attached.

The Python backend in `backendAPI/` is still the source of the exercise library
that seeds the database (`scripts/sync-library.mjs` copies it in at build time)
and remains useful for export and backup, but the app never calls it.

## iOS

The Xcode project is already generated and synced, including every icon and
splash size. Capacitor 8 uses Swift Package Manager rather than CocoaPods, so
the project was created on Windows without issue.

**Everything from here needs macOS.** Xcode does not run on Windows.

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select the **App** target → Signing & Capabilities → pick your team. Leave
   *Automatically manage signing* on; Xcode creates the certificate and
   provisioning profile for you.
3. Confirm the bundle identifier is `com.linville.exerciseapp`, and register
   that same identifier at developer.apple.com if it is not there yet.
4. Plug in your iPhone, choose it as the run destination, and press Run.

Deployment target is **iOS 15.0**.

### TestFlight instead of a cable

Product → Archive → Distribute App → App Store Connect. Once the build
finishes processing, add yourself as an **internal tester**. Internal testing
skips Beta App Review entirely, so the build is installable within minutes and
there is no listing, screenshots or privacy policy to write.

Add `ITSAppUsesNonExemptEncryption = NO` to `Info.plist` to stop Xcode asking
about export compliance on every single upload.

### Changing the bundle id

Do it now if you are going to. After the app is registered with Apple or
installed on a device, a new identifier means a new app rather than an update.
It is set in `capacitor.config.ts`, and `npx cap sync` propagates it.

## Icons and splash

`assets/*.svg` are the sources — plain text, editable in any editor. The PNGs
beside them are rendered from those SVGs, and every platform-specific size is
generated from the PNGs:

```
npm run assets
```

Rendering uses headless Chrome (there is no image library in this toolchain),
so Chrome or Edge must be installed. `assets/icon-foreground.svg` is scaled to
about 62% so it survives the circle and squircle masks Android OEMs apply.

## Debugging on a device

The app exposes `window.exerciseApp` - `{ api, resetDatabase }`. Attach desktop
Chrome to the running app through `chrome://inspect` and you can query the real
on-device database from the console:

```js
await exerciseApp.api.summary(30, 'lb');
await exerciseApp.resetDatabase();   // wipes everything and re-seeds
```

`scripts/inspect.mjs` drives the same handle over the DevTools protocol for
automated checks:

```
node scripts/inspect.mjs http://localhost:3002/ "exerciseApp.api.listWorkouts()"
```

Note that headless Chrome's `--virtual-time-budget` starves IndexedDB and makes
database calls appear to hang. The inspect script deliberately uses real time
instead; do not switch it back.

## Still to do

- Android hardware **back button** — currently exits the app from any tab.
- **Keyboard vs. the tab bar.** Focusing an input can push the fixed bottom bar
  up over the keyboard. Fixing it properly means installing `@capacitor/keyboard`
  and setting its `resize` mode; it is not something the base config can do.
- **Local notification** when the rest timer finishes. The timer is computed
  from a timestamp so its value survives backgrounding, but nothing alerts you
  while the screen is off.
- **Keep the screen awake** during a session, and haptics on Log Set.
