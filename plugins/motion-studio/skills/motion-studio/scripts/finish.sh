#!/bin/zsh
# Mux, encode and QA a motion-studio render.
#   finish.sh <video-silent.mp4> <soundtrack.wav> <out-dir> [name] [target-MB]
# Writes <name>_master.mp4 (crf-16 picture, 256k audio), <name>.mp4 (2-pass upload file), <name>_silent.mp4,
# contact.png (one frame per 2 s) and phone_check.png (4-12 frames at 390 px wide, the size people see in a feed),
# then prints loudness. Audio is normalised to -14 LUFS integrated / -1 dBTP (social platforms).
# Size: default target is ~0.5 MB per second, capped at 15 MB, and the video bitrate never exceeds 4.5 Mbps,
# so short clips aren't padded to the cap. Pass target-MB to override.
set -e
src=$1; wav=$2; out=$3; name=${4:-final}
mkdir -p "$out"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
mb=${5:-$(python3 -c "print(round(min(15, max(2, 0.5*$dur)), 1))")}
kbps=$(python3 -c "print(max(800, min(4500, int(($mb*8192*0.93)/$dur - 160))))")
# Two-pass loudness: measure, then apply linearly; the limiter guarantees the -1 dBTP ceiling on transient-heavy mixes.
m=$(ffmpeg -hide_banner -i "$wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | python3 -c "
import sys,json,re; j=json.loads(re.search(r'\{[^{}]*\}', sys.stdin.read(), re.S).group(0))
print(f\"measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}\")")
norm="loudnorm=I=-14:TP=-1.5:LRA=11:${m}:linear=true,alimiter=limit=0.84:level=false:attack=1:release=50"
ffmpeg -y -loglevel error -i "$src" -i "$wav" -c:v copy -af "$norm" -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$out/${name}_master.mp4"
log="$out/.passlog"
ffmpeg -y -loglevel error -i "$src" -c:v libx264 -preset slow -b:v ${kbps}k -pass 1 -passlogfile "$log" -an -f mp4 /dev/null
ffmpeg -y -loglevel error -i "$src" -i "$wav" -c:v libx264 -preset slow -b:v ${kbps}k -maxrate $((kbps*17/10))k -bufsize $((kbps*24/10))k -pass 2 -passlogfile "$log" \
  -pix_fmt yuv420p -af "$norm" -c:a aac -b:a 160k -ar 48000 -shortest -movflags +faststart "$out/$name.mp4"
rm -f "$log"*
ffmpeg -y -loglevel error -i "$out/$name.mp4" -an -c:v copy "$out/${name}_silent.mp4"
read n cols rows cfps < <(python3 -c "
import math; d=$dur; n=min(12, max(4, 2*math.ceil(d/2))); c=n if n <= 6 else n//2; print(n, c, n//c, n/d)")   # grids fill exactly
ffmpeg -y -loglevel error -i "$src" -vf "fps=1/2,scale=270:-1,tile=$(python3 -c "import math;n=max(1,math.ceil($dur/2));c=min(8,n);print(f'{c}x{math.ceil(n/c)}')")" -frames:v 1 "$out/contact.png"
ffmpeg -y -loglevel error -i "$src" -vf "fps=$cfps,scale=390:-1,tile=${cols}x${rows}" -frames:v 1 "$out/phone_check.png"
echo "video bitrate ${kbps}k (target ${mb} MB for ${dur%.*}s)"
ls -la "$out"/*.mp4 | awk '{printf "%6.1f MB  %s\n", $5/1048576, $9}'
for f in "$out/$name.mp4" "$out/${name}_master.mp4"; do
  printf "%s  " "$(basename $f)"; ffmpeg -hide_banner -i "$f" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tr -s ' ' | sed 's/dBFS/dBTP/' | tr '\n' ' '; echo
done
