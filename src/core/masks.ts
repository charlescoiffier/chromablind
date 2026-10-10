import * as opentype from "opentype.js";
import svgpath from "svgpath";
import type { Document, Motif, Disk } from "./types";
export const fontChoices = [
  { id: "Atkinson", name: "Atkinson · humaniste" },
  { id: "NotoSans", name: "Noto Sans · sans empattements" },
  { id: "NotoSerif", name: "Noto Serif · avec empattements" },
  { id: "RobotoMono", name: "Roboto Mono · monospace" },
];
const fontPromises = new Map<string, Promise<opentype.Font>>();
export function loadFont(id = "Atkinson") {
  if (!fontChoices.some((f) => f.id === id)) id = "Atkinson";
  if (!fontPromises.has(id))
    fontPromises.set(
      id,
      fetch(`/fonts/${id}-Regular.woff`)
        .then((r) => {
          if (!r.ok) throw new Error("Police introuvable.");
          return r.arrayBuffer();
        })
        .then(opentype.parse),
    );
  return fontPromises.get(id)!;
}
export function textPath(font: opentype.Font, text: string) {
  const path = font.getPath(text || " ", 0, 0, 100, { kerning: true });
  const b = path.getBoundingBox();
  const dx = -(b.x1 + b.x2) / 2,
    dy = -(b.y1 + b.y2) / 2;
  for (const c of path.commands) {
    if ("x" in c) c.x += dx;
    if ("y" in c) c.y += dy;
    if ("x1" in c) c.x1 += dx;
    if ("y1" in c) c.y1 += dy;
    if ("x2" in c) c.x2 += dx;
    if ("y2" in c) c.y2 += dy;
  }
  return path.toPathData(4);
}
export function matrixFor(m: Motif) {
  return new DOMMatrix().translate(m.x, m.y).rotate(m.rotation).scale(m.scale);
}
function compiled(m: Motif, data = m.path) {
  const path = new Path2D(data),
    transformed = new Path2D();
  transformed.addPath(path, matrixFor(m));
  return transformed;
}
export function recolor(doc: Document): Disk[] {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  const paths = doc.motifs.map((m) =>
    (m.kind === "svg" && m.regions?.length
      ? m.regions
      : [{ path: m.path, fillRule: m.fillRule }]
    ).map((r) => ({ path: compiled(m, r.path), rule: r.fillRule })),
  );
  const strokes = doc.motifs.map((m) =>
    (m.strokes ?? [{ path: m.path, width: m.strokeWidth, erase: false }]).map(
      (stroke) => ({ ...stroke, compiled: compiled(m, stroke.path) }),
    ),
  );
  return doc.disks.map((d, index) => {
    const inside = doc.motifs.map((m, i) => {
      if (m.kind === "draw") {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        let hit = false;
        for (const stroke of strokes[i]) {
          ctx.lineWidth = stroke.width * m.scale;
          if (ctx.isPointInStroke(stroke.compiled, d.x, d.y))
            hit = !stroke.erase;
        }
        return hit;
      }
      return paths[i].some((region) =>
        ctx.isPointInPath(region.path, d.x, d.y, region.rule),
      );
    });
    let family: number;
    if (doc.palette.effect === "transforming")
      // Chromatic distractors also surround B, so its hidden recipe is preserved in the double composition.
      family = (inside[0] ? 1 : index % 2) + (inside[1] ? 2 : 0);
    else if (doc.palette.effect === "hidden")
      family = (index % 2) + (inside[0] ? 2 : 0);
    else family = inside[0] ? 1 : 0;
    // Stable color variation, independent of region membership.
    const bin = (Math.imul(index + 1, 2654435761) >>> 0) % 16;
    return { ...d, color: family * 16 + bin };
  });
}
export function importSVG(source: string): {
  path: string;
  removed: number;
  fillRule: "nonzero" | "evenodd";
  regions: { path: string; fillRule: "nonzero" | "evenodd" }[];
} {
  if (source.length > 1_000_000) throw new Error("Le SVG dépasse 1 Mo.");
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw new Error("Ce fichier ne contient pas un SVG valide.");
  const prohibited =
    "script,foreignObject,image,use,iframe,style,animate,animateTransform,set";
  const removed = doc.querySelectorAll(prohibited).length;
  doc.querySelectorAll(prohibited).forEach((e) => e.remove());
  if (doc.querySelector("[clip-path],[mask],[filter],clipPath,mask"))
    throw new Error(
      "Convertissez les masques et découpes SVG en tracés avant import.",
    );
  const fillRules = new Set<string>();
  const paths: string[] = [];
  const regions: { path: string; fillRule: "nonzero" | "evenodd" }[] = [];
  const n = (e: Element, a: string, f = 0) => {
    const v = Number(e.getAttribute(a) ?? f);
    if (!Number.isFinite(v)) throw new Error("Coordonnée SVG invalide.");
    return v;
  };
  function walk(
    el: Element,
    parent: DOMMatrix,
    inherited: { fill: string; stroke: string; rule: string } = {
      fill: "black",
      stroke: "none",
      rule: "nonzero",
    },
  ) {
    if (el.hasAttribute("class"))
      throw new Error(
        "Convertissez les styles CSS en attributs SVG avant import.",
      );
    const style = Object.fromEntries(
      (el.getAttribute("style") ?? "")
        .split(";")
        .filter((v) => v.includes(":"))
        .map((v) => v.split(":").map((s) => s.trim())),
    );
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      el.getAttribute("display") === "none"
    )
      return;
    const paint = {
      fill: el.getAttribute("fill") ?? style.fill ?? inherited.fill,
      stroke: el.getAttribute("stroke") ?? style.stroke ?? inherited.stroke,
      rule:
        el.getAttribute("fill-rule") ?? style["fill-rule"] ?? inherited.rule,
    };
    if (!["nonzero", "evenodd"].includes(paint.rule))
      throw new Error("Règle de remplissage SVG invalide.");
    const transform = el.getAttribute("transform") ?? "";
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "g");
    probe.setAttribute("transform", transform);
    let local: DOMMatrix;
    try {
      const matrix = probe.transform.baseVal.consolidate()?.matrix;
      local = matrix
        ? new DOMMatrix([
            matrix.a,
            matrix.b,
            matrix.c,
            matrix.d,
            matrix.e,
            matrix.f,
          ])
        : new DOMMatrix();
    } catch {
      throw new Error("Transformation SVG invalide.");
    }
    const mat = parent.multiply(local);
    let p = "";
    switch (el.localName) {
      case "path":
        p = el.getAttribute("d") ?? "";
        break;
      case "rect": {
        const x = n(el, "x"),
          y = n(el, "y"),
          w = n(el, "width"),
          h = n(el, "height");
        p = `M${x} ${y}h${w}v${h}h${-w}z`;
        break;
      }
      case "circle":
      case "ellipse": {
        const x = n(el, "cx"),
          y = n(el, "cy"),
          rx = n(el, el.localName === "circle" ? "r" : "rx"),
          ry = n(el, el.localName === "circle" ? "r" : "ry");
        p = `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;
        break;
      }
      case "polygon":
      case "polyline": {
        const points = el.getAttribute("points") ?? "";
        if (!/^[-+\d\s.,eE]*$/.test(points))
          throw new Error("Points SVG invalides.");
        p = "M" + points + (el.localName === "polygon" ? "z" : "");
        break;
      }
    }
    if (p && paint.stroke !== "none")
      throw new Error(
        "Convertissez les contours SVG en surfaces avant import.",
      );
    if (p && paint.fill !== "none") {
      fillRules.add(paint.rule);
      const parsed = svgpath(p);
      if ((parsed as unknown as { err: string }).err)
        throw new Error("Tracé SVG invalide.");
      const regionPath = parsed
        .unarc()
        .matrix([mat.a, mat.b, mat.c, mat.d, mat.e, mat.f])
        .toString();
      paths.push(regionPath);
      regions.push({
        path: regionPath,
        fillRule: paint.rule as "nonzero" | "evenodd",
      });
    }
    for (const child of el.children)
      if (
        [
          "svg",
          "g",
          "path",
          "rect",
          "circle",
          "ellipse",
          "polygon",
          "polyline",
        ].includes(child.localName)
      )
        walk(child, mat, paint);
  }
  walk(doc.documentElement, new DOMMatrix());
  if (!paths.length)
    throw new Error(
      "Aucune forme vectorielle exploitable. Convertissez les textes et contours en tracés.",
    );

  let path = paths.join(" ");
  if (path.length > 400000) throw new Error("Le tracé SVG est trop complexe.");
  // Determine true bounds without retaining imported DOM or active content.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    element = document.createElementNS("http://www.w3.org/2000/svg", "path");
  element.setAttribute("d", path);
  svg.append(element);
  svg.style.cssText = "position:absolute;visibility:hidden";
  document.body.append(svg);
  const bounds = element.getBBox();
  svg.remove();
  if (bounds.width <= 0 || bounds.height <= 0)
    throw new Error("Le motif doit avoir une surface.");
  const scale = 100 / Math.max(bounds.width, bounds.height);
  path = svgpath(path)
    .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2)
    .scale(scale)
    .toString();
  return {
    path,
    removed,
    fillRule: [...fillRules][0] as "nonzero" | "evenodd",
    regions: regions.map((region) => ({
      ...region,
      path: svgpath(region.path)
        .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2)
        .scale(scale)
        .toString(),
    })),
  };
}

// Recenter the local construction while preserving every point in document space.
export function centerDrawing(m: Motif): Motif {
  const strokes = m.strokes ?? [
    { path: m.path, width: m.strokeWidth, erase: false },
  ];
  const ink = strokes.filter((s) => !s.erase && s.path);
  if (!ink.length) return m;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  svg.append(element);
  svg.style.cssText = "position:absolute;visibility:hidden";
  document.body.append(svg);
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const stroke of ink) {
    element.setAttribute("d", stroke.path);
    const b = element.getBBox(),
      radius = stroke.width / 2;
    left = Math.min(left, b.x - radius);
    top = Math.min(top, b.y - radius);
    right = Math.max(right, b.x + b.width + radius);
    bottom = Math.max(bottom, b.y + b.height + radius);
  }
  svg.remove();
  const width = right - left,
    height = bottom - top;
  // Rasterize only the mask to find surviving ink bounds, including round caps and erasures.
  // Paths remain vector and are never replaced by this raster.
  const resolution = Math.min(8, 2048 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * resolution));
  canvas.height = Math.max(1, Math.ceil(height * resolution));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(resolution, resolution);
  ctx.translate(-left, -top);
  ctx.strokeStyle = "#000";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.lineWidth = stroke.width;
    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";
    ctx.stroke(new Path2D(stroke.path));
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width,
    minY = canvas.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++)
      if (pixels[(y * canvas.width + x) * 4 + 3] > 127) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  if (maxX < 0) return m;
  const dx = left + (minX + maxX + 1) / (2 * resolution),
    dy = top + (minY + maxY + 1) / (2 * resolution);
  const at = matrixFor(m).transformPoint({ x: dx, y: dy });
  const centered = strokes.map((s) => ({
    ...s,
    path: svgpath(s.path).translate(-dx, -dy).toString(),
  }));
  return {
    ...m,
    x: at.x,
    y: at.y,
    strokes: centered,
    path: centered
      .filter((s) => !s.erase)
      .map((s) => s.path)
      .join(" "),
  };
}
