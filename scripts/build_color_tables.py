"""Rebuild browser interpolation tables from the bundled FOGRA39 ICC using LittleCMS.
Run: .venv/bin/python -m scripts.build_color_tables
Tables are preview/construction approximations; PDF emits the stored CMYK values exactly.
"""
import itertools, json, hashlib, struct
from pathlib import Path
from server.color_engine import Session, RGB, CMYK, LAB
ROOT = Path(__file__).resolve().parents[1]
data = (ROOT / 'server/profiles/fogra39-vigc.icc').read_bytes()
with Session(data) as s:
    rgb_grid = list(itertools.product([i/32 for i in range(33)], repeat=3))
    cmyk = s.transform(rgb_grid, s.source, RGB, s.destination, CMYK, 4)
    cmyk_grid = list(itertools.product([i*100/16 for i in range(17)], repeat=4))
    rgb = s.transform(cmyk_grid, s.destination, CMYK, s.source, RGB, 3)
    lab = s.transform(cmyk_grid, s.destination, CMYK, s.lab, LAB, 3, flags=0)
    def xyz_d65(row):
        light,a,b=row
        fy=(light+16)/116;fx=fy+a/500;fz=fy-b/200
        def inverse(t):return t**3 if t>6/29 else 3*(6/29)**2*(t-4/29)
        d50=[.96422*inverse(fx),inverse(fy),.82521*inverse(fz)]
        bradford=[[.9555766,-.0230393,.0631636],[-.0282895,1.0099416,.0210077],[.0122982,-.0204830,1.3299098]]
        return tuple(sum(v*x for v,x in zip(matrix,d50)) for matrix in bradford)
    xyz=[xyz_d65(row) for row in lab]
output = ROOT / 'public/color'
output.mkdir(exist_ok=True)
for name, rows, factor in [('rgb-cmyk', cmyk, 0.01), ('cmyk-rgb', rgb, 1), ('cmyk-xyz', xyz, 1)]:
    flat = [v*factor for row in rows for v in row]
    (output / (name+'.bin')).write_bytes(struct.pack('<'+'f'*len(flat), *flat))
metadata = {'profile':'fogra39-vigc','sha256':hashlib.sha256(data).hexdigest(),'rgbGrid':33,'cmykGrid':17,'format':'float32-little-endian','intent':'relative-colorimetric-with-black-point-compensation','source':'LittleCMS; Coated Fogra39L VIGC 260; ICC registry','method':'multilinear interpolation; approximate browser preview; direct stored CMYK PDF output'}
(output/'tables.json').write_text(json.dumps(metadata, indent=2)+'\n')
print(metadata)

# Keep the build-time reference available outside Vite public assets.
(ROOT / "src/core/tables.json").write_text((ROOT / "public/color/tables.json").read_text())
