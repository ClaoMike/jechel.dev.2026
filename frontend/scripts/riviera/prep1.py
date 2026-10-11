# Step 1: find the birds and the plane on the sky, remove them from the 4K image.
import cv2, numpy as np, sys
D = sys.argv[1]
src = cv2.imread(D + '/src.png').astype(np.float32)
H, W = src.shape[:2]
x0, y0, x1, y1 = 335, 86, 748, 232
box = src[y0:y1, x0:x1]
yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
u, v = (xx - x0) / (x1 - x0), (yy - y0) / (y1 - y0)
A = np.stack([np.ones_like(u), u, v, u*u, u*v, v*v, u**3, v**3], -1).reshape(-1, 8)
P = box.reshape(-1, 3)
keep = np.ones(len(P), bool)
for _ in range(4):  # robust fit: drop the outliers (the birds and plane) and refit
    coef, *_ = np.linalg.lstsq(A[keep], P[keep], rcond=None)
    res = np.linalg.norm(P - A @ coef, axis=1)
    keep = res < 10
fit = (A @ coef).reshape(box.shape)
resid = np.linalg.norm(box - fit, axis=2)
obj = np.zeros((H, W), np.uint8)
obj[y0:y1, x0:x1] = (resid > 14).astype(np.uint8) * 255
obj[y0:y1, x0:x1][(xx > 615) & (yy > 222)] = 0  # keep the top of his hair
n, lab, stats, _ = cv2.connectedComponentsWithStats(obj)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] < 6: obj[lab == i] = 0
np.save(D + '/sky_fit.npy', np.array([x0, y0, x1, y1]))
cv2.imwrite(D + '/obj-mask.png', obj)
# alpha for the sprite cut-outs, from how far each pixel is from the sky colour
alpha = np.zeros((H, W), np.float32)
alpha[y0:y1, x0:x1] = np.clip((resid - 6) / 30, 0, 1)
cv2.imwrite(D + '/obj-alpha.png', (alpha * 255).astype(np.uint8))
cv2.imwrite(D + '/sky-fit.png', np.clip(fit, 0, 255).astype(np.uint8))
