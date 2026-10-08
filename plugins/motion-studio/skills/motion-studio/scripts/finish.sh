#!/bin/zsh
# Mux, encode and QA a motion-studio render.
#   finish.sh <video-silent.mp4> <soundtrack.wav> <out-dir> [name] [target-MB]
# Writes <name>_master.mp4 (crf-16 picture, 256k audio), <name>.mp4 (2-pass, <= target MB, default 15),
# <name>_silent.mp4, contact.png (one frame per 2 s) and phone_check.png (frames at 390 px wide, the size
# people actually see), then prints loudness. Audio is normalised to -14 LUFS / -1 dBTP (social platforms).
set -e
src=$1; wav=$2; out=$3; name=${4:-final}; mb=${5:-15}
mkdir -p "$out"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
kbps=$(python3 -c "print(int(($mb*8192*0.93)/$dur - 160))")
norm="loudnorm=I=-14:TP=-1.0:LRA=11"
ffmpeg -y -loglevel error -i "$src" -i "$wav" -c:v copy -af "$norm" -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$out/${name}_master.mp4"
log=$(mktemp -d)/p
ffmpeg -y -loglevel error -i "$src" -c:v libx264 -preset slow -b:v ${kbps}k -pass 1 -passlogfile "$log" -an -f mp4 /dev/null
ffmpeg -y -loglevel error -i "$src" -i "$wav" -c:v libx264 -preset slow -b:v ${kbps}k -maxrate $((kbps*17/10))k -bufsize $((kbps*24/10))k -pass 2 -passlogfile "$log" \
  -pix_fmt yuv420p -af "$norm" -c:a aac -b:a 160k -ar 48000 -shortest -movflags +faststart "$out/$name.mp4"
ffmpeg -y -loglevel error -i "$out/$name.mp4" -an -c:v copy "$out/${name}_silent.mp4"
n=$(python3 -c "import math;print(max(1,math.ceil($dur/2)))"); cols=$(( n < 8 ? n : 8 )); rows=$(( (n + cols - 1) / cols ))
ffmpeg -y -loglevel error -i "$src" -vf "fps=1/2,scale=270:-1,tile=${cols}x${rows}" -frames:v 1 "$out/contact.png"
ffmpeg -y -loglevel error -i "$src" -vf "fps=1/3,scale=390:-1,tile=6x$(( ( $(python3 -c "import math;print(math.ceil($dur/3))") + 5) / 6 ))" -frames:v 1 "$out/phone_check.png"
ls -la "$out"/*.mp4 | awk '{printf "%6.1f MB  %s\n", $5/1048576, $9}'
for f in "$out/$name.mp4" "$out/${name}_master.mp4"; do
  printf "%s  " "$(basename $f)"; ffmpeg -hide_banner -i "$f" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tr -s ' ' | tr '\n' ' '; echo
done
