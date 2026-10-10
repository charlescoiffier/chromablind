import {
  colorTablesReady,
  rgbToCMYK,
  cmykToRGB,
  cmykToXYZ,
  printReference,
} from "./cmyk";
import {
  buildPalette,
  deriveFreeColors,
  fromXYZ,
  toXYZ,
  hexRGB,
} from "./color";
import { validateGeometry } from "./geometry";
import type { Document, Motif } from "./types";
const motif = (text: string): Motif => ({
  font: "Atkinson",
  fillRule: "nonzero",
  kind: "text",
  text,
  path: "",
  x: 100,
  y: 100,
  scale: 1,
  rotation: 0,
  strokeWidth: 5,
});
export function defaultDocument(): Document {
  const palette: Document["palette"] = {
    mode: "free",
    effect: "vanishing",
    profile: "deutan",
    noise: 0.35,
    strength: 0.7,
    freeColors: deriveFreeColors("#899764"),
  };
  return {
    version: 1,
    generator: "packing-1",
    name: "Étude 01",
    geometry: {
      shape: "circle",
      width: 200,
      height: 200,
      minRadius: 1.1,
      maxRadius: 3.8,
      gap: 0.28,
      density: 0.9,
      distribution: 0.65,
      seed: 12487,
      limit: 20000,
    },
    palette,
    colors: buildPalette(palette),
    motifs: [motif(""), motif("")],
    disks: [],
    background: "#ffffff",
  };
}
export function parseDocument(raw: string): Document {
  if (raw.length > 8_000_000) throw new Error("Le projet dépasse 8 Mo.");
  let d: Document;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error("Le fichier projet doit contenir du JSON valide.");
  }
  if (
    !d ||
    d.version !== 1 ||
    d.generator !== "packing-1" ||
    typeof d.name !== "string" ||
    d.name.length > 150
  )
    throw new Error("Version ou nom de projet invalide.");
  validateGeometry(d.geometry);
  const p = d.palette;
  if (
    !p ||
    !["free", "guided"].includes(p.mode) ||
    !["accessible", "vanishing", "hidden", "transforming"].includes(p.effect) ||
    !["protan", "deutan", "tritan"].includes(p.profile) ||
    ![p.noise, p.strength].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    ) ||
    !Array.isArray(p.freeColors) ||
    p.freeColors.length !== 4 ||
    p.freeColors.some((c) => !/^#[0-9a-f]{6}$/i.test(c))
  )
    throw new Error("Palette invalide.");
  if (
    !Array.isArray(d.colors) ||
    d.colors.length !== 64 ||
    d.colors.some(
      (c) =>
        c.space !== "XYZ-D65" ||
        !Array.isArray(c.xyz) ||
        c.xyz.length !== 3 ||
        c.xyz.some(
          (v) => !Number.isFinite(v) || v < (c.cmyk ? -0.1 : 0) || v > 2,
        ),
    )
  )
    throw new Error("Couleurs XYZ invalides.");
  if (
    p.baseCMYK !== undefined &&
    (!Array.isArray(p.baseCMYK) ||
      p.baseCMYK.length !== 4 ||
      p.baseCMYK.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
  )
    throw new Error("Base CMJN invalide.");
  if (
    d.colors.some(
      (c) =>
        c.cmyk !== undefined &&
        (!Array.isArray(c.cmyk) ||
          c.cmyk.length !== 4 ||
          c.cmyk.some((v) => !Number.isFinite(v) || v < 0 || v > 1)),
    )
  )
    throw new Error("Couleurs CMJN invalides.");
  if (
    d.print !== undefined &&
    (!d.print ||
      (d.print.space !== undefined && d.print.space !== "CMYK") ||
      d.print.profile !== "fogra39-vigc" ||
      d.print.sha256 !== printReference.sha256 ||
      !Array.isArray(d.print.background) ||
      d.print.background.length !== 4 ||
      d.print.background.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
      d.colors.some(
        (c) =>
          !Array.isArray(c.cmyk) ||
          c.cmyk.length !== 4 ||
          c.cmyk.some((v) => !Number.isFinite(v) || v < 0 || v > 1),
      ))
  )
    throw new Error("Couleurs CMJN ou profil de référence invalides.");
  if (!/^#[0-9a-f]{6}$/i.test(d.background)) throw new Error("Fond invalide.");
  if (Array.isArray(d.motifs))
    d.motifs.forEach((m) => (m.fillRule ??= "nonzero"));
  if (
    !Array.isArray(d.motifs) ||
    d.motifs.length !== 2 ||
    d.motifs.some(
      (m) =>
        !["nonzero", "evenodd"].includes(m.fillRule) ||
        !["text", "svg", "draw"].includes(m.kind) ||
        typeof m.text !== "string" ||
        m.text.length > 100 ||
        typeof m.path !== "string" ||
        m.path.length > 400000 ||
        !/^[-+\d\s.,eEMmLlHhVvCcSsQqTtAaZz]*$/.test(m.path) ||
        ![m.x, m.y, m.scale, m.rotation, m.strokeWidth].every(
          Number.isFinite,
        ) ||
        m.scale <= 0 ||
        m.scale > 20 ||
        m.strokeWidth < 0.2 ||
        m.strokeWidth > 100 ||
        Math.abs(m.x) > 4000 ||
        Math.abs(m.y) > 4000 ||
        Math.abs(m.rotation) > 360,
    )
  )
    throw new Error("Motif invalide.");
  for (const m of d.motifs) {
    if (
      m.font !== undefined &&
      !["Atkinson", "NotoSans", "NotoSerif", "RobotoMono"].includes(m.font)
    )
      throw new Error("Police invalide.");
    if (
      m.strokes !== undefined &&
      (!Array.isArray(m.strokes) ||
        m.strokes.length > 1000 ||
        m.strokes.some(
          (s) =>
            !s ||
            typeof s.erase !== "boolean" ||
            !Number.isFinite(s.width) ||
            s.width < 0.2 ||
            s.width > 100 ||
            typeof s.path !== "string" ||
            !/^[-+\d\s.,eEMmLlHhVvCcSsQqTtAaZz]*$/.test(s.path),
        ) ||
        m.strokes.reduce((sum, s) => sum + s.path.length, 0) > 400000)
    )
      throw new Error("Coups de pinceau invalides.");

    if (
      m.regions !== undefined &&
      (!Array.isArray(m.regions) ||
        m.regions.length > 5000 ||
        m.regions.some(
          (r) =>
            !r ||
            !["nonzero", "evenodd"].includes(r.fillRule) ||
            typeof r.path !== "string" ||
            !/^[-+\d\s.,eEMmLlHhVvCcSsQqTtAaZz]*$/.test(r.path),
        ) ||
        m.regions.reduce((s, r) => s + r.path.length, 0) > 400000)
    )
      throw new Error("Régions SVG invalides.");
  }
  if (
    !Array.isArray(d.disks) ||
    d.disks.length > 20000 ||
    d.disks.some(
      (c) =>
        ![c.x, c.y, c.r, c.color].every(Number.isFinite) ||
        c.r <= 0 ||
        c.r > 100 ||
        c.x - c.r < -0.001 ||
        c.y - c.r < -0.001 ||
        c.x + c.r > d.geometry.width + 0.001 ||
        c.y + c.r > d.geometry.height + 0.001 ||
        !Number.isInteger(c.color) ||
        c.color < 0 ||
        c.color >= d.colors.length,
    )
  )
    throw new Error("Disques invalides.");
  if (
    d.geometry.shape === "circle" &&
    d.disks.some(
      (c) =>
        Math.hypot(c.x - d.geometry.width / 2, c.y - d.geometry.height / 2) +
          c.r >
        d.geometry.width / 2 + 1e-6,
    )
  )
    throw new Error("Disques hors du support circulaire.");
  return d;
}

export function withPrint(d: Document): Document {
  if (!colorTablesReady()) return d;
  return {
    ...d,
    print: {
      space: "CMYK",
      profile: "fogra39-vigc",
      sha256: printReference.sha256,
      background: d.print?.background ?? rgbToCMYK(hexRGB(d.background)),
    },
    colors: d.colors.map((color) => {
      const cmyk = color.cmyk ?? rgbToCMYK(fromXYZ(color.xyz));
      return { space: "XYZ-D65", cmyk, xyz: cmykToXYZ(cmyk) };
    }),
  };
}
