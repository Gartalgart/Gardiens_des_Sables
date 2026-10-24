#!/bin/sh
# usage: sh scripts/normalize-audio.sh "$PWD/assets/audio-raw" "$PWD/assets/audio"
# Rebuilds assets/audio from assets/audio-raw: leading silence trimmed, every clip
# brought to the same average loudness (-18 dB RMS), peaks held under -1 dB by a limiter.
set -e
RAW="$1"; OUT="$2"; TARGET=-18
cd "$RAW"
for f in $(find . -name "*.mp3"); do
  mkdir -p "$OUT/$(dirname $f)"
  trimmed="$OUT/$f.tmp.wav"
  ffmpeg -hide_banner -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.005" "$trimmed" </dev/null
  mean=$(ffmpeg -hide_banner -i "$trimmed" -af volumedetect -f null - 2>&1 </dev/null | grep -oE 'mean_volume: [-0-9.]+' | cut -d' ' -f2)
  gain=$(awk -v m="$mean" -v t="$TARGET" 'BEGIN { g = t - m; if (g > 30) g = 30; printf "%.1f", g }')
  ffmpeg -hide_banner -loglevel error -y -i "$trimmed" -af "volume=${gain}dB,alimiter=limit=0.89:attack=1:release=40:level=disabled" -ar 44100 -b:a 128k "$OUT/$f" </dev/null
  rm "$trimmed"
  echo "$f mean $mean gain $gain"
done
