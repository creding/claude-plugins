#!/usr/bin/env python3
"""WCAG contrast ratio for any text or label (target >= 4.5:1, or >= 3:1 for text over ~36 px bold).

  python3 contrast.py "#F4F1EA" "#1B1E26"          two colours
  python3 contrast.py still.png x0 y0 x1 y1        a box around a label in a rendered still: compares the
                                                   text pixels (2nd/98th percentile) with the background (median)"""
import sys


def lum(rgb):
    def ch(c): c /= 255; return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb[:3]); return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)


def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) == 2: r = ratio(hexrgb(a[0]), hexrgb(a[1]))
    elif len(a) == 5:
        from PIL import Image
        px = sorted(Image.open(a[0]).convert('RGB').crop(tuple(map(int, a[1:]))).getdata(), key=lum)
        bg = px[len(px) // 2]                                   # background dominates the box: take the median pixel
        lo, hi = px[len(px) * 2 // 100], px[len(px) * 98 // 100]  # text is the extreme on one side (2nd / 98th percentile)
        r = max(ratio(bg, lo), ratio(bg, hi))
    else: print(__doc__); sys.exit(1)
    print(f'{r:.2f}:1  ' + ('pass' if r >= 4.5 else 'pass for large bold text only' if r >= 3 else 'FAIL')); sys.exit(0 if r >= 3 else 1)
