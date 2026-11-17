#!/usr/bin/env bash
# Prueba de humo en un emulador Android real (ejecutada en GitHub Actions).
# Instala el APK, abre la app, conecta Playwright al WebView por CDP y recorre los flujos.
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
  for i in $(seq 1 60); do
    SOCK=$(adb shell cat /proc/net/unix | tr -d '\r' | grep -ao 'webview_devtools_remote_[0-9]*' | head -1 || true)
    [ -n "$SOCK" ] && break
    sleep 1
  done
  [ -n "$SOCK" ] || { echo "No se encontró el socket de depuración del WebView"; exit 1; }
  adb forward --remove-all || true
  adb forward tcp:9222 "localabstract:$SOCK"
  echo "WebView: $SOCK"
}

launch
node tests/android/smoke.mjs phase1 "$OUT"

# Persistencia: cerrar la app por completo y volver a abrir
adb shell am force-stop "$PKG"
sleep 2
launch
node tests/android/smoke.mjs phase2 "$OUT"

adb shell dumpsys package "$PKG" | grep -E "versionName|targetSdk" | tee "$OUT/package-info.txt"
echo "Prueba de humo Android OK"
