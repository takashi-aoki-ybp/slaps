const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function javaMajor(javaHome) {
  const java = `${javaHome}/bin/java`;
  if (!fs.existsSync(java)) return null;
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const text = `${result.stdout || ''}${result.stderr || ''}`;
  const match = text.match(/version "(\d+)/);
  return match ? Number(match[1]) : null;
}

const candidates = [
  process.env.SLAPS_ANDROID_JAVA_HOME,
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  process.env.JAVA_HOME,
].filter(Boolean);
const javaHome = candidates.find(candidate => {
  const major = javaMajor(candidate);
  return major && major >= 17 && major <= 24;
});

if (!javaHome) {
  console.error('Android verification requires JDK 17-24. Set SLAPS_ANDROID_JAVA_HOME to a compatible JDK.');
  process.exit(1);
}

const androidHome = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
].filter(Boolean).find(candidate => fs.existsSync(candidate));
if (!androidHome) {
  console.error('Android SDK not found. Set ANDROID_HOME to the SDK directory.');
  process.exit(1);
}

const sync = spawnSync('npm', ['run', 'android:sync'], { stdio: 'inherit' });
if (sync.status !== 0) process.exit(sync.status || 1);

const gradle = spawnSync('./android/gradlew', ['-p', 'android', 'testDebugUnitTest'], {
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome },
});
process.exit(gradle.status || 0);
