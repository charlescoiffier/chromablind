import { describe, it, expect } from "vitest";
import type { Vec3 } from "../src/core/types";
import { generateDisks } from "../src/core/geometry";
import { defaultDocument, parseDocument } from "../src/core/document";
import {
  hexRGB,
  toXYZ,
  fromXYZ,
  simulate,
  linearize,
  encode,
  buildPalette,
} from "../src/core/color";
import { exportSVG } from "../src/core/export";

describe("geometry independent of motifs", () => {
  it("is reproducible and stays in the disk with no collisions", () => {
    const p = {
      ...defaultDocument().geometry,
      minRadius: 2,
      maxRadius: 5,
      width: 80,
      height: 80,
    };
    const a = generateDisks(p);
    expect(a.length).toBeGreaterThan(70);
    expect(a).toEqual(generateDisks(p));
    for (let i = 0; i < a.length; i++) {
      const d = a[i];
      expect(Math.hypot(d.x - 40, d.y - 40) + d.r).toBeLessThanOrEqual(
        40 + 1e-7,
      );
      for (let j = 0; j < i; j++)
        expect(Math.hypot(d.x - a[j].x, d.y - a[j].y)).toBeGreaterThanOrEqual(
          d.r + a[j].r + p.gap - 1e-7,
        );
    }
  });
  it("respects rectangle bounds and the explicit disk limit", () => {
    const p = {
      ...defaultDocument().geometry,
      shape: "rectangle" as const,
      width: 200,
      height: 100,
      minRadius: 1,
      maxRadius: 2,
      limit: 200,
    };
    const a = generateDisks(p);
    expect(a.length).toBe(200);
    a.forEach((d) => {
      expect(d.x - d.r).toBeGreaterThanOrEqual(0);
      expect(d.y + d.r).toBeLessThanOrEqual(100);
    });
  });
  it("rejects invalid dimensions and radius ordering", () =>
    expect(() =>
      generateDisks({
        ...defaultDocument().geometry,
        minRadius: 10,
        maxRadius: 2,
      }),
    ).toThrow());
});
describe("color reference checks", () => {
  it("linearizes sRGB before XYZ and roundtrips without clipping", () => {
    expect(linearize(0.5)).toBeCloseTo(0.21404114, 7);
    expect(encode(0.21404114)).toBeCloseTo(0.5, 7);
    expect(toXYZ([1, 1, 1])).toEqual(
      expect.arrayContaining([
        expect.closeTo(0.95047, 5),
        expect.closeTo(1, 5),
        expect.closeTo(1.08883, 5),
      ]),
    );
    const rgb: [number, number, number] = [0.9, 0.2, 0.7];
    fromXYZ(toXYZ(rgb)).forEach((c, i) => expect(c).toBeCloseTo(rgb[i], 5));
    expect(fromXYZ([2, 2, 2]).some((x) => x > 1)).toBe(true);
  });
  it("preserves black and neutral colors under Brettel", () => {
    for (const type of ["protan", "deutan", "tritan"] as const) {
      expect(simulate([0, 0, 0], type, "brettel", 1)).toEqual([0, 0, 0]);
      simulate([0.5, 0.5, 0.5], type, "brettel", 1).forEach((c) =>
        expect(c).toBeCloseTo(0.5, 3),
      );
    }
  });
  it("uses published Machado full protan coefficients on linear red", () => {
    const result = simulate([1, 0, 0], "protan", "machado", 1);
    expect(result[0]).toBeCloseTo(encode(0.152286), 5);
    expect(result[1]).toBeCloseTo(encode(0.114503), 5);
  });
  it("rejects Machado tritan rather than calling it tritanopia", () =>
    expect(() => simulate([0.2, 0.4, 0.6], "tritan", "machado", 1)).toThrow());
  it("generates deutan confusion pairs with small simulated difference", () => {
    const doc = defaultDocument();
    const p = buildPalette({ ...doc.palette, mode: "guided" });
    expect(p.length).toBe(64);
    const a = simulate(fromXYZ(p[0].xyz), "deutan", "brettel", 1);
    const b = simulate(fromXYZ(p[16].xyz), "deutan", "brettel", 1);
    expect(Math.hypot(...a.map((c, i) => c - b[i]))).toBeLessThan(0.01);
  });
});
describe("project and SVG", () => {
  it("roundtrips, rejects unsafe/oversized projects and preserves dimensions", () => {
    const d = defaultDocument();
    d.disks = [{ x: 90, y: 90, r: 2, color: 0 }];
    expect(parseDocument(JSON.stringify(d))).toEqual(d);
    expect(() =>
      parseDocument(JSON.stringify({ ...d, version: 99 })),
    ).toThrow();
    expect(() =>
      parseDocument(
        JSON.stringify({ ...d, disks: [{ x: 0, y: 0, r: -2, color: 0 }] }),
      ),
    ).toThrow();
    const svg = exportSVG(d);
    expect(svg).toContain('width="200mm"');
    expect(svg.match(/<circle /g)?.length).toBe(1);
    expect(svg).toContain("XYZ-D65");
  });
});

import reference from "./brettel-reference.json";
it("matches independent DaltonLens Brettel linear-RGB reference vectors", () => {
  const inputs: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.2, 0.4, 0.6],
    [1, 1, 1],
  ];
  for (const profile of ["protan", "deutan", "tritan"] as const)
    inputs.forEach((v, i) =>
      simulate(v.map(encode) as Vec3, profile)
        .map(linearize)
        .forEach((x, j) => expect(x).toBeCloseTo(reference[profile][i][j], 5)),
    );
});
it("measures a 20,000 disk generation without quadratic collision checks", () => {
  const start = performance.now();
  const disks = generateDisks({
    ...defaultDocument().geometry,
    shape: "rectangle",
    width: 1000,
    height: 1000,
    minRadius: 0.5,
    maxRadius: 1,
    limit: 20000,
  });
  expect(disks.length).toBe(20000);
  console.info(`20,000 disques : ${(performance.now() - start).toFixed(0)} ms`);
});

it("uses density to produce a sparse plate rather than only changing search effort", () => {
  const p = { ...defaultDocument().geometry, width: 80, height: 80 };
  const sparse = generateDisks({ ...p, density: 0.1 });
  const area = sparse.reduce((sum, d) => sum + Math.PI * d.r * d.r, 0);
  expect(area / (Math.PI * 40 * 40)).toBeLessThan(0.12);
  expect(generateDisks({ ...p, density: 1 }).length).toBeGreaterThan(
    sparse.length * 2,
  );
});

describe("palette editing", () => {
  it("supports every guided recipe at all offered settings without an invalid gamut", () => {
    for (const profile of ["protan", "deutan", "tritan"] as const)
      for (const effect of [
        "accessible",
        "vanishing",
        "hidden",
        "transforming",
      ] as const)
        for (const noise of [0, 0.35, 1])
          for (const strength of [0.1, 0.7, 1]) {
            const colors = buildPalette({
              ...defaultDocument().palette,
              mode: "guided",
              profile,
              effect,
              noise,
              strength,
            });
            expect(colors).toHaveLength(64);
            expect(
              colors.every((c) =>
                fromXYZ(c.xyz).every((v) => v >= -0.00001 && v <= 1.00001),
              ),
            ).toBe(true);
          }
  });
  it("uses a colored accessible recipe and enforces contrast in free mode", () => {
    for (const mode of ["free", "guided"] as const) {
      const colors = buildPalette({
        ...defaultDocument().palette,
        mode,
        effect: "accessible",
        noise: 1,
      });
      expect(Math.abs(colors[8].xyz[1] - colors[24].xyz[1])).toBeGreaterThan(
        0.25,
      );
      const rgb = fromXYZ(colors[8].xyz);
      expect(Math.max(...rgb) - Math.min(...rgb)).toBeGreaterThan(0.02);
    }
  });
});

describe("palettes anchored to a user base", () => {
  it("derives motif colors from both the base and targeted profile", () => {
    const original = {
      ...defaultDocument().palette,
      mode: "free" as const,
      effect: "vanishing" as const,
      noise: 0,
    };
    const a = buildPalette(original);
    const b = buildPalette({ ...original, profile: "protan" });
    expect(b[16].xyz).not.toEqual(a[16].xyz);
    const c = buildPalette({
      ...original,
      freeColors: ["#ae6381", "#000000", "#000000", "#000000"],
    });
    expect(c[16].xyz).not.toEqual(a[16].xyz);
    fromXYZ(a[0].xyz).forEach((v, i) =>
      expect(v).toBeCloseTo(hexRGB(original.freeColors[0])[i], 5),
    );
  });
  it("keeps recipes finite and in display gamut even at extreme base colors", () => {
    for (const base of [
      "#000000",
      "#ffffff",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#808080",
    ])
      for (const effect of [
        "accessible",
        "vanishing",
        "hidden",
        "transforming",
      ] as const)
        for (const profile of ["protan", "deutan", "tritan"] as const) {
          const colors = buildPalette({
            ...defaultDocument().palette,
            mode: "free",
            effect,
            profile,
            noise: 1,
            strength: 1,
            freeColors: [base, base, base, base],
          });
          expect(
            colors.every((c) =>
              fromXYZ(c.xyz).every(
                (v) => Number.isFinite(v) && v >= -0.00001 && v <= 1.00001,
              ),
            ),
          ).toBe(true);
        }
  });
});

describe("new project palette defaults", () => {
  it("starts guided with standard reading, preserving choices when reopening", () => {
    const fresh = defaultDocument();
    expect(fresh.palette.mode).toBe("guided");
    expect(fresh.palette.effect).toBe("vanishing");
    fresh.palette = { ...fresh.palette, mode: "free", effect: "hidden" };
    const reopened = parseDocument(JSON.stringify(fresh));
    expect(reopened.palette.mode).toBe("free");
    expect(reopened.palette.effect).toBe("hidden");
    expect(defaultDocument().palette.mode).toBe("guided");
  });
});
