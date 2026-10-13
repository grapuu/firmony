"""Cuts the owner's pictures for the site: the logo with everything made from it, and any other picture on black.

    python3 scripts/art.py logo <source>
    python3 scripts/art.py picture <source> <name> [--size 800] [--cover 0.9]

The pictures are glossy 3D objects in iridescent glass on pure black, made by the owner in ChatGPT. Each is made
see-through before it goes in (`clear`): every pixel as opaque as its brightest colour, so the black around
the object disappears on any dark surface, and the outer edge fades out.

`logo` takes the glass F with its own transparency (art-src/icons/f.png) and writes every file that shows it;
the icons a phone shows on a square of its own and the picture of a shared link are on white, as the site is:

    public/art/logo.webp         where it stands alone
    public/art/logo-small.webp   next to the name, in the header and the footer
    public/favicon.ico           the tab of a browser: 16, 32 and 48 px
    public/art/icon-192.png      search results and Android
    public/art/icon-180.png      the home screen of an iPhone
    public/art/icon-512.png      the app on the home screen of an Android phone (public/manifest.webmanifest)
    public/art/share.png         what a link shows when it is sent to someone: the logo and the name, 1200 by 630

`picture` finds what is on the black, centres it on a square and writes public/art/<name>.webp at the size
given, and with `--small N` also public/art/<name>-<N>.webp for phones. A picture shown large needs twice its
width on the page. Then its slot in `ART` (src/config.ts) gets its path and size.

`icon` is for a picture that comes with a transparent background already (his second set, 13 October 2026, the
same glass in the brand's blue for the white parts): it is not made see-through again, only cut to what is in
it, centred on a square that it fills to `--cover`, and scaled with its colours premultiplied by their opacity,
so that no dark edge appears on white.

`whole` keeps the picture as it was composed (no centring): the aurora, and the phone whose beam has to land
on the receipt. `--bottom 0.7` cuts it off at 70 % of its height and `--fade 0.6` lets it fade out from 60 %
down to that cut, so that what lay below (the phone's own glass paper) is gone.

Nothing here is part of the site.
"""
import argparse
import os

import numpy
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PUBLIC = os.path.join(ROOT, 'public')
ART = os.path.join(PUBLIC, 'art')
FONT = os.path.join(PUBLIC, 'fonts', 'funnel-latin.woff2')
NAME = 'firmony'
# The blue of the name and the red of its full stop, as the header sets them (the sixth design).
BLUE = (28, 46, 240)
RED = (225, 52, 76)
WHITE = (255, 255, 255)

# How much of its square the picture's larger side takes.
LOGO_COVER = 0.88
ICON_COVER = 0.76
# Anything brighter than this (red + green + blue) belongs to the picture; the rest is the black around it.
BLACK = 48
# How much of each side, from the edge in, fades to nothing.
FEATHER = 0.05


def subject(picture):
    """The box around everything that is not black."""
    grey = picture.convert('RGB').convert('L')
    box = Image.eval(grey, lambda value: 255 if value * 3 > BLACK else 0).getbbox()
    if box is None:
        raise SystemExit('the picture is black all over')
    return box


def framed(picture, cover, size):
    """The picture's subject, centred on a black square, its larger side taking `cover` of the square."""
    left, top, right, bottom = subject(picture)
    side = max(right - left, bottom - top) / cover
    x = (left + right) / 2 - side / 2
    y = (top + bottom) / 2 - side / 2
    window = picture.convert('RGB').crop((round(x), round(y), round(x + side), round(y + side)))
    return window.resize((size, size), Image.LANCZOS)


def blurred(values, radius=3):
    """A box blur, twice over, along both sides of the picture."""
    out = values
    for axis in (0, 1):
        for _ in range(2):
            padded = numpy.pad(out, [(radius + 1, radius) if a == axis else (0, 0) for a in range(out.ndim)], mode='edge')
            summed = numpy.cumsum(padded, axis=axis)
            take = lambda start, stop: numpy.take(summed, range(start, stop), axis=axis)
            n = out.shape[axis]
            out = (take(2 * radius + 1, 2 * radius + 1 + n) - take(0, n)) / (2 * radius + 1)
    return out


def clear(picture):
    """The picture on black made see-through, its outer edge fading out (`FEATHER`)."""
    rgb = numpy.asarray(picture.convert('RGB'), dtype=numpy.float64) / 255
    alpha = rgb.max(axis=2)
    alpha[alpha < 2 / 255] = 0
    height, width = alpha.shape
    ramp = lambda n: numpy.clip(numpy.minimum(numpy.arange(n), numpy.arange(n)[::-1]) / max(1, FEATHER * n), 0, 1)
    edge = numpy.minimum.outer(ramp(height), ramp(width))
    edge = edge * edge * (3 - 2 * edge)
    colour = numpy.divide(rgb, alpha[..., None], out=numpy.zeros_like(rgb), where=alpha[..., None] > 0)
    # Where it is nearly see-through, the colour of its neighbourhood is taken: divided by its little brightness,
    # a dark pixel's colour is mostly the noise of its compression.
    smooth = numpy.divide(blurred(rgb), blurred(alpha)[..., None], out=numpy.zeros_like(rgb), where=blurred(alpha)[..., None] > 0)
    weight = numpy.clip(alpha / 0.25, 0, 1)[..., None]
    colour = colour * weight + smooth * (1 - weight)
    rgba = numpy.dstack([numpy.clip(colour, 0, 1), alpha * edge])
    return Image.fromarray(numpy.round(rgba * 255).astype(numpy.uint8), 'RGBA')


def save(image, path, **options):
    image.save(path, **options)
    print(f'{os.path.relpath(path, ROOT)}  {image.width} x {image.height}  {os.path.getsize(path) // 1024} kB')


def wordmark(height):
    """The name as the header sets it: Funnel Display, tight, in blue, its full stop in red. On white."""
    font = ImageFont.truetype(FONT, height)
    font.set_variation_by_axes([650])
    tracking = -0.045 * height
    text = NAME + '.'
    starts = [font.getlength(text[:i]) + i * tracking for i in range(len(text))]
    width = round(starts[-1] + font.getlength(text[-1]))
    ascent, descent = font.getmetrics()
    line = Image.new('RGB', (width + height, ascent + descent), WHITE)
    # The letters and the full stop are drawn as masks of their own: with the tight tracking the y reaches over
    # where the full stop begins, so a colour cut by position would tint its tail.
    name, dot = Image.new('L', line.size, 0), Image.new('L', line.size, 0)
    for i, (letter, start) in enumerate(zip(text, starts)):
        ImageDraw.Draw(dot if i == len(NAME) else name).text((height // 2 + start, 0), letter, font=font, fill=255)
    line.paste(Image.new('RGB', line.size, BLUE), (0, 0), name)
    line.paste(Image.new('RGB', line.size, RED), (0, 0), dot)
    ink = Image.new('L', line.size, 0)
    ink.paste(name, (0, 0), name)
    ink.paste(dot, (0, 0), dot)
    return line.crop(ink.getbbox())


def share(mark):
    """The glass F above the name, in the middle of a white sheet: it survives a platform that cuts it to a square."""
    sheet = Image.new('RGBA', (1200, 630), WHITE + (255,))
    mark = mark.resize((300, 300), Image.LANCZOS)
    mark = mark.crop(mark.getbbox())
    name = wordmark(96)
    gap = 36
    top = (sheet.height - (mark.height + gap + name.height)) // 2
    sheet.alpha_composite(mark, ((sheet.width - mark.width) // 2, top))
    sheet.paste(name, ((sheet.width - name.width) // 2, top + mark.height + gap))
    return sheet.convert('RGB')


def on_white(picture):
    """A see-through picture laid on white, for the icons a phone or a browser shows on a square of its own."""
    ground = Image.new('RGBA', picture.size, WHITE + (255,))
    return Image.alpha_composite(ground, picture).convert('RGB')


def logo(source):
    """The glass F, which comes with its own transparency (art-src/icons/f.png), and everything made from it.
    The tab of a browser keeps it see-through; the icons a phone lays on a square of its own, and the picture of
    a shared link, have it on white, as the site is."""
    os.makedirs(ART, exist_ok=True)
    save(icon(source, LOGO_COVER, 960), os.path.join(ART, 'logo.webp'), format='WEBP', quality=92, alpha_quality=80, method=6)
    save(icon(source, LOGO_COVER, 128), os.path.join(ART, 'logo-small.webp'), format='WEBP', quality=92, alpha_quality=80, method=6)
    icons = {size: icon(source, ICON_COVER, size) for size in (16, 32, 48, 180, 192, 512)}
    save(icons[48], os.path.join(PUBLIC, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icons[16], icons[32]])
    save(on_white(icons[192]), os.path.join(ART, 'icon-192.png'), format='PNG', optimize=True)
    save(on_white(icons[180]), os.path.join(ART, 'icon-180.png'), format='PNG', optimize=True)
    save(on_white(icons[512]), os.path.join(ART, 'icon-512.png'), format='PNG', optimize=True)
    save(share(icon(source, 1, 600)), os.path.join(ART, 'share.png'), format='PNG', optimize=True)


def whole(source, width, bottom=1.0, fade=None):
    """The picture as composed, made see-through, cut at `bottom` and faded out from `fade` down to the cut."""
    picture = Image.open(source).convert('RGB')
    if bottom < 1:
        picture = picture.crop((0, 0, picture.width, round(picture.height * bottom)))
    out = clear(picture)
    if fade is not None:
        rgba = numpy.asarray(out, dtype=numpy.float64)
        height = rgba.shape[0]
        top = fade / bottom * height
        rows = numpy.clip((height - numpy.arange(height)) / max(1, height - top), 0, 1)
        rows = rows * rows * (3 - 2 * rows)
        rgba[..., 3] *= rows[:, None]
        out = Image.fromarray(numpy.round(rgba).astype(numpy.uint8), 'RGBA')
    height = round(out.height * width / out.width)
    return out.resize((width, height), Image.LANCZOS)


def icon(source, cover, size):
    """A picture with its own transparency: cut to its subject, centred on a square, scaled premultiplied."""
    picture = Image.open(source).convert('RGBA')
    alpha = numpy.asarray(picture)[..., 3]
    rows = numpy.where(alpha.max(axis=1) > 8)[0]
    cols = numpy.where(alpha.max(axis=0) > 8)[0]
    subject = picture.crop((cols[0], rows[0], cols[-1] + 1, rows[-1] + 1))
    side = round(max(subject.size) / cover)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(subject, ((side - subject.width) // 2, (side - subject.height) // 2))
    return square.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')


def main():
    parser = argparse.ArgumentParser(description="Cuts the owner's pictures for the site.")
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('logo').add_argument('source')
    one = commands.add_parser('picture')
    one.add_argument('source')
    one.add_argument('name')
    one.add_argument('--size', type=int, default=800)
    one.add_argument('--cover', type=float, default=0.9)
    one.add_argument('--small', type=int)
    own = commands.add_parser('icon')
    own.add_argument('source')
    own.add_argument('name')
    own.add_argument('--size', type=int, default=960)
    own.add_argument('--cover', type=float, default=0.9)
    own.add_argument('--small', type=int)
    kept = commands.add_parser('whole')
    kept.add_argument('source')
    kept.add_argument('name')
    kept.add_argument('--width', type=int, default=1600)
    kept.add_argument('--small', type=int)
    kept.add_argument('--bottom', type=float, default=1.0)
    kept.add_argument('--fade', type=float)
    args = parser.parse_args()
    os.makedirs(ART, exist_ok=True)
    webp = dict(format='WEBP', quality=88, alpha_quality=70, method=6)
    if args.command == 'logo':
        logo(args.source)
    elif args.command == 'icon':
        for size, name in ((args.size, args.name), (args.small, f'{args.name}-{args.small}')):
            if size:
                save(icon(args.source, args.cover, size), os.path.join(ART, f'{name}.webp'), format='WEBP', quality=88, alpha_quality=92, method=6)
    elif args.command == 'whole':
        for width, name in ((args.width, args.name), (args.small, f'{args.name}-{args.small}')):
            if width:
                save(whole(args.source, width, args.bottom, args.fade), os.path.join(ART, f'{name}.webp'), **webp)
    else:
        for size, name in ((args.size, args.name), (args.small, f'{args.name}-{args.small}')):
            if size:
                save(clear(framed(Image.open(args.source), args.cover, size)), os.path.join(ART, f'{name}.webp'), **webp)


if __name__ == '__main__':
    main()
