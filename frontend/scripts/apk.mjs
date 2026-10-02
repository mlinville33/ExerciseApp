/**
 * Builds the debug APK.
 *
 * This exists instead of a one-line npm script because `cd android && gradlew`
 * resolves differently depending on whether npm runs scripts through cmd or a
 * POSIX shell, and gets "not recognized as an internal or external command" in
 * one of them. Spawning the wrapper by absolute path works in both.
 *
 * Usage: node scripts/apk.mjs [release]
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const androidDir = resolve(here, '..', 'android');

if (!existsSync(androidDir)) {
  console.error('No android/ project. Run: npx cap add android');
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const wrapper = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');

if (!existsSync(wrapper)) {
  console.error(`Gradle wrapper missing: ${wrapper}`);
  process.exit(1);
}

// Android Studio bundles a JDK that is often newer than the Android Gradle
// Plugin supports, and Gradle picks it up when JAVA_HOME is unset. Saying so
// up front is cheaper than decoding an "unsupported class file major version".
if (!process.env.JAVA_HOME) {
  console.warn(
    'JAVA_HOME is not set. Gradle will guess, and Android Studio\'s bundled JDK\n' +
    'may be too new for this project. See NATIVE.md if the build fails on a\n' +
    'class file version.\n'
  );
}

const variant = process.argv[2] === 'release' ? 'assembleRelease' : 'assembleDebug';
const outputName = variant === 'assembleRelease' ? 'release' : 'debug';

// Node refuses to spawn a .bat directly on Windows (it rejects with EINVAL,
// a hardening change after CVE-2024-27980). Going through cmd.exe with an
// argument list keeps that fix intact without re-introducing a shell string.
const [command, args] = isWindows
  ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', wrapper, variant]]
  : [wrapper, [variant]];

const child = spawn(command, args, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: false,
  windowsVerbatimArguments: false,
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`\nGradle exited with ${code}.`);
    process.exit(code ?? 1);
  }

  const apk = join(
    androidDir, 'app', 'build', 'outputs', 'apk', outputName,
    `app-${outputName}.apk`
  );

  if (existsSync(apk)) {
    const megabytes = (statSync(apk).size / 1024 / 1024).toFixed(1);
    console.log(`\nAPK: ${apk}  (${megabytes} MB)`);
    console.log(`Install with: adb install -r "${apk}"`);
  } else {
    console.log('\nGradle succeeded but the APK was not where expected:');
    console.log(`  ${apk}`);
  }
});
