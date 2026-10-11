# Step 2: fill the sky where the birds and plane were, on the 4K image.
import cv2, numpy as np, sys
D = sys.argv[1]
src = cv2.imread(D + '/src.png')
big = cv2.imread(D + '/4k-anime.png').astype(np.float32)
obj = cv2.imread(D + '/obj-mask.png', 0)
obj[200:240, 640:760] = 0  # his hair
cv2.imwrite(D + '/obj-mask.png', obj)
K = 3840 / src.shape[1]
x0, y0, x1, y1 = [int(round(v * K)) for v in np.load(D + '/sky_fit.npy')]
m = cv2.resize(obj, (3840, 2160), interpolation=cv2.INTER_NEAREST)
m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
box = big[y0:y1, x0:x1]
yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
u, v = (xx - x0) / (x1 - x0), (yy - y0) / (y1 - y0)
A = np.stack([np.ones_like(u), u, v, u*u, u*v, v*v, u**3, v**3, u*u*v, u*v*v], -1).reshape(-1, 10)
P = box.reshape(-1, 3)
keep = m[y0:y1, x0:x1].reshape(-1) == 0
for _ in range(3):
    coef, *_ = np.linalg.lstsq(A[keep], P[keep], rcond=None)
    res = np.linalg.norm(P - A @ coef, axis=1)
    keep &= res < 9
fit = (A @ coef).reshape(box.shape)
# anything still off the sky colour at 4K (edges the upscaler moved) joins the mask
r4 = (np.linalg.norm(box - fit, axis=2) > 9).astype(np.uint8) * 255
r4[(xx > 640 * K) & (yy > 205 * K)] = 0  # his hair
m[y0:y1, x0:x1] |= r4
m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
m[:y0] = 0; m[y1:] = 0; m[:, :x0] = 0; m[:, x1:] = 0
cv2.imwrite(D + '/fill-mask-4k.png', m)
fill = fit + np.random.default_rng(1).normal(0, 0.7, fit.shape)
w = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 4)[y0:y1, x0:x1, None]
out = big.copy()
out[y0:y1, x0:x1] = box * (1 - w) + fill * w
cv2.imwrite(D + '/plate-4k.png', np.clip(out, 0, 255).astype(np.uint8))
cv2.imwrite(D + '/plate-view.png', np.clip(out, 0, 255).astype(np.uint8)[140:560, 700:1760])
