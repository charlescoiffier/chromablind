import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { cssRGB, previewRGB, simulate, grayscale, hexRGB } from "../core/color";
import { cmykToRGB, colorTablesReady } from "../core/cmyk";
import { matrixFor } from "../core/masks";
import type { Document, Vec3 } from "../core/types";
interface Props {
  doc: Document;
  view: "original" | "simulation" | "gray" | "proof";
  model: "brettel" | "machado";
  severity: number;
  proofColors?: Vec3[];
  proofBackground?: Vec3;
  active: number;
  tool: "move" | "draw" | "erase";
  outline?: boolean;
  interactive?: boolean;
  onTransform?: (x: number, y: number) => void;
  onDraw?: (path: string) => void;
  zoom?: number;
}
export function Plate({
  doc,
  view,
  model,
  severity,
  proofColors,
  proofBackground,
  active,
  tool,
  outline = false,
  interactive = false,
  onTransform,
  onDraw,
  zoom: _zoom = 1,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null),
    gesture = useRef<{
      id: number;
      start: [number, number];
      origin: [number, number];
      points: [number, number][];
    } | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    path?: string;
  } | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { width, height } = doc.geometry;
    const pixels = interactive ? 1100 : 420;
    const scale = pixels / Math.max(width, height);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { colorSpace: "srgb" })!;
    ctx.scale(scale, scale);
    let background =
      doc.print && colorTablesReady()
        ? cmykToRGB(doc.print.background)
        : hexRGB(doc.background);
    if (view === "simulation")
      background = simulate(background, doc.palette.profile, model, severity);
    if (view === "gray") background = grayscale(background);
    if (view === "proof" && proofBackground) background = proofBackground;
    ctx.fillStyle = cssRGB(background);
    ctx.fillRect(0, 0, width, height);
    const palette = doc.colors.map((c, i) => {
      let rgb = previewRGB(c);
      if (view === "proof" && proofColors) rgb = proofColors[i] ?? rgb;
      if (view === "simulation")
        rgb = simulate(rgb, doc.palette.profile, model, severity);
      if (view === "gray") rgb = grayscale(rgb);
      return cssRGB(rgb);
    });
    for (const d of doc.disks) {
      ctx.fillStyle = palette[d.color];
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (interactive && (outline || ghost)) {
      const m = doc.motifs[active],
        transform = matrixFor({
          ...m,
          ...(ghost && !ghost.path ? { x: ghost.x, y: ghost.y } : {}),
        });
      ctx.save();
      ctx.transform(
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.e,
        transform.f,
      );
      const data = ghost?.path ?? m.path;
      ctx.fillStyle = "#2075a6";
      ctx.globalAlpha = 0.3;
      if (m.kind === "draw") {
        const mask = document.createElement("canvas");
        mask.width = canvas.width;
        mask.height = canvas.height;
        const brush = mask.getContext("2d")!;
        brush.scale(scale, scale);
        brush.transform(
          transform.a,
          transform.b,
          transform.c,
          transform.d,
          transform.e,
          transform.f,
        );
        brush.strokeStyle = "#2075a6";
        brush.lineCap = "round";
        brush.lineJoin = "round";
        const strokes = [
          ...(m.strokes ?? [
            { path: m.path, width: m.strokeWidth, erase: false },
          ]),
          ...(ghost?.path
            ? [
                {
                  path: ghost.path,
                  width: m.strokeWidth,
                  erase: tool === "erase",
                },
              ]
            : []),
        ];
        for (const stroke of strokes) {
          brush.globalCompositeOperation = stroke.erase
            ? "destination-out"
            : "source-over";
          brush.lineWidth = stroke.width;
          brush.stroke(new Path2D(stroke.path));
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(mask, 0, 0);
      } else {
        for (const region of m.regions ?? [
          { path: data, fillRule: m.fillRule },
        ])
          ctx.fill(new Path2D(region.path), region.fillRule);
      }
      ctx.restore();
    }
  }, [
    doc,
    view,
    model,
    severity,
    proofColors,
    proofBackground,
    active,
    outline,
    interactive,
    ghost,
  ]);
  const point = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const b = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - b.left) / b.width) * doc.geometry.width,
      ((e.clientY - b.top) / b.height) * doc.geometry.height,
    ];
  };
  const path = (points: [number, number][]) =>
    points
      .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`)
      .join(" ");
  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (!interactive || !outline) return;
    e.preventDefault();
    const p = point(e),
      m = doc.motifs[active];
    e.currentTarget.setPointerCapture(e.pointerId);
    const local = matrixFor(m).inverse().transformPoint({ x: p[0], y: p[1] });
    gesture.current = {
      id: e.pointerId,
      start: p,
      origin: [m.x, m.y],
      points: [[local.x, local.y]],
    };
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const p = point(e);
    if (tool === "draw" || tool === "erase") {
      const local = matrixFor(doc.motifs[active])
        .inverse()
        .transformPoint({ x: p[0], y: p[1] });
      g.points.push([local.x, local.y]);
      setGhost({ x: 0, y: 0, path: path(g.points) });
    } else
      setGhost({
        x: g.origin[0] + p[0] - g.start[0],
        y: g.origin[1] + p[1] - g.start[1],
      });
  }
  function up(e: PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (tool === "draw" || tool === "erase") {
      const p = point(e),
        local = matrixFor(doc.motifs[active])
          .inverse()
          .transformPoint({ x: p[0], y: p[1] });
      g.points.push([local.x + 0.001, local.y + 0.001]);
      onDraw?.(path(g.points));
    } else if (tool === "move") {
      const p = point(e);
      onTransform?.(
        g.origin[0] + p[0] - g.start[0],
        g.origin[1] + p[1] - g.start[1],
      );
    }
    gesture.current = null;
    setGhost(null);
  }
  return (
    <canvas
      ref={ref}
      data-testid={interactive ? "main-canvas" : undefined}
      className={`plate-canvas ${interactive ? "interactive" : ""} ${interactive && outline && tool === "move" ? "can-move" : ""} ${interactive && outline && tool !== "move" ? "can-draw" : ""}`}
      style={{
        width: "100%",
        height: interactive ? "100%" : "auto",
        aspectRatio: `${doc.geometry.width}/${doc.geometry.height}`,
      }}
      role="img"
      aria-label={
        interactive
          ? "Illustration, déplacer le motif ou dessiner sur la surface"
          : `Aperçu ${view}`
      }
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onLostPointerCapture={() => {
        gesture.current = null;
        setGhost(null);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        setGhost(null);
      }}
    />
  );
}
