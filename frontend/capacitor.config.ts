import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The bundle id is fixed once the app is registered with Apple or installed on
 * a device - changing it later means a new app, not an update. Change it now if
 * com.linville.exerciseapp is not what you want.
 */
const config: CapacitorConfig = {
  appId: 'com.linville.exerciseapp',
  appName: 'ExerciseApp',
  webDir: 'build',

  server: {
    // Both platforms serve the app from https://localhost, which keeps it on a
    // secure origin. iOS would otherwise use capacitor://localhost, which some
    // web APIs treat as insecure.
    //
    // There is deliberately no `cleartext` and no `allowNavigation` here: the
    // app holds its own database and makes no network requests at all, so it
    // has no reason to be allowed to reach anything.
    androidScheme: 'https',
    iosScheme: 'https',
  },

  android: {
    // Matches --bg, so there is no white flash between the splash screen and
    // the first paint.
    backgroundColor: '#070c16',
    // It is an app, not a web page: pinch-zooming the UI is never wanted, and
    // it is easy to trigger by accident with sweaty hands mid-set.
    zoomEnabled: false,
    // Lets desktop Chrome attach to the running app at chrome://inspect, which
    // is the only real way to debug on device.
    webContentsDebuggingEnabled: true,
  },

  ios: {
    backgroundColor: '#070c16',
    zoomEnabled: false,
    // The page handles its own safe areas (viewport-fit=cover plus the
    // env(safe-area-inset-*) padding on the nav and tab bar), so WebKit should
    // not also inset the content.
    contentInset: 'never',
    webContentsDebuggingEnabled: true,
  },

  plugins: {
    SystemBars: {
      // The page is edge to edge and pads itself out of the status bar and the
      // navigation bar. Telling Capacitor the viewport-fit value up front stops
      // the layout jumping on launch while it works that out for itself.
      initialViewportFitValueHint: 'cover',
      // Light icons, because the bars sit on the app's dark navy.
      style: 'DARK',
    },
  },
};

export default config;
