"""Validate PNG sprite atlas layout and alpha without third-party dependencies."""
import collections
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
for name in ("Gepeto", "Geminias", "Claudio"):
    path = ROOT / "Assets/Resources/Bosses" / (name + ".png")
    blob = path.read_bytes()
    assert blob[:8] == b'\x89PNG\r\n\x1a\n'
    offset, chunks = 8, []
    while offset < len(blob):
        length = struct.unpack('>I', blob[offset:offset+4])[0]
        kind = blob[offset+4:offset+8]
        data = blob[offset+8:offset+8+length]
        offset += length + 12
        if kind == b'IHDR':
            width, height, depth, color, _, _, interlaced = struct.unpack('>IIBBBBB', data)
        if kind == b'IDAT':
            chunks.append(data)
    assert (width, height, depth, color, interlaced) == (1024, 1536, 8, 6, 0)
    raw = zlib.decompress(b''.join(chunks))
    stride = width * 4
    previous = bytearray(stride)
    alpha_histogram = collections.Counter()
    occupied = [0] * 96
    for y in range(height):
        filter_kind = raw[y*(stride+1)]
        row = bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        for x in range(stride):
            a = row[x-4] if x >= 4 else 0
            b = previous[x]
            c = previous[x-4] if x >= 4 else 0
            if filter_kind == 0:
                predictor = 0
            elif filter_kind == 1:
                predictor = a
            elif filter_kind == 2:
                predictor = b
            elif filter_kind == 3:
                predictor = (a+b)//2
            else:
                assert filter_kind == 4
                p = a+b-c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                predictor = a if pa <= pb and pa <= pc else b if pb <= pc else c
            row[x] = (row[x] + predictor) & 255
        alphas = row[3::4]
        alpha_histogram.update(alphas)
        for x, alpha in enumerate(alphas):
            if alpha > 128:
                occupied[(y//128)*8+x//128] += 1
        previous = row
    assert alpha_histogram[0] > width * height * .1, 'Missing transparent background'
    assert min(occupied[:88]) > 100, 'Empty combat frame'
    assert sum(occupied[88:]) > 100, 'Missing defeat sequence'
    print(f'{name}: RGBA 1024x1536; 96 cells of 128x128; transparent alpha; all combat frames populated')
