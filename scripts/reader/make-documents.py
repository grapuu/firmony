#!/usr/bin/env python3
"""Makes the reader's test set (20 October 2026, "Start here" item 10.2b): made-up Slovak documents as photos and
PDFs, each with what is on it, so `npm run test:reader` can measure the real reader field by field.

Every company, number and code here is invented (TEST names, IČO that belong to nobody). The documents are addressed
to the test company the harness names to the reader: TEST Odberateľ s. r. o., IČO 50000005.

Run: python3 scripts/reader/make-documents.py   (writes test/reader/docs/*.jpg|png|pdf and test/reader/expected.json)
"""
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'test', 'reader', 'docs')
FONTS = '/usr/share/fonts/truetype/dejavu'
MONO = os.path.join(FONTS, 'DejaVuSansMono.ttf')
MONO_B = os.path.join(FONTS, 'DejaVuSansMono-Bold.ttf')
SANS = os.path.join(FONTS, 'DejaVuSans.ttf')
SANS_B = os.path.join(FONTS, 'DejaVuSans-Bold.ttf')
US = {'name': 'TEST Odberateľ s. r. o.', 'ico': '50000005', 'dic': '2120000005', 'icdph': 'SK2120000005', 'address': 'Hlavná 12, 040 01 Košice'}
with open(os.path.join(ROOT, 'test', 'reader', 'categories.json'), encoding='utf-8') as category_file:
    CATEGORY_EXPECTATIONS = json.load(category_file)

rnd = random.Random(20261020)


def font(path, size):
    return ImageFont.truetype(path, size)


def money(cents):
    """12,40 as a Slovak document writes it, with a space in thousands."""
    sign = '-' if cents < 0 else ''
    cents = abs(cents)
    whole = f'{cents // 100:,}'.replace(',', ' ')
    return f'{sign}{whole},{cents % 100:02d}'


def day_sk(iso):
    y, m, d = iso.split('-')
    return f'{int(d)}.{int(m)}.{y}'


def hexcode(n):
    return ''.join(rnd.choice('0123456789ABCDEF') for _ in range(n))


def vat_of_gross(gross, rate):
    return round(gross * rate / (100 + rate))


def vat_of_net(net, rate):
    return round(net * rate / 100)


# ----------------------------------------------------------------------------------------------------------------
# Effects of a real photo


def rotate(img, deg):
    return img.rotate(deg, resample=Image.BICUBIC, expand=True, fillcolor=(236, 233, 226))


def noise(img, amount=10):
    arr = np.asarray(img).astype(np.int16)
    arr = arr + np.random.default_rng(rnd.randint(0, 10**6)).normal(0, amount, arr.shape).astype(np.int16)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def crumple(img):
    """Folds of a receipt kept in a pocket: soft dark and light bands across it."""
    w, h = img.size
    shade = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(shade)
    for _ in range(7):
        y = rnd.randint(0, h)
        tilt = rnd.randint(-60, 60)
        d.line([(0, y), (w, y + tilt)], fill=rnd.choice([40, 70]), width=rnd.randint(6, 18))
    shade = shade.filter(ImageFilter.GaussianBlur(9))
    dark = Image.new('RGB', (w, h), (120, 115, 105))
    return Image.composite(dark, img, shade)


def perspective(img, strength=0.06):
    """A photo taken at an angle: the top narrower than the bottom."""
    w, h = img.size
    dx = int(w * strength)
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(dx, rnd.randint(0, dx // 2)), (w - dx, 0), (w, h), (0, h - rnd.randint(0, dx // 2))]
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    coeffs = np.linalg.solve(np.array(m, dtype=float), np.array([c for p in src for c in p], dtype=float))
    return img.transform((w, h), Image.PERSPECTIVE, coeffs.tolist(), Image.BICUBIC, fillcolor=(236, 233, 226))


def photo(img, deg=0.0, blur=0.0, crumpled=False, angle=0.0, grain=8):
    if crumpled:
        img = crumple(img)
    if angle:
        img = perspective(img, angle)
    if deg:
        img = rotate(img, deg)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return noise(img, grain)


# ----------------------------------------------------------------------------------------------------------------
# An eKasa receipt


def receipt(seller, items, iso, clock, number, offline=False):
    """items: (name, quantity, unit price with VAT in cents, rate)."""
    w = 560
    lines = []
    f, fb = font(MONO, 21), font(MONO_B, 23)
    lines.append(('c', seller['name'], fb))
    lines.append(('c', seller['address'], f))
    lines.append(('c', f"IČO: {seller['ico']}  DIČ: {seller['dic']}", f))
    if seller.get('icdph'):
        lines.append(('c', f"IČ DPH: {seller['icdph']}", f))
    lines.append(('c', f"Kód pokladnice: 88820{rnd.randint(10000000000, 99999999999)}", f))
    lines.append(('l', '-' * 40, f))
    lines.append(('c', 'POKLADNIČNÝ DOKLAD', fb))
    lines.append(('l', f'Číslo dokladu: {number}', f))
    by_rate = {}
    total = 0
    for name, qty, unit, rate in items:
        gross = qty * unit
        total += gross
        by_rate[rate] = by_rate.get(rate, 0) + gross
        lines.append(('l', name, f))
        lines.append(('lr', (f'  {qty} x {money(unit)}   {rate} %', money(gross)), f))
    lines.append(('l', '-' * 40, f))
    lines.append(('lr', ('SPOLU EUR', money(total)), fb))
    lines.append(('l', '', f))
    lines.append(('lr', ('Sadzba    Základ      DPH', ''), f))
    vat_total = 0
    vat_lines = []
    for rate in sorted(by_rate, reverse=True):
        gross = by_rate[rate]
        vat = vat_of_gross(gross, rate)
        vat_total += vat
        vat_lines.append({'rate': rate, 'base': gross - vat, 'vat': vat})
        lines.append(('lr', (f'{rate:>3} %   {money(gross - vat):>10}', money(vat)), f))
    lines.append(('lr', ('DPH spolu', money(vat_total)), f))
    lines.append(('lr', ('Hotovosť' if rnd.random() < 0.5 else 'Platobná karta', money(total)), f))
    lines.append(('l', '-' * 40, f))
    lines.append(('l', f'{day_sk(iso)} {clock}', f))
    uid = None
    okp = '-'.join(hexcode(8) for _ in range(5))
    if offline:
        lines.append(('l', 'OFF-LINE DOKLAD', fb))
    else:
        uid = 'O-' + hexcode(32)
        lines.append(('l', 'UID:', f))
        lines.append(('l', uid, font(MONO, 18)))
    lines.append(('l', 'OKP:', f))
    lines.append(('l', okp, font(MONO, 18)))
    lines.append(('c', 'Ďakujeme za nákup', f))
    h = 60 + 30 * len(lines)
    img = Image.new('RGB', (w, h), (252, 251, 247))
    d = ImageDraw.Draw(img)
    y = 30
    for align, text, fnt in lines:
        if align == 'c':
            tw = d.textlength(text, font=fnt)
            d.text(((w - tw) / 2, y), text, font=fnt, fill=(30, 30, 30))
        elif align == 'lr':
            left, right = text
            d.text((24, y), left, font=fnt, fill=(30, 30, 30))
            if right:
                d.text((w - 24 - d.textlength(right, font=fnt), y), right, font=fnt, fill=(30, 30, 30))
        else:
            d.text((24, y), text, font=fnt, fill=(30, 30, 30))
        y += 30
    expected = {
        'kind': 'receipt', 'party': seller['name'], 'partyIco': seller['ico'], 'number': number, 'vs': None,
        'issuedOn': iso, 'dueOn': None, 'totalCents': total, 'vatCents': vat_total, 'currency': 'EUR',
        'ekasaUid': uid, 'ekasaOkp': okp, 'vatLines': vat_lines,
    }
    return img, expected


# ----------------------------------------------------------------------------------------------------------------
# An invoice


def invoice(supplier, customer, number, iso, due, items, payer=True, currency='EUR', vs=None, supplied=None, title='FAKTÚRA',
            english=False, reverse=False, corrects=None, note=None, issued_by_us=False):
    """items: (description, quantity, unit, unit price without VAT in cents, rate)."""
    W, H = 1240, 1754
    img = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    f, fs, fb, ft = font(SANS, 22), font(SANS, 19), font(SANS_B, 22), font(SANS_B, 40)
    ink, grey = (25, 25, 30), (95, 95, 105)
    t = {
        'supplier': 'Supplier' if english else 'Dodávateľ', 'customer': 'Customer' if english else 'Odberateľ',
        'number': 'Invoice No.' if english else 'Číslo faktúry', 'issued': 'Issue date' if english else 'Dátum vystavenia',
        'supplied': 'Date of supply' if english else 'Dátum dodania', 'due': 'Due date' if english else 'Dátum splatnosti',
        'vs': 'Payment reference' if english else 'Variabilný symbol', 'iban': 'IBAN', 'total': 'Total due' if english else 'Spolu na úhradu',
        'desc': 'Description' if english else 'Popis', 'qty': 'Qty' if english else 'Množstvo', 'price': 'Unit price' if english else 'Cena za MJ',
        'rate': 'VAT' if english else 'DPH %', 'sum': 'Amount' if english else 'Spolu bez DPH', 'base': 'Tax base' if english else 'Základ dane',
    }
    d.text((70, 60), title, font=ft, fill=ink)
    d.text((W - 70 - d.textlength(f"{t['number']} {number}", font=fb), 75), f"{t['number']} {number}", font=fb, fill=ink)

    def party(x, label, p):
        y = 160
        d.text((x, y), label, font=fs, fill=grey)
        y += 32
        d.text((x, y), p['name'], font=fb, fill=ink)
        for line in [p.get('address'), f"IČO: {p['ico']}" if p.get('ico') else None, f"DIČ: {p['dic']}" if p.get('dic') else None,
                     (f"IČ DPH: {p['icdph']}" if not english else f"VAT ID: {p['icdph']}") if p.get('icdph') else None, p.get('register')]:
            if line:
                y += 30
                d.text((x, y), line, font=fs, fill=ink)

    party(70, t['supplier'], supplier)
    party(660, t['customer'], customer)
    y = 450
    rows = [(t['issued'], day_sk(iso))]
    if supplied:
        rows.append((t['supplied'], day_sk(supplied)))
    if due:
        rows.append((t['due'], day_sk(due)))
    if vs:
        rows.append((t['vs'], vs))
    if supplier.get('iban'):
        rows.append((t['iban'], ' '.join(supplier['iban'][i:i + 4] for i in range(0, len(supplier['iban']), 4))))
    for label, value in rows:
        d.text((70, y), label, font=fs, fill=grey)
        d.text((360, y), value, font=f, fill=ink)
        y += 34
    y += 30
    cols = [70, 640, 790, 960, 1170]
    d.line([(70, y), (W - 70, y)], fill=(200, 200, 205), width=2)
    y += 10
    heads = [t['desc'], t['qty'], t['price']] + ([t['rate']] if payer else []) + [t['sum']]
    d.text((cols[0], y), heads[0], font=fs, fill=grey)
    d.text((cols[1], y), heads[1], font=fs, fill=grey)
    d.text((cols[2], y), heads[2], font=fs, fill=grey)
    if payer:
        d.text((cols[3] - 40, y), heads[3], font=fs, fill=grey)
    d.text((cols[4] - d.textlength(heads[-1], font=fs), y), heads[-1], font=fs, fill=grey)
    y += 36
    by_rate = {}
    for desc, qty, unit, price, rate in items:
        net = round(qty * price)
        by_rate[rate] = by_rate.get(rate, 0) + net
        d.text((cols[0], y), desc, font=f, fill=ink)
        d.text((cols[1], y), f'{qty} {unit}', font=f, fill=ink)
        d.text((cols[2], y), money(price), font=f, fill=ink)
        if payer:
            d.text((cols[3] - 40, y), f'{rate} %', font=f, fill=ink)
        s = money(net)
        d.text((cols[4] - d.textlength(s, font=f), y), s, font=f, fill=ink)
        y += 36
    d.line([(70, y + 6), (W - 70, y + 6)], fill=(200, 200, 205), width=2)
    y += 30
    total_net = sum(by_rate.values())
    vat_total = 0
    vat_lines = []
    if payer:
        for rate in sorted(by_rate, reverse=True):
            vat = 0 if reverse else vat_of_net(by_rate[rate], rate)
            vat_total += vat
            vat_lines.append({'rate': 0 if reverse else rate, 'base': by_rate[rate], 'vat': vat})
            label = (f"{t['base']} {rate} %" if not reverse else t['base'])
            d.text((660, y), label, font=fs, fill=grey)
            s = f'{money(by_rate[rate])} {currency}'
            d.text((W - 70 - d.textlength(s, font=f), y), s, font=f, fill=ink)
            y += 32
            d.text((660, y), (f'DPH {rate} %' if not reverse else ('VAT 0 %' if english else 'DPH 0 %')), font=fs, fill=grey)
            s = f'{money(vat)} {currency}'
            d.text((W - 70 - d.textlength(s, font=f), y), s, font=f, fill=ink)
            y += 32
    total = total_net + vat_total
    y += 14
    d.text((660, y), t['total'], font=fb, fill=ink)
    s = f'{money(total)} {currency}'
    d.text((W - 70 - d.textlength(s, font=fb), y), s, font=fb, fill=ink)
    y += 70
    notes = []
    if not payer and not english:
        notes.append('Dodávateľ nie je platiteľom DPH.')
    if reverse:
        notes.append('Reverse charge: VAT to be accounted for by the customer.' if english else 'Prenesenie daňovej povinnosti.')
    if corrects:
        notes.append(f'Opravuje faktúru č. {corrects}.' if not english else f'Credit note to invoice {corrects}.')
    if note:
        notes.append(note)
    for n in notes:
        d.text((70, y), n, font=fs, fill=ink)
        y += 32
    d.text((70, H - 90), supplier.get('register') or '', font=font(SANS, 16), fill=grey)
    other = customer if issued_by_us else supplier
    expected = {
        'kind': 'invoice_out' if issued_by_us else 'invoice_in', 'party': other['name'], 'partyIco': other.get('ico'),
        'number': number, 'vs': vs, 'issuedOn': iso, 'dueOn': due, 'totalCents': abs(total), 'vatCents': abs(vat_total),
        'currency': currency, 'corrects': corrects, 'vatLines': vat_lines or None,
    }
    return img, expected


# ----------------------------------------------------------------------------------------------------------------
# The set

SELLERS = [
    {'name': 'Kaviareň Pod Hradom s. r. o.', 'ico': '50100011', 'dic': '2120100011', 'icdph': 'SK2120100011', 'address': 'Hradná 4, 040 01 Košice'},
    {'name': 'Potraviny Tatra s. r. o.', 'ico': '50100029', 'dic': '2120100029', 'icdph': 'SK2120100029', 'address': 'Štúrova 18, 811 02 Bratislava'},
    {'name': 'Čerpacia stanica Duna a. s.', 'ico': '50100037', 'dic': '2020100037', 'icdph': 'SK2020100037', 'address': 'Rožňavská 2, 821 04 Bratislava'},
    {'name': 'Lekáreň Zdravie s. r. o.', 'ico': '50100045', 'dic': '2120100045', 'icdph': 'SK2120100045', 'address': 'Mlynská 9, 040 01 Košice'},
    {'name': 'Reštaurácia U Troch Lipiek s. r. o.', 'ico': '50100053', 'dic': '2120100053', 'icdph': 'SK2120100053', 'address': 'Lipová 3, 974 01 Banská Bystrica'},
    {'name': 'Parkovisko Centrum s. r. o.', 'ico': '50100061', 'dic': '2120100061', 'icdph': 'SK2120100061', 'address': 'Námestie SNP 1, 811 01 Bratislava'},
    {'name': 'Železiarstvo Klinec s. r. o.', 'ico': '50100070', 'dic': '1020100070', 'icdph': None, 'address': 'Kováčska 21, 040 01 Košice'},
    {'name': 'Papiernictvo Pero s. r. o.', 'ico': '50100088', 'dic': '2120100088', 'icdph': 'SK2120100088', 'address': 'Hlavná 77, 080 01 Prešov'},
    {'name': 'Taxi Rýchlo s. r. o.', 'ico': '50100096', 'dic': '2120100096', 'icdph': 'SK2120100096', 'address': 'Južná trieda 5, 040 01 Košice'},
    {'name': 'Elektro Iskra s. r. o.', 'ico': '50100100', 'dic': '2120100100', 'icdph': 'SK2120100100', 'address': 'Priemyselná 8, 010 01 Žilina'},
]

RECEIPTS = [
    (0, [('Cappuccino', 2, 290, 23), ('Croissant maslový', 2, 230, 19)], '2026-10-14', '08:41', '0000412', {'deg': 2.5}),
    (1, [('Chlieb kváskový 500 g', 1, 249, 5), ('Mlieko 1,5 % 1 l', 3, 99, 5), ('Káva zrnková 1 kg', 1, 1890, 23), ('Pracie gélové 2 l', 1, 899, 23)], '2026-10-03', '17:22', '0018833', {'deg': -4, 'blur': 0.6}),
    (2, [('Natural 95', 42, 162, 23), ('Umývanie auta', 1, 900, 23)], '2026-09-28', '07:05', '0102274', {'deg': 6, 'crumpled': True}),
    (3, [('Ibuprofen 400 mg', 1, 589, 5), ('Rúška 10 ks', 1, 350, 23)], '2026-10-09', '12:10', '0003921', {'angle': 0.07}),
    (4, [('Pracovný obed', 3, 1250, 19), ('Minerálka 0,33', 3, 220, 23)], '2026-10-01', '13:48', '0007710', {'deg': -2, 'crumpled': True, 'blur': 0.8}),
    (5, [('Parkovanie 3 h', 1, 600, 23)], '2026-10-12', '10:00', '0029911', {}),
    (6, [('Skrutky 4x40 bal.', 4, 245, 23), ('Vŕtací vrták 8 mm', 2, 690, 23)], '2026-09-30', '15:30', '0000088', {'deg': 3.5, 'angle': 0.05}),
    (7, [('Kancelársky papier A4', 5, 489, 23), ('Pero gélové', 10, 120, 23), ('Zošit A5', 6, 95, 23)], '2026-10-06', '09:12', '0004521', {'deg': -6}),
    (8, [('Preprava osôb', 1, 1480, 19)], '2026-10-15', '23:44', '0011207', {'blur': 1.0, 'crumpled': True}),
    (9, [('USB-C kábel 2 m', 2, 1299, 23), ('Batérie AA 4 ks', 1, 499, 23)], '2026-10-11', '18:03', '0006640', {'deg': 1.5, 'offline': True}),
]

SUPPLIERS = [
    {'name': 'Webhosting Sever s. r. o.', 'ico': '50200015', 'dic': '2120200015', 'icdph': 'SK2120200015', 'address': 'Severná 3, 010 01 Žilina', 'iban': 'SK3111000000002612345678', 'register': 'Zapísaná v OR Okresného súdu Žilina, oddiel Sro, vložka č. 70001/L'},
    {'name': 'Účtovná kancelária Bilancia s. r. o.', 'ico': '50200023', 'dic': '2120200023', 'icdph': 'SK2120200023', 'address': 'Kováčska 40, 040 01 Košice', 'iban': 'SK8909000000005123456789', 'register': 'Zapísaná v OR Mestského súdu Košice, oddiel Sro, vložka č. 70002/V'},
    {'name': 'Grafika Jana Malá', 'ico': '50200031', 'dic': '1120200031', 'icdph': None, 'address': 'Jarná 7, 080 01 Prešov', 'iban': 'SK6802000000003456789012', 'register': 'Zapísaná v Živnostenskom registri Okresného úradu Prešov č. 770-12345'},
    {'name': 'Nábytok Dub s. r. o.', 'ico': '50200040', 'dic': '2120200040', 'icdph': 'SK2120200040', 'address': 'Lesná 15, 960 01 Zvolen', 'iban': 'SK2575000000004012345678', 'register': 'Zapísaná v OR Okresného súdu Banská Bystrica, oddiel Sro, vložka č. 70003/S'},
    {'name': 'Telekom Signál a. s.', 'ico': '50200058', 'dic': '2020200058', 'icdph': 'SK2020200058', 'address': 'Bajkalská 28, 821 09 Bratislava', 'iban': 'SK5611000000002698765432', 'register': 'Zapísaná v OR Mestského súdu Bratislava III, oddiel Sa, vložka č. 7004/B'},
    {'name': 'Kuriér Expres s. r. o.', 'ico': '50200066', 'dic': '2120200066', 'icdph': 'SK2120200066', 'address': 'Logistická 2, 900 28 Ivanka pri Dunaji', 'iban': 'SK1209000000005198765432', 'register': 'Zapísaná v OR Mestského súdu Bratislava III, oddiel Sro, vložka č. 70005/B'},
]

FOREIGN = [
    {'name': 'TEST Cloud Services Ltd.', 'ico': None, 'icdph': 'IE9999999XA', 'address': '1 Harbour Road, Dublin 2, Ireland'},
    {'name': 'TEST Server GmbH', 'ico': None, 'icdph': 'DE999999999', 'address': 'Industriestraße 5, 91710 Gunzenhausen, Germany'},
    {'name': 'TEST Design Tools Inc.', 'ico': None, 'icdph': None, 'address': '500 Market Street, San Francisco, CA 94105, USA'},
    {'name': 'TEST Software s.r.o.', 'ico': '99999911', 'icdph': 'CZ99999911', 'address': 'Vinohradská 10, 120 00 Praha 2, Česká republika', 'iban': 'CZ6508000000192000145399'},
]

CUSTOMERS = [
    {'name': 'TEST Klient Alfa s. r. o.', 'ico': '50300019', 'dic': '2120300019', 'icdph': 'SK2120300019', 'address': 'Obchodná 1, 811 06 Bratislava'},
    {'name': 'TEST Klient Beta s. r. o.', 'ico': '50300027', 'dic': '2120300027', 'icdph': None, 'address': 'Školská 4, 040 01 Košice'},
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):
        os.remove(os.path.join(OUT, name))
    expected = []

    def save(name, img, exp, fmt):
        path = os.path.join(OUT, name)
        if fmt == 'pdf':
            img.convert('RGB').save(path, 'PDF', resolution=150)
        elif fmt == 'png':
            img.save(path, 'PNG', optimize=True)
        else:
            img.convert('RGB').save(path, 'JPEG', quality=78)
        # Labels are set from the fixture's contents and documented scenario, never from the model's answer.
        exp = {'file': name, 'category': CATEGORY_EXPECTATIONS[name]['category'], **{k: v for k, v in exp.items()}}
        expected.append(exp)

    for i, (seller, items, iso, clock, number, fx) in enumerate(RECEIPTS, 1):
        img, exp = receipt(SELLERS[seller], items, iso, clock, number, offline=fx.pop('offline', False))
        save(f'blocek-{i:02d}.jpg', photo(img, **fx), exp, 'jpg')

    sk = [
        (0, 'FA2026-0412', '2026-10-01', '2026-10-15', [('Webhosting Business, október 2026', 1, 'ks', 1490, 23), ('Doména .sk, ročne', 1, 'ks', 1290, 23)], {}, 'pdf'),
        (1, '2026/0388', '2026-10-05', '2026-10-19', [('Vedenie účtovníctva, september 2026', 1, 'mes.', 12000, 23)], {}, 'pdf'),
        (2, '20260031', '2026-09-29', '2026-10-13', [('Návrh loga a vizuálnej identity', 1, 'ks', 45000, 0)], {'payer': False}, 'pdf'),
        (3, 'FV-26-0907', '2026-09-22', '2026-10-06', [('Kancelársky stôl 160x80', 2, 'ks', 28900, 23), ('Kancelárska stolička', 2, 'ks', 15900, 23), ('Doprava a montáž', 1, 'ks', 4000, 23)], {'supplied': '2026-09-20'}, 'jpg-photo'),
        (4, '7310042981', '2026-10-02', '2026-10-16', [('Mesačný paušál Biznis 30', 1, 'mes.', 2490, 23), ('Roaming EÚ', 1, 'ks', 312, 23)], {}, 'png'),
        (5, 'KE-2026-11872', '2026-10-08', '2026-10-22', [('Prepravné balíky, september', 14, 'ks', 395, 23)], {}, 'jpg-photo'),
        (1, '2026/0402', '2026-10-12', '2026-10-26', [('Spracovanie miezd, september', 3, 'os.', 1500, 23), ('Ročné zúčtovanie dane', 1, 'ks', 3500, 23)], {}, 'pdf'),
        (3, 'FV-26-0951', '2026-10-09', '2026-10-23', [('Knižnica dubová', 1, 'ks', 41900, 23)], {}, 'pdf'),
        (0, 'FA2026-0431', '2026-10-14', '2026-10-28', [('SSL certifikát', 1, 'ks', 4900, 23)], {}, 'png'),
        (4, '7310043370', '2026-10-02', '2026-10-16', [('Internet Optik 500', 1, 'mes.', 2990, 23), ('Prenájom routera', 1, 'mes.', 300, 23)], {}, 'jpg-photo'),
        (2, '20260036', '2026-10-13', '2026-10-27', [('Grafika na sociálne siete, október', 8, 'ks', 3500, 0)], {'payer': False}, 'png'),
        (5, 'KE-2026-12030', '2026-10-15', '2026-10-29', [('Kuriérska zásielka do 5 kg', 3, 'ks', 690, 23), ('Dobierka', 1, 'ks', 150, 23)], {}, 'pdf'),
    ]
    for i, (s, number, iso, due, items, opts, fmt) in enumerate(sk, 1):
        payer = opts.get('payer', True)
        img, exp = invoice(SUPPLIERS[s], US, number, iso, due, items, payer=payer, vs=''.join(ch for ch in number if ch.isdigit())[-10:], supplied=opts.get('supplied'))
        if fmt == 'jpg-photo':
            save(f'faktura-{i:02d}.jpg', photo(img, deg=rnd.uniform(-3, 3), angle=0.04, blur=0.5), exp, 'jpg')
        else:
            save(f'faktura-{i:02d}.{fmt}', img, exp, fmt)

    foreign = [
        (0, 'IE-2026-5512189', '2026-10-01', '2026-10-01', [('Cloud services, September 2026', 1, 'pc', 5064, 23)], {'reverse': True, 'english': True, 'title': 'INVOICE'}, 'pdf'),
        (1, 'R0026718291', '2026-10-03', '2026-10-17', [('Dedicated server AX41, October 2026', 1, 'pc', 4490, 23)], {'reverse': True, 'english': True, 'title': 'INVOICE'}, 'pdf'),
        (2, 'INV-88412', '2026-10-07', '2026-10-07', [('Design Tools Pro, monthly', 1, 'pc', 2900, 0)], {'payer': False, 'english': True, 'title': 'INVOICE', 'currency': 'USD'}, 'png'),
        (3, '2026101845', '2026-10-10', '2026-10-24', [('Licence účetního programu, 12 měsíců', 1, 'ks', 21000, 21)], {'reverse': True, 'currency': 'CZK', 'title': 'FAKTURA'}, 'pdf'),
    ]
    for i, (s, number, iso, due, items, opts, fmt) in enumerate(foreign, 1):
        img, exp = invoice(FOREIGN[s], US, number, iso, due, items, payer=opts.get('payer', True), currency=opts.get('currency', 'EUR'), vs=None,
                           title=opts.get('title', 'FAKTÚRA'), english=opts.get('english', False), reverse=opts.get('reverse', False))
        save(f'zahranicna-{i:02d}.{fmt}', img, exp, fmt)

    # Credit notes: what the invoice is lowered by, written as positive amounts with the invoice they correct.
    img, exp = invoice(SUPPLIERS[3], US, 'DB-26-0012', '2026-10-11', '2026-10-25', [('Zľava za poškodenú stoličku', 1, 'ks', 5000, 23)], vs='26001200',
                       title='DOBROPIS', corrects='FV-26-0907')
    save('dobropis-01.pdf', img, exp, 'pdf')
    img, exp = invoice(SUPPLIERS[0], US, 'DB2026-0007', '2026-10-16', '2026-10-30', [('Vrátenie platby za doménu', 1, 'ks', 1290, 23)], vs='20260007',
                       title='DOBROPIS', corrects='FA2026-0412')
    save('dobropis-02.jpg', photo(img, deg=-2, angle=0.03), exp, 'jpg')

    # Invoices our company issued (the reader must see us as the supplier).
    us = {**US, 'iban': 'SK2711000000002949305635', 'register': 'Zapísaná v OR Mestského súdu Košice, oddiel Sro, vložka č. 70009/V'}
    img, exp = invoice(us, CUSTOMERS[0], '20260041', '2026-10-02', '2026-10-16', [('Konzultácie, september 2026', 10, 'h', 6000, 23)], vs='20260041', issued_by_us=True)
    save('vydana-01.pdf', img, exp, 'pdf')
    img, exp = invoice(us, CUSTOMERS[1], '20260042', '2026-10-09', '2026-10-23', [('Tvorba webovej stránky', 1, 'ks', 120000, 23)], vs='20260042', issued_by_us=True)
    save('vydana-02.png', img, exp, 'png')

    with open(os.path.join(ROOT, 'test', 'reader', 'expected.json'), 'w', encoding='utf-8') as fh:
        json.dump({'company': {'name': US['name'], 'ico': US['ico']}, 'documents': expected}, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'{len(expected)} documents in {OUT}')


if __name__ == '__main__':
    main()
