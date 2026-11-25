#!/usr/bin/env python3
"""Build optimized gallery images + assets/gallery.json.

Usage: python3 tools/build_images.py [SRC_DIR] [OUT_DIR]
  SRC_DIR defaults to assets/source  (sub-folder name = category slug)
  OUT_DIR defaults to assets
Category labels/order live in tools/categories.json.
Outputs per photo: img/<cat>/<name>-600.webp, -1600.webp and an entry in gallery.json.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "assets/source"
out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "assets"
cats = json.loads((Path(__file__).parent / "categories.json").read_text(encoding="utf-8"))
EXT = {".jpg", ".jpeg", ".png", ".webp"}

def save(im, path, width, q):
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=q, method=6)

items = []
for cat in cats:
    folder = src / cat["slug"]
    if not folder.is_dir():
        continue
    for f in sorted(p for p in folder.iterdir() if p.suffix.lower() in EXT):
        im = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
        base = f"img/{cat['slug']}/{f.stem}"
        save(im, out / f"{base}-600.webp", 600, 72)
        save(im, out / f"{base}-1600.webp", 1600, 82)
        items.append({"cat": cat["slug"], "src": base, "w": im.width, "h": im.height,
                      "alt": f"{cat['label']} - עמנואל מימון צילום אירועים"})
        print("ok", f.name)
(out / "gallery.json").write_text(json.dumps(
    {"categories": [c for c in cats if any(i["cat"] == c["slug"] for i in items)], "items": items},
    ensure_ascii=False, indent=1), encoding="utf-8")
print(len(items), "photos")
