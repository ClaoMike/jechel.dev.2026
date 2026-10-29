# Riviera background assets

Builds `src/widgets/background/artwork/*` (the Vice theme's animated backdrop) from the original artwork
(1672×941). Needs Python 3 with OpenCV and NumPy, `cwebp`, and
[Real-ESRGAN ncnn](https://github.com/xinntao/Real-ESRGAN/releases) for the upscale.

```sh
W=/tmp/riviera && mkdir -p $W && cp "Sunset Ride Along the Riviera.png" $W/src.png
realesrgan-ncnn-vulkan -i $W/src.png -o $W/up-anime.png -n realesrgan-x4plus-anime
python3 -c "import cv2; cv2.imwrite('$W/4k-anime.png', cv2.resize(cv2.imread('$W/up-anime.png'), (3840, 2160), interpolation=cv2.INTER_AREA))"
python3 scripts/riviera/prep1.py $W   # find the birds and the plane on the sky
python3 scripts/riviera/prep2.py $W   # paint the sky over them (4K)
python3 scripts/riviera/prep3.py $W   # cut the plane + blank banner out as a sprite
python3 scripts/riviera/prep4.py $W   # masks: water, foam, smoke / sky, palm sway, flag+boat / exact sky
python3 scripts/riviera/prep5.py $W src/widgets/background/artwork   # export the WebP files
```

Each step writes a `*-view.png` preview next to its output for checking. Positions in the scripts
and in `src/widgets/background/lib/rivieraShader.ts` are in the original artwork's pixels.

The shipped plates have the pistol and holster on his thigh removed. That was done after step 5,
with an image model's edit of the original artwork: only the thigh area of the edit was pasted onto
the 4K plate (scaled up, tone-matched, feathered, his hand kept), so the rest of the plate and the
masks are unchanged. Rebuilding from the original artwork brings the pistol back.
