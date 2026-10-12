#!/usr/bin/env python3
"""
Draws the site's "j": the first letter of the Vice title and the browser tab icon.

Mr Dafoe's own j has a long, thin tail loop that closes up at small sizes (in a browser tab it looked
like a banana). This one is drawn as a brush stroke along a few Bézier curves: thick going down, thin
going up, with a wide, open loop at the bottom that crosses the stem and leads into the "e". It's in
Mr Dafoe's units (1000 per em, y up, baseline 0, advance 160), so it sits where the font's j would.

Writes:
    frontend/src/assets/brand-j.svg   the title's j (a mask; glass.css fills it with the neon gradient)
    frontend/public/favicon.svg       the tab icon: a bolder j on a dark tile

    python3 scripts/build_brand_j.py

The tab icon's PNG copies (favicon.ico at 16/32/48 px, apple-touch-icon.png at 180 px) are renders of
favicon.svg; redo them after changing it (e.g. screenshot it with Playwright), and bump the ?v= in
frontend/index.html so browsers drop their cached icon.
"""

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The centreline: cubic Béziers (start, control, control, end), y up.
STROKE = [
    [(250, 345), (200, 260), (110, 90), (30, -100)],  # the stem, slanting down
    [(30, -100), (-30, -260), (-130, -420), (-270, -405)],  # round the bottom
    [(-270, -405), (-440, -385), (-450, -200), (-300, -110)],  # up the left side
    [(-300, -110), (-180, -35), (20, 35), (160, 75)],  # across the stem, out towards the e
]

# Two weights of the same letter: the title's matches Mr Dafoe; the icon's survives 16 px.
TITLE = dict(thick=110, thin=40, taper_end=0.18, dot=(322, 482, 56, 42, 30))
ICON = dict(thick=150, thin=70, taper_end=0.12, dot=(352, 535, 74, 58, 30))

# Enough for smooth curves at title size, few enough that Vite inlines the title's j (under 4 KB).
SAMPLES_PER_CURVE = 36


def bezier(curve, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = curve
    u = 1 - t
    return (
        u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
        u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3,
    )


def outline(thick, thin, taper_end, dot):
    """The letter as SVG path data (y down): the stroke as one ribbon, round end caps, and the dot."""
    points = [bezier(curve, i / SAMPLES_PER_CURVE) for curve in STROKE for i in range(SAMPLES_PER_CURVE)]
    points.append(STROKE[-1][-1])

    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.dist(a, b))

    def direction(i):
        a, b = points[max(0, i - 1)], points[min(len(points) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1
        return dx / d, dy / d

    # A brush: wide where the stroke goes down, a hairline where it goes up or sideways; the end tapers.
    widths = []
    for i in range(len(points)):
        down = max(0.0, -direction(i)[1])
        width = thin + (thick - thin) * down**1.4
        progress = lengths[i] / lengths[-1]
        if progress > 1 - taper_end:
            width *= max(0.15, (1 - progress) / taper_end)
        widths.append(width)
    for _ in range(6):  # ease the changes
        widths = [widths[0]] + [(widths[i - 1] + 2 * widths[i] + widths[i + 1]) / 4 for i in range(1, len(widths) - 1)] + [widths[-1]]

    left, right = [], []
    for i, (x, y) in enumerate(points):
        dx, dy = direction(i)
        h = widths[i] / 2
        left.append((x - dy * h, y + dx * h))
        right.append((x + dy * h, y - dx * h))

    # One ribbon (it crosses itself at the loop; the nonzero fill rule keeps the crossing filled).
    ribbon = left + right[::-1]
    paths = [polygon(ribbon), circle(points[0], widths[0] / 2), circle(points[-1], widths[-1] / 2)]

    x, y, rx, ry, angle = dot
    a = math.radians(angle)
    ellipse = []
    for k in range(40):
        t = 2 * math.pi * k / 40
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        ellipse.append((x + ex * math.cos(a) - ey * math.sin(a), y + ex * math.sin(a) + ey * math.cos(a)))
    paths.append(polygon(ellipse))

    xs = [p[0] for p in ribbon + ellipse]
    ys = [p[1] for p in ribbon + ellipse]
    return "".join(paths), (min(xs), min(ys), max(xs), max(ys))


def polygon(points):
    return "M" + "L".join(f"{round(x)} {round(-y)}" for x, y in points) + "Z"


def circle(center, r):
    x, y = round(center[0]), round(-center[1])
    r = round(r)
    return f"M{x - r} {y}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0Z"


def title_svg():
    """The j alone, its viewBox the letter's bounds: glass.css places it from these numbers (BOUNDS)."""
    path, (x0, y0, x1, y1) = outline(**TITLE)
    left, top, width, height = math.floor(x0), -math.ceil(y1), math.ceil(x1) - math.floor(x0), math.ceil(y1) - math.floor(y0)
    print(f"title j: left {left}, top {top}, width {width}, height {height} (font units; glass.css .brand-j::before)")
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{left} {top} {width} {height}"><path d="{path}"/></svg>\n'


def icon_svg():
    """The bold j on a dark rounded tile, in the title's sunset colours, with a purple shadow and a glow."""
    path, (x0, y0, x1, y1) = outline(**ICON)
    side = max(x1 - x0, y1 - y0) * 1.12
    cx, cy = (x0 + x1) / 2, -(y0 + y1) / 2
    left, top, side = round(cx - side / 2), round(cy - side / 2), round(side)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{left} {top} {side} {side}">'
        '<defs>'
        '<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0f4d"/><stop offset="1" stop-color="#14061f"/></linearGradient>'
        f'<linearGradient id="sun" gradientUnits="userSpaceOnUse" x1="{round(x1)}" y1="{round(-y1)}" x2="{round(x0)}" y2="{round(-y0)}">'
        '<stop offset="0" stop-color="#ffd36e"/><stop offset=".3" stop-color="#ff8a5c"/><stop offset=".6" stop-color="#ff3ea5"/><stop offset="1" stop-color="#9b5cff"/>'
        '</linearGradient>'
        '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>'
        f'<path id="j" d="{path}"/>'
        '</defs>'
        f'<rect x="{left}" y="{top}" width="{side}" height="{side}" rx="{round(side * 0.22)}" fill="url(#tile)"/>'
        '<use href="#j" fill="#ff3ea5" opacity=".5" filter="url(#glow)"/>'
        '<use href="#j" fill="#5a1f9a" transform="translate(26 26)"/>'
        '<use href="#j" fill="url(#sun)"/>'
        '</svg>\n'
    )


def main():
    (ROOT / "frontend/src/assets/brand-j.svg").write_text(title_svg())
    (ROOT / "frontend/public/favicon.svg").write_text(icon_svg())
    print("wrote frontend/src/assets/brand-j.svg and frontend/public/favicon.svg")


if __name__ == "__main__":
    main()
