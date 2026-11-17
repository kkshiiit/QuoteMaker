#!/usr/bin/env bash
# Prueba de humo en un emulador Android real (ejecutada en GitHub Actions).
# Instala el APK, abre la app, conecta Playwright al WebView (API _android) y recorre los flujos.
set -euo pipefail
APK=${1:-android/app/build/outputs/apk/debug/app-debug.apk}
PKG=app.quotemaker.mobile
OUT=${2:-android-evidence}
mkdir -p "$OUT"

adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true
adb install -r -g "$APK"

launch() {
  adb shell am start -W -n "$PKG/.MainActivity"
  sleep 3
}

launch
node tests/android/smoke.mjs phase1 "$OUT"

# Persistencia: cerrar la app por completo y volver a abrir
adb shell am force-stop "$PKG"
sleep 2
launch
node tests/android/smoke.mjs phase2 "$OUT"

{ echo "APK: $(stat -c%s "$APK") bytes"; adb shell dumpsys package "$PKG" | grep -E "versionName|targetSdk|minSdk"; } | tee "$OUT/package-info.txt"
echo "Prueba de humo Android OK"
