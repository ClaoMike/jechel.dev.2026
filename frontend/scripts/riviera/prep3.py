# Step 3: cut the plane and banner out as a transparent sprite, with a blank banner.
import cv2, numpy as np, sys, json
D = sys.argv[1]
big = cv2.imread(D + '/4k-anime.png').astype(np.float32)
plate = cv2.imread(D + '/plate-4k.png').astype(np.float32)
K = 3840 / 1672
x0, y0, x1, y1 = [int(round(v * K)) for v in (508, 104, 734, 192)]
I, B = big[y0:y1, x0:x1], plate[y0:y1, x0:x1]
d = np.linalg.norm(I - B, axis=2)
a = np.clip((d - 5) / 35, 0, 1)
a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
# solid inside the banner and plane bodies: fill holes of the strongly-different region
solid = cv2.morphologyEx((d > 25).astype(np.uint8), cv2.MORPH_OPEN, np.ones((11, 11), np.uint8))  # drops the thin rope
n, lab, st, _ = cv2.connectedComponentsWithStats(solid)
banner_id = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
banner = (lab == banner_id).astype(np.uint8) * 255
cnts, _ = cv2.findContours(banner, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
hull = cv2.convexHull(max(cnts, key=cv2.contourArea))
fillb = np.zeros_like(banner); cv2.fillPoly(fillb, [hull], 255)
a = np.maximum(a, cv2.erode(fillb, np.ones((7, 7), np.uint8)).astype(np.float32) / 255)
# tighten the banner's edge by a couple of px so no sky fringe shows around it
edge = cv2.GaussianBlur(cv2.erode(fillb, np.ones((5, 5), np.uint8)).astype(np.float32) / 255, (0, 0), 1)
near = cv2.dilate(fillb, np.ones((15, 15), np.uint8)) > 0
a = np.where(near, np.minimum(a, edge), a)
F = np.where(a[..., None] > 0.02, (I - (1 - a[..., None]) * B) / np.maximum(a[..., None], 0.02), I)
F = np.clip(F, 0, 255)
# blank the banner: inpaint the text and logo with the cloth around them
inner = cv2.erode(fillb, np.ones((13, 13), np.uint8))
g = F.astype(np.uint8)
hsv = cv2.cvtColor(g, cv2.COLOR_BGR2HSV)
ink = ((hsv[..., 2] < 175) | (hsv[..., 1] > 75)) & (inner > 0)
ink = cv2.dilate(ink.astype(np.uint8) * 255, np.ones((7, 7), np.uint8)) & inner
g = cv2.inpaint(g, ink, 9, cv2.INPAINT_TELEA)
# smooth the inpainted cloth a little so no ghost letters show
sm = cv2.bilateralFilter(g, 15, 40, 9)
w = cv2.GaussianBlur(ink.astype(np.float32) / 255, (0, 0), 4)[..., None]
g = (g * (1 - w) + sm * w).astype(np.uint8)
rgba = np.dstack([g, (a * 255).astype(np.uint8)])
cv2.imwrite(D + '/plane.png', rgba)
# the banner's corners (sprite px) so text can be drawn onto it
quad = cv2.approxPolyDP(hull, 0.03 * cv2.arcLength(hull, True), True).reshape(-1, 2)
print(json.dumps({'size': [x1 - x0, y1 - y0], 'quad': quad.tolist(), 'pos4k': [x0, y0]}))
v = np.full((y1 - y0, x1 - x0, 3), 60, np.uint8); al = a[..., None]
cv2.imwrite(D + '/plane-view.png', cv2.resize((g * al + v * (1 - al)).astype(np.uint8), None, fx=2, fy=2))
