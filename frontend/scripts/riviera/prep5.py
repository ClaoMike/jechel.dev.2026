# Step 5: paint the pistol, its holster and the thigh strap out of the 4K plate.
# The fill is the jeans around it (only navy denim, so the hand doesn't bleed in), plus the
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
# Only the jeans may lend their colour: around the hole, anything that isn't dark navy (the hand,
# its shadowed fingertips, the ring, gold highlights on the bike) is a hole too while inpainting.
b, g, r = [p[..., i].astype(np.int32) for i in range(3)]
denim = (b >= r - 4) & (np.maximum(np.maximum(r, g), b) < 120)
near = cv2.dilate(m, np.ones((81, 81), np.uint8))
holes = m | (cv2.dilate((~denim).astype(np.uint8) * 255, np.ones((11, 11), np.uint8)) & near)
# the smooth shading: inpainted at quarter size, then smoothed
s = 4
small = cv2.resize(p, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA)
hs = cv2.dilate(cv2.resize(holes, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_NEAREST), np.ones((3, 3), np.uint8))
fs = cv2.inpaint(small, hs, 8, cv2.INPAINT_NS).astype(np.float32)
# smooth only within the hole (blurring weighted by it), so nothing from outside is smeared in
hw = (hs > 0).astype(np.float32)[..., None]
fs = np.where(hw > 0, cv2.GaussianBlur(fs * hw, (0, 0), 1) / np.maximum(cv2.GaussianBlur(hw, (0, 0), 1)[..., None], 1e-3), fs)
base = cv2.resize(fs, (W, H), interpolation=cv2.INTER_CUBIC)
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
out = p * (1 - w) + fill * w
# denim never runs warmer than blue: pull any leftover warm tint in the fill back to navy (only
# as much as the fill shows, so the fingertips at its edge keep their colour)
o = out.astype(np.float32); warm = np.clip(o[..., 2] - o[..., 0], 0, None) * w[..., 0]
o[..., 2] -= warm; o[..., 1] -= warm * 0.5
out = np.clip(o, 0, 255).astype(np.uint8)
cv2.imwrite(D + '/plate-4k.png', out)
cv2.imwrite(D + '/pistol-view.png', out[1000:1700, 1100:1900])
