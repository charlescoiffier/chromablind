import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  installColorTables,
  cmykToXYZ,
  rgbToCMYK,
  cmykToRGB,
} from "../src/core/cmyk";
import {
  defaultDocument,
  withPrint,
  parseDocument,
} from "../src/core/document";
import { buildPalette, previewRGB } from "../src/core/color";
const read = (name: string) => {
  const b = readFileSync(`public/color/${name}.bin`);
  return new Float32Array(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  );
};
installColorTables(read("rgb-cmyk"), read("cmyk-rgb"), read("cmyk-xyz"));
describe("CMYK master", () => {
  it("keeps exact ink separations and background through open/save", () => {
    const d = withPrint(defaultDocument());
    d.print!.background = [0.12, 0.34, 0.56, 0.07];
    d.colors[0].cmyk = [0.1234, 0.4567, 0.2345, 0.0678];
    const roundtrip = withPrint(parseDocument(JSON.stringify(d)));
    expect(roundtrip.print!.background).toEqual(d.print!.background);
    expect(roundtrip.colors[0].cmyk).toEqual(d.colors[0].cmyk);
  });
  it("stores a valid native XYZ reference for a CMYK color outside display gamut", () => {
    const ink: [number, number, number, number] = [0, 0, 0.75, 1];
    expect(cmykToXYZ(ink).every((v) => Number.isFinite(v) && v >= 0)).toBe(
      true,
    );
    const d = withPrint(defaultDocument());
    d.palette.mode = "free";
    d.palette.baseCMYK = ink;
    d.colors = buildPalette(d.palette);
    expect(() => parseDocument(JSON.stringify(d))).not.toThrow();
    expect(d.colors[0].cmyk?.slice(0, 3)).toEqual([0, 0, 0.75]);
  });
  it("uses the same CMYK display conversion for disks and paper", () => {
    const ink: [number, number, number, number] = [0, 0, 0, 1];
    expect(
      previewRGB({ space: "XYZ-D65", xyz: cmykToXYZ(ink), cmyk: ink }),
    ).toEqual(cmykToRGB(ink));
  });
  it("constructs all guided recipes as CMYK and maintains robust luminance contrast", () => {
    for (const profile of ["protan", "deutan", "tritan"] as const)
      for (const effect of [
        "accessible",
        "vanishing",
        "hidden",
        "transforming",
      ] as const) {
        const palette = {
          ...defaultDocument().palette,
          mode: "guided" as const,
          profile,
          effect,
          noise: 1,
          strength: 1,
        };
        const colors = buildPalette(palette);
        expect(
          colors.every((c) => c.cmyk?.every((v) => v >= 0 && v <= 1)),
        ).toBe(true);
        if (effect === "accessible")
          expect(
            Math.abs(colors[8].xyz[1] - colors[24].xyz[1]),
          ).toBeGreaterThan(0.25);
        expect(() =>
          parseDocument(
            JSON.stringify(
              withPrint({ ...defaultDocument(), palette, colors }),
            ),
          ),
        ).not.toThrow();
      }
    expect(
      rgbToCMYK([0.5, 0.25, 0.75]).reduce((s, v) => s + v, 0),
    ).toBeLessThanOrEqual(2.6);
  });
});
