import { cmykToRGB } from "./cmyk";
import { previewRGB, cssRGB } from "./color";
import type { Document } from "./types";
export function exportSVG(d: Document) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  const { width, height } = d.geometry;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><title>${escape(d.name)}</title><metadata>${escape(JSON.stringify({ version: 1, generator: d.generator, seed: d.geometry.seed, colors: d.colors, print: d.print, palette: d.palette }))}</metadata><rect width="${width}" height="${height}" fill="${d.print ? cssRGB(cmykToRGB(d.print.background)) : d.background}"/>${d.disks.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="${cssRGB(previewRGB(d.colors[c.color]))}"/>`).join("")}</svg>`;
}
export function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
