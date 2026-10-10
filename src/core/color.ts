import { colorTablesReady, rgbToCMYK, cmykToRGB, cmykToXYZ } from "./cmyk";
import coefficients from "./coefficients.json";
import type { Vec3, Profile, Color, PaletteSettings } from "./types";
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const linearize = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
export const encode = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
export function mul(m: number[][], v: Vec3): Vec3 {
  return m.map((r) => r.reduce((s, c, i) => s + c * v[i], 0)) as Vec3;
}
const XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];
export const toXYZ = (rgb: Vec3) => mul(XYZ, rgb.map(linearize) as Vec3);
export const fromXYZ = (xyz: Vec3) => mul(RGB, xyz).map(encode) as Vec3;
export const previewRGB = (color: Color): Vec3 =>
  color.cmyk && colorTablesReady() ? cmykToRGB(color.cmyk) : fromXYZ(color.xyz);
export const hexRGB = (hex: string): Vec3 =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Vec3;
export const cssRGB = (v: Vec3) =>
  `rgb(${v.map((x) => Math.round(clamp(x) * 255)).join(" ")})`;
export const outOfGamut = (v: Vec3) =>
  v.some((x) => x < -0.00001 || x > 1.00001);
export function simulate(
  rgb: Vec3,
  profile: Profile,
  model: "brettel" | "machado" = "brettel",
  severity = 1,
): Vec3 {
  const lin = rgb.map(linearize) as Vec3;
  if (model === "machado") {
    if (profile === "tritan")
      throw new Error("Machado ne modélise pas la tritanopie.");
    const s = clamp(severity) * 10,
      i = Math.floor(s),
      a = s - i,
      m = coefficients.machado[profile];
    const matrix = m[i].map((row, r) =>
      row.map((v, c) => v * (1 - a) + m[Math.min(10, i + 1)][r][c] * a),
    );
    return mul(matrix, lin).map(encode) as Vec3;
  }
  const lms = mul(coefficients.lms, lin),
    p = coefficients.brettel[profile],
    side = p.sep.reduce((s, c, i) => s + c * lms[i], 0);
  return mul(coefficients.rgb, mul(side < 0 ? p.h2 : p.h1, lms)).map(
    encode,
  ) as Vec3;
}
export function grayscale(rgb: Vec3): Vec3 {
  const y = encode(toXYZ(rgb)[1]);
  return [y, y, y];
}
// Pair construction along the missing-cone axis. No gamut clipping in the recipe.
function pair(
  base: Vec3,
  profile: Profile,
  strength: number,
  reserve: Vec3 = [0, 0, 0],
): [Vec3, Vec3] {
  const index = { protan: 0, deutan: 1, tritan: 2 }[profile],
    direction = coefficients.rgb.map((row) => row[index]);
  const length = Math.max(...direction.map(Math.abs));
  const unit = direction.map((v) => v / length);
  let amplitude = 0.42 * strength;
  for (let i = 0; i < 3; i++)
    if (Math.abs(unit[i]) > 1e-9)
      amplitude = Math.min(
        amplitude,
        (Math.min(base[i], 1 - base[i] - reserve[i]) - 0.002) /
          Math.abs(unit[i]),
      );
  amplitude = Math.max(0, amplitude);
  return [-1, 1].map(
    (sign) => base.map((v, i) => v + sign * amplitude * unit[i]) as Vec3,
  ) as [Vec3, Vec3];
}
export function buildPalette(p: PaletteSettings): Color[] {
  const colors: Color[] = [];
  for (let family = 0; family < 4; family++)
    for (let i = 0; i < 16; i++) {
      const jitter = (i / 15 - 0.5) * p.noise * 0.42;
      let lin: Vec3;
      if (p.effect === "accessible") {
        const rgb = (
          p.baseCMYK && colorTablesReady()
            ? cmykToRGB(p.baseCMYK)
            : hexRGB(p.freeColors[0])
        ).map(linearize) as Vec3;
        const maximum = Math.max(...rgb, 0.01);
        const chroma = rgb.map((v) => v / maximum) as Vec3;
        const light = family === 0 || family === 3;
        const accessibleNoise = (i / 15 - 0.5) * p.noise * 0.1;
        lin = chroma.map(
          (v) => (light ? 0.46 + v * 0.2 : 0.12 + v * 0.2) + accessibleNoise,
        ) as Vec3;
        lin = lin.map((v) => Math.max(0.002, v)) as Vec3;
        if (p.mode === "free") {
          const base = rgb;
          const y = mul(XYZ, base)[1];
          const target: Vec3 =
            y > 0.5
              ? (base.map((v) => (v * Math.max(0, y - 0.3)) / y) as Vec3)
              : (base.map((v) => v + ((1 - v) * 0.3) / (1 - y)) as Vec3);
          lin = (light ? base : target).map((v) =>
            clamp(v + accessibleNoise),
          ) as Vec3;
        }
      } else {
        const noise =
          (i / 15 - 0.5) * p.noise * (p.mode === "free" ? 0.06 : 0.2);
        const base: Vec3 =
          p.mode === "free"
            ? ((p.baseCMYK && colorTablesReady()
                ? cmykToRGB(p.baseCMYK)
                : hexRGB(p.freeColors[0])
              )
                .map(linearize)
                .map((v) =>
                  Math.max(0.002, Math.min(0.998, v + noise)),
                ) as Vec3)
            : [0.36 + noise, 0.34 + noise, 0.24 + noise];
        const signalAmount =
          p.effect === "hidden"
            ? 0.025
            : p.effect === "transforming"
              ? 0.05
              : 0;
        const room = Math.max(0, Math.min(...base.map((v) => 0.998 - v)));
        const signal: Vec3 =
          p.mode === "free"
            ? (Array(3).fill(Math.min(signalAmount, room * 0.4)) as Vec3)
            : p.effect === "hidden"
              ? [0.012, 0.012, 0.045]
              : p.effect === "transforming"
                ? [0.035, 0.035, 0.12]
                : [0, 0, 0];
        let [a, b] = pair(base, p.profile, p.strength, signal);
        if (p.mode === "free") {
          // Anchor a confusion-axis displacement to the chosen base instead of changing its inks.
          const index = { protan: 0, deutan: 1, tritan: 2 }[p.profile];
          const direction = coefficients.rgb.map((row) => row[index]);
          const norm = Math.max(...direction.map(Math.abs));
          const axis = direction.map((v) => v / norm);
          const candidate = (sign: number) => {
            let amount = 0.42 * p.strength;
            for (let c = 0; c < 3; c++) {
              const step = sign * axis[c];
              if (Math.abs(step) > 1e-9)
                amount = Math.min(
                  amount,
                  step > 0
                    ? (0.998 - base[c] - signal[c]) / step
                    : (base[c] - 0.002) / -step,
                );
            }
            return Math.max(0, amount);
          };
          const positive = candidate(1),
            negative = candidate(-1),
            sign = positive >= negative ? 1 : -1,
            amount = Math.max(positive, negative);
          a = base;
          b = base.map((v, c) => v + sign * amount * axis[c]) as Vec3;
        }
        if (p.effect === "vanishing")
          lin = family === 0 || family === 3 ? a : b;
        else {
          const choice = family & 1 ? b : a;
          lin = choice.map((v, c) => v + (family >= 2 ? signal[c] : 0)) as Vec3;
        }
      }
      if (lin.some((v) => v < 0 || v > 1))
        throw new Error(
          "La recette sort du gamut sRGB. Réduisez le bruit ou la séparation.",
        );
      const rgb = lin.map(encode) as Vec3;
      if (colorTablesReady()) {
        const cmyk =
          p.mode === "free" && family === 0 && p.baseCMYK
            ? ([...p.baseCMYK] as import("./types").Vec4)
            : rgbToCMYK(rgb);
        if (p.mode === "free" && family === 0 && p.baseCMYK)
          cmyk[3] = clamp(cmyk[3] - jitter * 0.3);
        colors.push({ space: "XYZ-D65", cmyk, xyz: cmykToXYZ(cmyk) });
      } else colors.push({ space: "XYZ-D65", xyz: mul(XYZ, lin) });
    }
  return colors;
}
export function colorMetrics(colors: Color[], profile: Profile) {
  const a = colors[8],
    b = colors[24],
    sa = simulate(previewRGB(a), profile),
    sb = simulate(previewRGB(b), profile);
  const difference = (x: Vec3, y: Vec3) =>
    Math.hypot(...x.map((c, i) => c - y[i]));
  return {
    luminance: Math.abs(a.xyz[1] - b.xyz[1]),
    normal: difference(a.xyz, b.xyz),
    simulated: difference(toXYZ(sa), toXYZ(sb)),
  };
}

export function deriveFreeColors(base: string): PaletteSettings["freeColors"] {
  const rgb = hexRGB(base),
    max = Math.max(...rgb),
    min = Math.min(...rgb),
    delta = max - min;
  let h =
    delta === 0
      ? 0
      : max === rgb[0]
        ? ((rgb[1] - rgb[2]) / delta) % 6
        : max === rgb[1]
          ? (rgb[2] - rgb[0]) / delta + 2
          : (rgb[0] - rgb[1]) / delta + 4;
  h = (h * 60 + 360) % 360;
  const l = (max + min) / 2,
    saturation = delta === 0 ? 0.35 : delta / (1 - Math.abs(2 * l - 1));
  const hex = (hue: number, light: number) => {
    const c = (1 - Math.abs(2 * light - 1)) * Math.max(0.35, saturation),
      hp = hue / 60,
      x = c * (1 - Math.abs((hp % 2) - 1)),
      m = light - c / 2;
    const channels =
      hp < 1
        ? [c, x, 0]
        : hp < 2
          ? [x, c, 0]
          : hp < 3
            ? [0, c, x]
            : hp < 4
              ? [0, x, c]
              : hp < 5
                ? [x, 0, c]
                : [c, 0, x];
    return (
      "#" +
      channels
        .map((v) =>
          Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  };
  return [
    base,
    hex((h + 150) % 360, Math.max(0.35, Math.min(0.65, l))),
    hex((h + 240) % 360, 0.52),
    hex((h + 60) % 360, 0.6),
  ];
}
