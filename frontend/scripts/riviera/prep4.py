# Step 4: masks (at the original 1672x941; the shader scales them up smoothly).
import cv2, numpy as np, sys
D = sys.argv[1]
plate = cv2.resize(cv2.imread(D + '/plate-4k.png'), (1672, 941), interpolation=cv2.INTER_AREA)
H, W = plate.shape[:2]
hsv = cv2.cvtColor(plate, cv2.COLOR_BGR2HSV).astype(np.int32)
h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
yy, xx = np.mgrid[0:H, 0:W]

# Sky: flood fill across the smooth gradient from a few seeds.
sky = np.zeros((H + 2, W + 2), np.uint8)
blur = cv2.GaussianBlur(plate, (3, 3), 0)
for seed in [(900, 40), (1200, 150), (1300, 280), (520, 160), (1550, 330), (1000, 300), (1640, 420), (1150, 470), (200, 330), (1450, 500)]:
    cv2.floodFill(blur.copy(), sky, seed, 0, (3, 3, 3), (3, 3, 3), 4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
sky = sky[1:-1, 1:-1]
sky[yy > 578] = 0
sky = cv2.morphologyEx(sky, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

# Water: below the horizon, bluish (or the gold sun path), above the sand; minus the lifeguard hut.
water = ((yy >= 579) & (yy <= 712) & (xx > 900)) & ((plate[..., 0].astype(int) > plate[..., 2] - 10) | ((xx > 1480) & (v > 200) & (yy < 690)))
water = water.astype(np.uint8) * 255
water = cv2.morphologyEx(water, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
water = cv2.morphologyEx(water, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
# not the bike: its dark parts, and nothing left of the front wheel below the strip above it
bike = ((v < 125) | ((s < 40) & (v < 190))) & (xx < 1150)
bike = cv2.dilate(bike.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
water[bike | ((xx < 1135) & (yy > 612))] = 0
hut = np.zeros_like(water); cv2.rectangle(hut, (1462, 616), (1592, 730), 255, -1)
water[hut > 0] = 0
# fade the water's movement out near the hut and the bike instead of stopping at a hard edge
still = (hut > 0) | ((xx < 1135) & (yy > 612))
calm = cv2.distanceTransform(np.where(still, 0, 255).astype(np.uint8), cv2.DIST_L2, 5)
# Foam: the near-white parts of the water near the shore.
foam = ((water > 0) | ((yy > 640) & (yy < 715) & (xx > 900))) & (s < 70) & (v > 185) & (yy > 640)
foam = foam.astype(np.uint8) * 255
foam[(hut > 0) | bike | ((xx < 1135) & (yy > 612))] = 0

# Palms that sway: everything that isn't sky in the palm regions, padded so leaves can move over sky.
palm_l = ((sky == 0) & (((xx < 345) & (yy < 255)) | ((xx < 316) & (yy < 470))) & ((v < 165) | ((h >= 18) & (h <= 45) & (s > 90)))).astype(np.uint8) * 255
palm_r = ((sky == 0) & (xx > 1400) & (yy < 200)).astype(np.uint8) * 255
def sway(m, weight):
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    return (cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 3) * weight)
# the left palms bend from their bases (~y 480), the corner leaves from the top-right corner
wl = np.clip((480 - yy) / 420, 0, 1) ** 1.5
wr = np.clip(np.hypot(W - xx, yy) / 260, 0, 1)
palm = np.maximum(sway(palm_l, wl), sway(palm_r, wr))

# Smoke: the pale pink puffs behind the bike.
smoke = ((xx > 200) & (xx < 545) & (yy > 502) & (yy < 725) & (s < 95) & (v > 140) & (h > 120) | ((xx > 200) & (xx < 545) & (yy > 502) & (yy < 725) & (s < 60) & (v > 150)))
smoke = smoke.astype(np.uint8) * 255
smoke = cv2.morphologyEx(smoke, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
smoke = cv2.GaussianBlur(cv2.dilate(smoke, np.ones((7, 7), np.uint8)), (0, 0), 4)

# The lifeguard flag and the sailboat, padded for their movement.
flag = np.zeros((H, W), np.uint8); cv2.rectangle(flag, (1462, 608), (1484, 632), 255, -1)
flag = cv2.GaussianBlur(flag, (0, 0), 2)
boat = np.zeros((H, W), np.uint8); cv2.rectangle(boat, (1586, 553), (1606, 584), 255, -1)
boat = cv2.GaussianBlur(boat, (0, 0), 2)

f = lambda m: np.clip(m if m.dtype != np.uint8 else m.astype(np.float32) / 255, 0, 1)
# Two plain RGB images (no alpha: browsers may drop colour under transparent pixels).
# a: water, foam, smoke.  b: sky, palm sway, extras (the flag left of x=1540, the boat right of it).
masks_a = np.dstack([f(cv2.GaussianBlur(water, (0, 0), 1.5)) * np.clip(calm / 18, 0, 1), f(cv2.GaussianBlur(foam, (0, 0), 1.2)), f(smoke)])
# The exact sky, for hiding birds and the plane behind things. The flood fill can't reach the sky
# showing between palm leaves, so near the palms also count anything close to the sky's colour there.
ref_small = cv2.inpaint(cv2.resize(plate, (W // 4, H // 4), interpolation=cv2.INTER_AREA),
                        cv2.resize(255 - sky, (W // 4, H // 4), interpolation=cv2.INTER_NEAREST), 5, cv2.INPAINT_TELEA)
ref = cv2.GaussianBlur(cv2.resize(ref_small, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), 6).astype(np.float32)
near_palms = ((xx < 360) | ((xx > 1390) & (yy < 215))) & (yy < 480)
pockets = near_palms & (np.linalg.norm(plate.astype(np.float32) - ref, axis=2) < 16)
sky_exact = np.where(pockets, 255, sky).astype(np.uint8)
sky_exact[yy > 578] = 0
sky_core = cv2.erode(sky, np.ones((5, 5), np.uint8))  # off the soft edges of hair and rooftops
masks_b = np.dstack([f(cv2.GaussianBlur(sky_core, (0, 0), 0.8)), f(palm), np.maximum(f(flag), f(boat))])
# c: the exact sky (g and b are free for later, e.g. lit windows at night).
z = np.zeros((H, W), np.float32)
masks_c = np.dstack([f(cv2.GaussianBlur(sky_exact, (0, 0), 0.6)), z, z])
for name, m in [('masks-a', masks_a), ('masks-b', masks_b), ('masks-c', masks_c)]:
    cv2.imwrite(f'{D}/{name}.png', (m * 255).astype(np.uint8)[..., ::-1])
# preview: each mask tinted over the image
view = plate.astype(np.float32)
for m, col in [(f(water), (255, 120, 0)), (f(foam), (255, 255, 255)), (f(smoke), (0, 0, 255)), (f(sky) * 0.5, (0, 255, 255)), (palm, (0, 255, 0)), (f(flag), (255, 0, 255)), (f(boat), (255, 0, 255))]:
    view = view * (1 - m[..., None] * 0.6) + np.array(col) * m[..., None] * 0.6
cv2.imwrite(D + '/masks-view.png', view.astype(np.uint8))
cv2.imwrite(D + '/mv-water.png', cv2.resize(view[560:740, 880:1672].astype(np.uint8), None, fx=1.2, fy=1.2))
cv2.imwrite(D + '/mv-left.png', view[0:740, 0:560].astype(np.uint8))
v = plate.copy(); v[sky_exact == 0] //= 3
cv2.imwrite(D + '/mv-sky.png', v[0:500, 0:560])
