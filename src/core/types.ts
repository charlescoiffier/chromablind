export type Vec4 = [number, number, number, number];
export type Vec3 = [number, number, number];
export type Profile = "protan" | "deutan" | "tritan";
export type Effect = "accessible" | "vanishing" | "hidden" | "transforming";
export interface Geometry {
  shape: "circle" | "rectangle";
  width: number;
  height: number;
  minRadius: number;
  maxRadius: number;
  gap: number;
  density: number;
  distribution: number;
  seed: number;
  limit: number;
}
export interface Disk {
  x: number;
  y: number;
  r: number;
  color: number;
}
export interface PaletteSettings {
  mode: "free" | "guided";
  effect: Effect;
  profile: Profile;
  noise: number;
  strength: number;
  baseCMYK?: Vec4;
  freeColors: [string, string, string, string];
}
export interface Color {
  space: "XYZ-D65";
  xyz: Vec3;
  cmyk?: Vec4;
}
export interface Stroke {
  path: string;
  width: number;
  erase: boolean;
}
export interface Motif {
  font?: string;
  strokes?: Stroke[];
  regions?: { path: string; fillRule: "nonzero" | "evenodd" }[];
  fillRule: "nonzero" | "evenodd";
  kind: "text" | "svg" | "draw";
  text: string;
  path: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  strokeWidth: number;
}
export interface Document {
  version: 1;
  generator: "packing-1";
  name: string;
  geometry: Geometry;
  palette: PaletteSettings;
  colors: Color[];
  motifs: [Motif, Motif];
  disks: Disk[];
  background: string;
  print?: {
    space?: "CMYK";
    profile: "fogra39-vigc";
    sha256: string;
    background: Vec4;
  };
}
export interface Proof {
  colors: Vec3[];
  relativeColors: Vec3[];
  background: Vec3;
  deltaE: number[];
  outOfGamut: boolean[];
  profile: string;
  warnings: string[];
}
