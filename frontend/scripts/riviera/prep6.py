# Step 6: patch a leftover speck, then export the web files.
import cv2, numpy as np, sys, subprocess, os
D, OUT = sys.argv[1], sys.argv[2]
p = cv2.imread(D + '/plate-4k.png')
r = p[505:560, 790:850].astype(np.float32)
med = np.median(r.reshape(-1, 3), axis=0)
spot = (np.linalg.norm(r - med, axis=2) > 18).astype(np.uint8) * 255
print('speck px', int((spot > 0).sum()))
if spot.any():
    m = np.zeros(p.shape[:2], np.uint8); m[505:560, 790:850] = cv2.dilate(spot, np.ones((5, 5), np.uint8))
    p = cv2.inpaint(p, m, 6, cv2.INPAINT_TELEA)
cv2.imwrite(D + '/plate-4k.png', p)
cv2.imwrite(D + '/plate-1920.png', cv2.resize(p, (1920, 1080), interpolation=cv2.INTER_AREA))
os.makedirs(OUT, exist_ok=True)
def webp(src, dst, *args): subprocess.run(['cwebp', '-quiet', *args, src, '-o', dst], check=True)
webp(D + '/plate-4k.png', OUT + '/riviera-3840.webp', '-q', '86', '-m', '6')
webp(D + '/plate-1920.png', OUT + '/riviera-1920.webp', '-q', '86', '-m', '6')
webp(D + '/plane.png', OUT + '/plane.webp', '-q', '90', '-alpha_q', '100', '-exact')
webp(D + '/masks-a.png', OUT + '/masks-a.webp', '-lossless')
webp(D + '/masks-b.png', OUT + '/masks-b.webp', '-lossless')
webp(D + '/masks-c.png', OUT + '/masks-c.webp', '-lossless')
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(OUT + '/' + f) // 1024, 'KB')
