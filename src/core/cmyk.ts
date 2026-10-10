import metadata from "./tables.json";
import type { Vec3, Vec4 } from "./types";
export const printReference = metadata;
let rgbTable: Float32Array | undefined;
let cmykTable: Float32Array | undefined;
let xyzTable: Float32Array | undefined;
let pending: Promise<void> | undefined;
export function installColorTables(
  rgb: Float32Array,
  cmyk: Float32Array,
  xyz: Float32Array,
) {
  if (
    rgb.length !== 33 ** 3 * 4 ||
    cmyk.length !== 17 ** 4 * 3 ||
    xyz.length !== 17 ** 4 * 3
  )
    throw new Error("Tables colorimétriques invalides.");
  rgbTable = rgb;
  cmykTable = cmyk;
  xyzTable = xyz;
}
export function loadColorTables() {
  return (pending ??= Promise.all(
    ["rgb-cmyk", "cmyk-rgb", "cmyk-xyz"].map(async (name) => {
      const r = await fetch(`/color/${name}.bin`);
      if (!r.ok)
        throw new Error("Tables CMJN indisponibles. Rechargez l’application.");
      return new Float32Array(await r.arrayBuffer());
    }),
  ).then(([rgb, cmyk, xyz]) => installColorTables(rgb, cmyk, xyz)));
}
export const colorTablesReady = () => !!rgbTable && !!cmykTable && !!xyzTable;
function interpolate(
  table: Float32Array,
  values: number[],
  grid: number,
  channels: number,
) {
  const coords = values.map((v) => Math.max(0, Math.min(1, v)) * (grid - 1));
  const low = coords.map((v) => Math.min(grid - 2, Math.floor(v))),
    fractions = coords.map((v, i) => v - low[i]);
  const result = Array(channels).fill(0);
  for (let corner = 0; corner < 2 ** values.length; corner++) {
    let weight = 1,
      index = 0;
    for (let axis = 0; axis < values.length; axis++) {
      const upper = (corner >> axis) & 1;
      weight *= upper ? fractions[axis] : 1 - fractions[axis];
      index = index * grid + low[axis] + upper;
    }
    for (let c = 0; c < channels; c++)
      result[c] += table[index * channels + c] * weight;
  }
  return result;
}
export function rgbToCMYK(rgb: Vec3): Vec4 {
  if (!rgbTable) throw new Error("Moteur CMJN non chargé.");
  return interpolate(rgbTable, rgb, 33, 4) as Vec4;
}
export function cmykToRGB(cmyk: Vec4): Vec3 {
  if (!cmykTable) throw new Error("Moteur CMJN non chargé.");
  return interpolate(cmykTable, cmyk, 17, 3) as Vec3;
}

export function cmykToXYZ(cmyk: Vec4): Vec3 {
  if (!xyzTable) throw new Error("Moteur CMJN non chargé.");
  return interpolate(xyzTable, cmyk, 17, 3) as Vec3;
}
