#!/usr/bin/env bash
# Encodes the training clips for the web: 720p H.264 (captions stay readable on phones), faststart, plus a poster frame each.
# usage: ./encode.sh SRC_DIR     (SRC_DIR has the five 1080p originals; edit the map below if the file names differ)
set -euo pipefail
SRC="${1:?source dir}"; OUT="$(dirname "$0")/video"; mkdir -p "$OUT/posters"
enc() { # name  source-glob  poster-second
  local f; f=$(ls "$SRC"/$2 | head -1)
  ffmpeg -v error -y -i "$f" -vf "scale=-2:720" -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$OUT/$1.mp4"
  ffmpeg -v error -y -ss "$3" -i "$OUT/$1.mp4" -frames:v 1 -q:v 4 "$OUT/posters/$1.jpg"
}
enc tactical-1-radius     '*-___1-_____.mp4'     7
enc tactical-2-valley     '*-___2-____.mp4'      6.5
enc roip-1-routing        '*955578fc-2.mp4'      6.5
enc roip-2-site-choice    '*-2-___2-_____-___.mp4' 6
enc lionet                '*0cef14dc-3.mp4'      1

# optional: the shareable vertical teaser (second argument = the 9:16 teaser, e.g. teaser/out/teaser_short_9x16.mp4)
if [ -n "${2:-}" ]; then
  ffmpeg -v error -y -i "$2" -vf "scale=720:-2" -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -c:a aac -b:a 112k -movflags +faststart "$OUT/teaser-9x16.mp4"
fi
