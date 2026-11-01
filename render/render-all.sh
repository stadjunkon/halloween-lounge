#!/bin/bash
# Renders the five frames the page mixes live. ~5 min per frame on 4 CPU cores.
# PY must be a Python with the bpy module (pip install bpy; bpy 5.x needs Python 3.13),
# or run each line with Blender instead:  blender -b -P render/pumpkin.py  (same env vars).
cd "$(dirname "$0")"
PY=${PY:-python3}
COMMON="CAM_YAW=0 RES=900 SAMPLES=64 HAZE=0.45 EXPO=-0.7 CANDLE_W=170"
run() { name=$1; shift; echo "start $name $(date +%T)"; env $COMMON "$@" LOOK='AgX - Punchy' OUT="$PWD/final/$name.png" "$PY" pumpkin.py 2>&1 | grep "render s\|rror"; echo "done $name $(date +%T)"; }
mkdir -p final
run lit-c MODE=lit                      # candle, flame centred
run unlit MODE=unlit                    # moonlight only, candle out
run lit-l MODE=lit CANDLE_DX=-0.04      # flame leaning left
run lit-r MODE=lit CANDLE_DX=0.04       # flame leaning right
run lit-b MODE=lit HAZE_OFF=3.7         # same light, different smoke pattern
echo ALLDONE
