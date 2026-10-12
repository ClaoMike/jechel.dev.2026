# Step 5: paint the pistol, its holster and the thigh strap out of the 4K plate.
# The fill is the jeans around it (skin kept out, so the hand doesn't bleed in), plus the
# fine fabric texture of a patch of the same jeans so it doesn't look smudged.
import cv2, numpy as np, sys
D = sys.argv[1]
p = cv2.imread(D + '/plate-4k.png')
H, W = p.shape[:2]
# The gun and holster on his right thigh, and the strap around it (4K px).
poly = np.array([(1396, 1222), (1440, 1219), (1488, 1204), (1532, 1201), (1562, 1236), (1600, 1290), (1722, 1286), (1734, 1342),
                 (1612, 1362), (1614, 1440), (1607, 1488), (1568, 1494), (1508, 1452), (1457, 1342), (1459, 1302), (1398, 1286)], np.int32)
m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [poly], 255)
m = cv2.dilate(m, np.ones((7, 7), np.uint8))
# skin and the gold ring nearby are holes too while inpainting, so their colour can't leak in
hsv = cv2.cvtColor(p, cv2.COLOR_BGR2HSV)
warm = ((hsv[..., 0] < 30) & (hsv[..., 1] > 70) & (hsv[..., 2] > 70)).astype(np.uint8) * 255
holes = m | (cv2.dilate(warm, np.ones((9, 9), np.uint8)) & cv2.dilate(m, np.ones((61, 61), np.uint8)))
# the smooth shading: inpainted at quarter size, then blurred
s = 4
small = cv2.resize(p, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA)
hs = cv2.dilate(cv2.resize(holes, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_NEAREST), np.ones((3, 3), np.uint8))
base = cv2.GaussianBlur(cv2.resize(cv2.inpaint(small, hs, 8, cv2.INPAINT_NS), (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32), (0, 0), 4)
# the fabric: high frequencies of a patch of the jeans below the strap, tiled (some flipped) over the hole
src = p[1370:1490, 1630:1750].astype(np.float32)
det = src - cv2.GaussianBlur(src, (0, 0), 6)
x0, y0, w0, h0 = cv2.boundingRect(cv2.findNonZero(m))
tile = np.zeros((h0, w0, 3), np.float32)
rng = np.random.default_rng(5)
th, tw = det.shape[:2]
for ty in range(0, h0, th - 20):
    for tx in range(0, w0, tw - 20):
        d = det if rng.random() < .5 else det[:, ::-1]
        hh, ww = min(th, h0 - ty), min(tw, w0 - tx)
        tile[ty:ty + hh, tx:tx + ww] = d[:hh, :ww]
fill = base.copy(); fill[y0:y0 + h0, x0:x0 + w0] += cv2.GaussianBlur(tile, (0, 0), 0.8) * 0.5
w = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 2.5)[..., None]
out = np.clip(p * (1 - w) + fill * w, 0, 255).astype(np.uint8)
cv2.imwrite(D + '/plate-4k.png', out)
cv2.imwrite(D + '/pistol-view.png', out[1000:1700, 1100:1900])
