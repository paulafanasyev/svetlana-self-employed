#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/..";mkdir -p vendor/voices
ARCH=$(uname -m);case "$ARCH" in x86_64) PA=x86_64;;aarch64|arm64) PA=aarch64;;*) echo "unsupported arch $ARCH";exit 1;;esac
if [ ! -x vendor/piper/piper ];then curl -fL "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_${PA}.tar.gz"|tar -xz -C vendor;fi
V=https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium
[ -f vendor/voices/ru_RU-irina-medium.onnx ]||curl -fL "$V/ru_RU-irina-medium.onnx" -o vendor/voices/ru_RU-irina-medium.onnx
[ -f vendor/voices/ru_RU-irina-medium.onnx.json ]||curl -fL "$V/ru_RU-irina-medium.onnx.json" -o vendor/voices/ru_RU-irina-medium.onnx.json
echo "Привет, я Светлана."|vendor/piper/piper --model vendor/voices/ru_RU-irina-medium.onnx --output_file vendor/test.wav
echo "OK: vendor/test.wav — голос работает"
