import type { Geometry, Disk } from "./types";
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function validateGeometry(p: Geometry) {
  if (
    !["circle", "rectangle"].includes(p.shape) ||
    ![
      p.width,
      p.height,
      p.minRadius,
      p.maxRadius,
      p.gap,
      p.density,
      p.distribution,
      p.seed,
      p.limit,
    ].every(Number.isFinite) ||
    p.width < 10 ||
    p.height < 10 ||
    p.width > 2000 ||
    p.height > 2000 ||
    p.minRadius < 0.2 ||
    p.maxRadius < p.minRadius ||
    p.maxRadius > 100 ||
    p.gap < 0 ||
    p.gap > 20 ||
    p.density < 0.1 ||
    p.density > 1 ||
    p.distribution < 0.2 ||
    p.distribution > 4 ||
    p.limit < 1 ||
    p.limit > 20000 ||
    !Number.isInteger(p.limit) ||
    !Number.isInteger(p.seed) ||
    p.maxRadius * 2 > Math.min(p.width, p.height) ||
    (p.shape === "circle" && p.width !== p.height)
  )
    throw new Error("Dimensions ou paramètres de disques invalides.");
}
export function generateDisks(
  p: Geometry,
  onProgress?: (n: number) => void,
): Disk[] {
  validateGeometry(p);
  const rnd = random(p.seed),
    disks: Disk[] = [];
  const cell = 2 * p.maxRadius + p.gap,
    grid = new Map<string, Disk[]>();
  const fits = (x: number, y: number, r: number) =>
    p.shape === "circle"
      ? Math.hypot(x - p.width / 2, y - p.height / 2) + r <= p.width / 2
      : x - r >= 0 && y - r >= 0 && x + r <= p.width && y + r <= p.height;
  const supportArea =
    p.shape === "circle" ? Math.PI * (p.width / 2) ** 2 : p.width * p.height;
  const targetArea = supportArea * p.density;
  let occupiedArea = 0;
  // Larger candidates first; smaller candidates fill gaps without reference to motifs.
  for (let stage = 0; stage < 8 && disks.length < p.limit; stage++) {
    const upper = p.maxRadius - ((p.maxRadius - p.minRadius) * stage) / 7;
    const attempts = Math.min(
      300000,
      Math.ceil(((p.width * p.height) / (upper * upper)) * 14 * p.density),
    );
    for (let i = 0; i < attempts && disks.length < p.limit; i++) {
      const r =
          p.minRadius + (upper - p.minRadius) * Math.pow(rnd(), p.distribution),
        x = rnd() * p.width,
        y = rnd() * p.height;
      if (!fits(x, y, r)) continue;
      const gx = Math.floor(x / cell),
        gy = Math.floor(y / cell);
      let collision = false;
      for (let dx = -1; dx <= 1 && !collision; dx++)
        for (let dy = -1; dy <= 1 && !collision; dy++)
          for (const other of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
            if (
              (x - other.x) ** 2 + (y - other.y) ** 2 <
              (r + other.r + p.gap) ** 2
            ) {
              collision = true;
              break;
            }
          }
      if (collision) continue;
      const d = { x, y, r, color: 0 };
      disks.push(d);
      occupiedArea += Math.PI * r * r;
      if (occupiedArea >= targetArea) return disks;
      const key = `${gx},${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(d);
      if (disks.length % 300 === 0) onProgress?.(disks.length);
    }
  }
  return disks;
}
