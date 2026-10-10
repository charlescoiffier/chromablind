import { useEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus2,
  File,
  Hand,
  Crosshair,
  WandSparkles,
  PanelLeft,
  PanelRight,
  Eraser,
  HelpCircle,
  Circle,
  Square,
  MousePointer2,
  Pencil,
  Undo2,
  Redo2,
  Download,
  FolderOpen,
  Save,
  Shuffle,
  ZoomIn,
  ZoomOut,
  Eye,
  Layers,
  Info,
  SlidersHorizontal,
  X,
  ArrowUpRight,
  Check,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import type { Font } from "opentype.js";
import { validateGeometry } from "./core/geometry";
import { defaultDocument, parseDocument, withPrint } from "./core/document";
import {
  deriveFreeColors,
  hexRGB,
  clamp,
  buildPalette,
  colorMetrics,
  cssRGB,
  previewRGB,
  toXYZ,
} from "./core/color";
import {
  loadFont,
  fontChoices,
  centerDrawing,
  textPath,
  recolor,
  importSVG,
} from "./core/masks";
import { download, exportSVG } from "./core/export";
import { CommittedNumber } from "./components/CommittedNumber";
import { HelpContent } from "./components/HelpContent";
import { loadColorTables, rgbToCMYK, cmykToRGB } from "./core/cmyk";
import { QuickTooltip } from "./components/QuickTooltip";
import { Plate } from "./components/Plate";
import type {
  Document,
  Geometry,
  Motif,
  PaletteSettings,
  Proof,
  Vec4,
} from "./core/types";

const exportAPI =
  import.meta.env.VITE_EXPORT_API_URL?.replace(/\/$/, "") || "/api";
const exportServiceAvailable =
  import.meta.env.DEV ||
  Boolean(import.meta.env.VITE_EXPORT_API_URL) ||
  import.meta.env.BASE_URL === "/";
const storageKey = "chromablind.project.v1";
function initial() {
  try {
    const saved =
      localStorage.getItem(storageKey) ??
      localStorage.getItem("chromatique.project.v1");
    if (saved) return parseDocument(saved);
  } catch {
    /* Invalid saved projects are never trusted. */
  }
  return defaultDocument();
}
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="slider-label">
      <span>
        {label}
        <output>
          {value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
const effectNames = {
  accessible: "Lecture commune",
  vanishing: "Lecture standard",
  hidden: "Lecture daltonienne · expérimental",
  transforming: "Deux lectures · expérimental",
};
const effectDescriptions = {
  accessible:
    "Une différence modérée de clarté vise une lecture commune aux différents profils de vision.",
  vanishing:
    "Le motif A vise une lecture plus difficile pour le profil daltonien ciblé. En création libre, cet effet reste une intention à vérifier.",
  hidden:
    "Le motif B vise une lecture plus difficile en vision standard et plus facile pour le profil ciblé. Expérimental, sans garantie de lecture humaine.",
  transforming:
    "A vise une lecture plus difficile pour le profil daltonien ciblé ; B, pour la vision standard. Composez-les séparément dans l’onglet Motif. Expérimental.",
};
const profileNames = {
  protan: "Protan · système L",
  deutan: "Deutan · système M",
  tritan: "Tritan · système S",
};

export default function App() {
  const [generationNonce, setGenerationNonce] = useState(0),
    [cancelled, setCancelled] = useState(false);
  const [doc, setDoc] = useState<Document>(initial),
    [font, setFont] = useState<Font>(),
    [active, setActive] = useState(0),
    [tool, setTool] = useState<"move" | "draw" | "erase">("move"),
    [outline, setOutline] = useState(true),
    [view, setView] = useState<"original" | "simulation" | "gray" | "proof">(
      "original",
    ),
    [model, setModel] = useState<"brettel" | "machado">("brettel"),
    [severity, setSeverity] = useState(1),
    [zoom, setZoom] = useState(1),
    [generating, setGenerating] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [exportOpen, setExportOpen] = useState(false),
    [aboutOpen, setAboutOpen] = useState(false),
    [panel, setPanel] = useState<"format" | "motif" | "palette">("format"),
    [mobileSettings, setMobileSettings] = useState(
      () => window.innerWidth >= 950,
    ),
    [rightPanel, setRightPanel] = useState(() => window.innerWidth >= 1100),
    [fonts, setFonts] = useState<Record<string, Font>>({});
  const [panMode, setPanMode] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panGesture = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    distance: number;
    x: number;
    y: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [navigationGesture, setNavigationGesture] = useState(false);
  const savedState = useRef<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ width: 600, height: 600 });
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const resize = new ResizeObserver((entries) => {
      const b = entries[0].contentRect;
      setAreaSize({ width: b.width, height: b.height });
    });
    resize.observe(area);
    return () => resize.disconnect();
  }, []);
  const proofRequest = useRef(0);
  const diskGeometries = useRef<WeakMap<object, string> | null>(null);
  if (!diskGeometries.current) {
    diskGeometries.current = new WeakMap();
    if (doc.disks.length)
      diskGeometries.current.set(doc.disks, JSON.stringify(doc.geometry));
  }
  const restoreGeometry = (snapshot: Document) => {
    const key = JSON.stringify(snapshot.geometry);
    preserveGeometry.current =
      diskGeometries.current!.get(snapshot.disks) === key ? key : null;
    if (preserveGeometry.current)
      completedGeometry.current = {
        geometry: snapshot.geometry,
        disks: snapshot.disks,
      };
    setCancelled(false);
  };
  const completedGeometry = useRef({
    geometry: doc.geometry,
    disks: doc.disks,
  });
  const preserveGeometry = useRef<string | null>(
      doc.disks.length ? JSON.stringify(doc.geometry) : null,
    ),
    generationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<Document[]>([]),
    future = useRef<Document[]>([]),
    [historyVersion, setHistoryVersion] = useState(0),
    worker = useRef<Worker | null>(null),
    projectInput = useRef<HTMLInputElement>(null),
    svgInput = useRef<HTMLInputElement>(null),
    [profiles, setProfiles] = useState<
      { id: string; name: string; description: string; source: string }[]
    >([]),
    [profileId, setProfileId] = useState("fogra39-vigc"),
    [profileFile, setProfileFile] = useState<File>(),
    [proof, setProof] = useState<Proof>(),
    [exportBusy, setExportBusy] = useState(false);
  const cooked = useMemo(
    () => withPrint({ ...doc, disks: recolor(doc) }),
    [doc],
  );
  const metrics = useMemo(
    () => colorMetrics(doc.colors, doc.palette.profile),
    [doc.colors, doc.palette.profile],
  );
  const mutate = (fn: (d: Document) => Document) => {
    setError("");
    proofRequest.current++;
    setProof(undefined);
    history.current.push(doc);
    if (history.current.length > 30) history.current.shift();
    future.current = [];
    setHistoryVersion((v) => v + 1);
    setDoc(fn(doc));
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      proofRequest.current++;
      future.current.push(doc);
      restoreGeometry(prev);
      setDoc(prev);
      setProof(undefined);
      setHistoryVersion((v) => v + 1);
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      proofRequest.current++;
      history.current.push(doc);
      restoreGeometry(next);
      setDoc(next);
      setProof(undefined);
      setHistoryVersion((v) => v + 1);
    }
  };
  void historyVersion;
  const changeGeometry = (patch: Partial<Geometry>) => {
    const geometry = { ...doc.geometry, ...patch };
    const max = Math.min(geometry.width, geometry.height) / 2;
    geometry.maxRadius = Math.min(geometry.maxRadius, max);
    geometry.minRadius = Math.min(geometry.minRadius, geometry.maxRadius);
    try {
      validateGeometry(geometry);
      preserveGeometry.current = null;
      mutate((d) => ({ ...d, geometry }));
    } catch (error) {
      notifyError(error);
    }
  };
  const changeMotif = (patch: Partial<Motif>) =>
    mutate((d) => {
      const motifs = [...d.motifs] as Document["motifs"];
      let m = { ...motifs[active], ...patch };
      if (m.kind !== "svg") m.regions = undefined;

      const face = fonts[m.font ?? "Atkinson"] ?? font;
      if (m.kind === "text" && face)
        m = { ...m, fillRule: "nonzero", path: textPath(face, m.text) };
      motifs[active] = m;
      return { ...d, motifs };
    });
  const changePalette = (patch: Partial<PaletteSettings>) => {
    try {
      const palette = { ...doc.palette, ...patch };
      const colors = buildPalette(palette);
      mutate((d) => ({ ...d, palette, colors }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Palette invalide.");
    }
  };
  useEffect(() => {
    let alive = true;
    Promise.all([
      Promise.all(
        fontChoices.map(
          async (face) => [face.id, await loadFont(face.id)] as const,
        ),
      ),
      loadColorTables(),
    ])
      .then(([loaded]) => {
        if (!alive) return;
        const available = Object.fromEntries(loaded);
        setFonts(available);
        setFont(available.Atkinson);
        setDoc((d) =>
          withPrint({
            ...d,
            motifs: d.motifs.map((m) =>
              m.kind === "text"
                ? {
                    ...m,
                    path: textPath(available[m.font ?? "Atkinson"], m.text),
                  }
                : m,
            ) as Document["motifs"],
          }),
        );
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
      worker.current?.terminate();
    };
  }, []);
  useEffect(() => {
    if (!exportOpen && !aboutOpen && !newOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    const backgrounds = [
      ...document.querySelectorAll<HTMLElement>(
        ".topbar,.workspace,.app-footer",
      ),
    ];
    backgrounds.forEach((el) => (el.inert = true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      [
        ...(modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input,select,textarea",
        ) ?? []),
      ].filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusable(),
        first = list[0],
        last = list.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      backgrounds.forEach((el) => (el.inert = false));
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", trap);
      opener?.focus();
    };
  }, [exportOpen, aboutOpen, newOpen]);
  const geometryKey = JSON.stringify(doc.geometry);
  useEffect(() => {
    if (preserveGeometry.current === geometryKey) {
      setGenerating(false);
      return;
    }
    proofRequest.current++;
    setProof(undefined);
    setCancelled(false);
    setGenerating(true);
    setProgress(0);
    const timer = setTimeout(() => {
      worker.current?.terminate();
      const w = new Worker(
        new URL("./core/generator.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = (e) => {
        if (worker.current !== w) return;
        if (e.data.type === "progress") setProgress(e.data.n);
        if (e.data.type === "error") {
          setError(e.data.message);
          setGenerating(false);
          w.terminate();
        }
        if (e.data.type === "complete") {
          diskGeometries.current!.set(e.data.disks, geometryKey);
          completedGeometry.current = {
            geometry: doc.geometry,
            disks: e.data.disks,
          };
          setDoc((d) => ({ ...d, disks: e.data.disks }));
          setGenerating(false);
          w.terminate();
          worker.current = null;
        }
      };
      w.onerror = () => {
        setError("La génération a échoué. Réduisez le nombre de disques.");
        setGenerating(false);
      };
      w.postMessage({ geometry: doc.geometry });
    }, 180);
    generationTimer.current = timer;
    return () => {
      clearTimeout(timer);
      worker.current?.terminate();
      worker.current = null;
    };
  }, [geometryKey, generationNonce]);
  useEffect(() => {
    if (
      generating ||
      cancelled ||
      JSON.stringify(completedGeometry.current.geometry) !== geometryKey
    )
      return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(cooked));
      } catch {
        setNotice(
          "Stockage local plein. Téléchargez votre projet pour le conserver.",
        );
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [cooked, generating, cancelled, geometryKey]);
  useEffect(() => {
    if (doc.palette.profile === "tritan") setModel("brettel");
  }, [doc.palette.profile]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") {
        setExportOpen(false);
        setAboutOpen(false);
        setNewOpen(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (exportOpen && exportServiceAvailable)
      fetch(`${exportAPI}/profiles`)
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data) =>
          setProfiles(
            data.profiles.filter(
              (p: { id: string }) => p.id !== "srgb-reference",
            ),
          ),
        )
        .catch(() =>
          setNotice(
            "Service d’export indisponible. Le SVG et le projet restent disponibles.",
          ),
        );
  }, [exportOpen]);
  const busy = generating || !font || cancelled;
  const notifyError = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error("Le projet dépasse 8 Mo.");
      const next = parseDocument(await file.text());
      worker.current?.terminate();
      if (generationTimer.current) clearTimeout(generationTimer.current);
      setGenerating(false);
      setCancelled(false);
      diskGeometries.current!.set(next.disks, JSON.stringify(next.geometry));
      preserveGeometry.current = JSON.stringify(next.geometry);
      completedGeometry.current = {
        geometry: next.geometry,
        disks: next.disks,
      };
      mutate(() => withPrint(next));
      savedState.current = JSON.stringify(
        withPrint({ ...next, disks: recolor(next) }),
      );
      setNotice("Projet ouvert.");
    } catch (e) {
      notifyError(e);
    } finally {
      if (projectInput.current) projectInput.current.value = "";
    }
  }
  async function openSVG(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Le SVG dépasse 1 Mo.");
      const result = importSVG(await file.text());
      changeMotif({
        kind: "svg",
        path: result.path,
        fillRule: result.fillRule,
        regions: result.regions,
        scale: 1,
      });
      setTool("move");
      setPanel("motif");
      setNotice(
        `SVG importé${result.removed ? " ; contenus actifs ignorés" : ""}.`,
      );
    } catch (e) {
      notifyError(e);
    } finally {
      if (svgInput.current) svgInput.current.value = "";
    }
  }
  const resetProject = () => {
    worker.current?.terminate();
    if (generationTimer.current) clearTimeout(generationTimer.current);
    const fresh = defaultDocument();
    fresh.motifs.forEach((m) => {
      m.text = "";
      m.path = "";
      m.strokes = [];
      m.regions = undefined;
    });
    history.current = [];
    future.current = [];
    preserveGeometry.current = null;
    completedGeometry.current = { geometry: fresh.geometry, disks: [] };
    setDoc(fresh);
    setCancelled(false);
    setGenerationNonce((v) => v + 1);
    setProof(undefined);
    proofRequest.current++;
    setActive(0);
    setPanel("format");
    setView("original");
    setTool("move");
    setOutline(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPanMode(false);
    savedState.current = null;
    setNewOpen(false);
    setNotice("Nouveau projet.");
  };
  const save = () => {
    download(
      JSON.stringify(cooked, null, 2),
      "application/json",
      `${doc.name}.chromablind.json`,
    );
    savedState.current = JSON.stringify(cooked);
    setNotice("Projet sauvegardé.");
  };
  const svg = () => {
    download(exportSVG(cooked), "image/svg+xml", `${doc.name}.svg`);
    setNotice("SVG exporté.");
  };
  async function requestExport(kind: "pdf" | "proof") {
    if (!profileId && !profileFile) {
      setError(
        "Sélectionnez un profil ICC ou importez celui de votre imprimeur.",
      );
      return;
    }
    const requestId = ++proofRequest.current,
      exportName = doc.name;
    setExportBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("document", JSON.stringify(cooked));
      if (profileFile) form.set("profile", profileFile);
      else form.set("profile_id", profileId);
      const response = await fetch(
        kind === "pdf" ? `${exportAPI}/export/pdf` : `${exportAPI}/proof`,
        { method: "POST", body: form },
      );
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(
          typeof failure?.detail === "string"
            ? failure.detail
            : "Export impossible. Vérifiez le service et le profil ICC.",
        );
      }
      if (kind === "proof") {
        const result = await response.json();
        if (requestId !== proofRequest.current) {
          setNotice("Le projet ou le profil a changé. Relancez l’épreuve.");
          return;
        }
        setProof(result);
        setView("proof");
        setOutline(false);
        setNotice("Épreuve écran calculée.");
      } else {
        download(await response.blob(), "application/pdf", `${exportName}.pdf`);
        setNotice("PDF profilé exporté. Conformité PDF/X non vérifiée.");
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setExportBusy(false);
    }
  }
  const effectiveModel = doc.palette.profile === "tritan" ? "brettel" : model;
  const proofMetrics = proof
    ? colorMetrics(
        proof.relativeColors.map((rgb) => ({
          space: "XYZ-D65",
          xyz: toXYZ(rgb),
        })),
        doc.palette.profile,
      )
    : undefined;
  const selectedMotif = doc.motifs[active],
    experimental =
      doc.palette.mode === "guided" &&
      ["hidden", "transforming"].includes(doc.palette.effect);
  return (
    <div className="app-shell">
      <QuickTooltip />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>chromablind</span>
        </div>
        <div className="project-title">
          <input
            aria-label="Nom du projet"
            value={doc.name}
            onChange={(e) =>
              mutate((d) => ({ ...d, name: e.target.value.slice(0, 150) }))
            }
          />
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            title="Nouveau projet"
            aria-label="Nouveau projet"
            disabled={busy}
            onClick={() => {
              if (
                history.current.length &&
                savedState.current !== JSON.stringify(cooked)
              )
                setNewOpen(true);
              else resetProject();
            }}
          >
            <FilePlus2 size={19} />
          </button>
          <button
            className="icon-button"
            title="Ouvrir un projet"
            aria-label="Ouvrir un projet"
            onClick={() => projectInput.current?.click()}
          >
            <FolderOpen size={19} />
          </button>
          <button
            className="icon-button"
            title="Sauvegarder le projet"
            aria-label="Sauvegarder le projet"
            onClick={save}
            disabled={busy}
          >
            <Save size={19} />
          </button>
          <button
            className="primary"
            onClick={() => setExportOpen(true)}
            disabled={busy}
          >
            <Download size={16} />
            Exporter
            <ChevronDown size={14} />
          </button>
        </div>
      </header>
      {newOpen && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nouveau projet"
          >
            <h2>Enregistrer le projet actuel ?</h2>
            <p>Le nouveau projet remplacera votre composition actuelle.</p>
            <button
              className="primary"
              onClick={() => {
                save();
                resetProject();
              }}
            >
              Sauvegarder et créer
            </button>
            <button className="secondary" onClick={resetProject}>
              Créer sans sauvegarder
            </button>
            <button
              className="secondary"
              autoFocus
              onClick={() => setNewOpen(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      <input
        hidden
        ref={projectInput}
        data-testid="project-input"
        type="file"
        accept=".json"
        onChange={(e) => openProject(e.target.files?.[0])}
      />
      <input
        hidden
        ref={svgInput}
        data-testid="svg-input"
        type="file"
        accept=".svg,image/svg+xml"
        onChange={(e) => openSVG(e.target.files?.[0])}
      />
      <div
        className={`workspace ${mobileSettings ? "left-visible" : ""} ${rightPanel ? "right-visible" : ""}`}
      >
        <aside
          id="settings-panel"
          className={`settings ${mobileSettings ? "is-open" : ""}`}
          hidden={!mobileSettings}
        >
          <div className="settings-heading">
            <h2>Composer</h2>
            <button
              className="icon-button"
              aria-label="Fermer les réglages"
              onClick={() => setMobileSettings(false)}
            >
              <X size={18} />
            </button>
          </div>
          <nav className="panel-tabs" aria-label="Réglages">
            <button
              onClick={() => setPanel("format")}
              className={panel === "format" ? "selected" : ""}
            >
              Format
            </button>
            <button
              onClick={() => setPanel("motif")}
              className={panel === "motif" ? "selected" : ""}
            >
              Motif
            </button>
            <button
              onClick={() => setPanel("palette")}
              className={panel === "palette" ? "selected" : ""}
            >
              Couleurs
            </button>
          </nav>
          <div className="settings-body">
            {panel === "format" && (
              <>
                <h3>La surface</h3>
                <div className="shape-picker">
                  <button
                    className={
                      doc.geometry.shape === "circle" ? "selected" : ""
                    }
                    onClick={() =>
                      changeGeometry({
                        shape: "circle",
                        height: doc.geometry.width,
                      })
                    }
                  >
                    <Circle size={30} strokeWidth={1.2} />
                    Disque
                  </button>
                  <button
                    className={
                      doc.geometry.shape === "rectangle" ? "selected" : ""
                    }
                    onClick={() =>
                      changeGeometry({ shape: "rectangle", height: 120 })
                    }
                  >
                    <Square size={30} strokeWidth={1.2} />
                    Rectangle
                  </button>
                </div>
                <div className="number-row">
                  <CommittedNumber
                    label={
                      doc.geometry.shape === "circle"
                        ? "Diamètre (mm)"
                        : "Largeur (mm)"
                    }
                    value={doc.geometry.width}
                    min={10}
                    max={2000}
                    onCommit={(width) =>
                      changeGeometry({
                        width,
                        ...(doc.geometry.shape === "circle"
                          ? { height: width }
                          : {}),
                      })
                    }
                  />
                  {doc.geometry.shape === "rectangle" && (
                    <CommittedNumber
                      label="Hauteur (mm)"
                      value={doc.geometry.height}
                      min={10}
                      max={2000}
                      onCommit={(height) => changeGeometry({ height })}
                    />
                  )}
                </div>
                <div className="divider" />
                <h3>Les bulles</h3>
                <Slider
                  label="Rayon minimum"
                  min={0.2}
                  max={doc.geometry.maxRadius}
                  step={0.1}
                  value={doc.geometry.minRadius}
                  suffix=" mm"
                  onChange={(minRadius) => changeGeometry({ minRadius })}
                />
                <Slider
                  label="Rayon maximum"
                  min={doc.geometry.minRadius}
                  max={Math.min(
                    Math.min(100, Math.max(12, doc.geometry.maxRadius)),
                    doc.geometry.width / 2,
                    doc.geometry.height / 2,
                  )}
                  step={0.1}
                  value={doc.geometry.maxRadius}
                  suffix=" mm"
                  onChange={(maxRadius) => changeGeometry({ maxRadius })}
                />
                <Slider
                  label="Variabilité des tailles"
                  min={0.2}
                  max={4}
                  step={0.05}
                  value={doc.geometry.distribution}
                  onChange={(distribution) => changeGeometry({ distribution })}
                />
                <Slider
                  label="Espacement"
                  min={0}
                  max={Math.min(20, Math.max(2, doc.geometry.gap))}
                  step={0.01}
                  value={doc.geometry.gap}
                  suffix=" mm"
                  onChange={(gap) => changeGeometry({ gap })}
                />
                <Slider
                  label="Densité du remplissage"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={doc.geometry.density}
                  onChange={(density) => changeGeometry({ density })}
                />
                <div className="auto-actions">
                  <button
                    className="secondary"
                    aria-label="Auto · proposer les paramètres"
                    title="Adapter les bulles au support"
                    onClick={() => {
                      const factor =
                        Math.min(doc.geometry.width, doc.geometry.height) / 200;
                      changeGeometry({
                        minRadius: Math.max(0.2, 1.1 * factor),
                        maxRadius: Math.max(0.2, Math.min(100, 3.8 * factor)),
                        distribution: 0.65,
                        gap: 0.28 * factor,
                        density: 0.9,
                      });
                      setNotice("Paramètres des bulles adaptés au support.");
                    }}
                  >
                    <WandSparkles size={16} /> Auto
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      changeGeometry({ seed: (doc.geometry.seed + 7919) >>> 0 })
                    }
                  >
                    <Shuffle size={16} />
                    Nouvelle dispo
                  </button>
                </div>
                <label className="seed-label">
                  Graine reproductible
                  <input
                    type="number"
                    aria-label="Graine reproductible"
                    value={doc.geometry.seed}
                    min="0"
                    max="4294967295"
                    onChange={(e) => {
                      const seed = Number(e.target.value);
                      if (
                        Number.isInteger(seed) &&
                        seed >= 0 &&
                        seed <= 4294967295
                      )
                        changeGeometry({ seed });
                    }}
                  />
                </label>
              </>
            )}
            {panel === "motif" && (
              <>
                <h3>Le motif</h3>
                {doc.palette.effect === "transforming" && (
                  <div className="segmented">
                    <button
                      className={active === 0 ? "selected" : ""}
                      onClick={() => setActive(0)}
                    >
                      Motif A
                    </button>
                    <button
                      className={active === 1 ? "selected" : ""}
                      onClick={() => setActive(1)}
                    >
                      Motif B
                    </button>
                  </div>
                )}
                <div className="segmented">
                  <button
                    className={selectedMotif.kind === "text" ? "selected" : ""}
                    onClick={() => {
                      changeMotif({ kind: "text" });
                      setOutline(true);
                      setView("original");
                      setTool("move");
                    }}
                  >
                    Texte
                  </button>
                  <button
                    className={selectedMotif.kind === "draw" ? "selected" : ""}
                    onClick={() => {
                      changeMotif({
                        kind: "draw",
                        path: (selectedMotif.strokes ?? [])
                          .filter((s) => !s.erase)
                          .map((s) => s.path)
                          .join(" "),
                      });
                      setOutline(true);
                      setView("original");
                      setTool("draw");
                    }}
                  >
                    Dessin
                  </button>
                  <button
                    className={selectedMotif.kind === "svg" ? "selected" : ""}
                    onClick={() => svgInput.current?.click()}
                  >
                    SVG
                  </button>
                </div>
                {selectedMotif.kind === "text" && (
                  <label className="field">
                    Texte du motif
                    <textarea
                      aria-label="Texte du motif"
                      value={selectedMotif.text}
                      maxLength={100}
                      onChange={(e) => changeMotif({ text: e.target.value })}
                    />
                    <span>Police du motif</span>
                    <select
                      aria-label="Police du motif"
                      value={selectedMotif.font ?? "Atkinson"}
                      onChange={(e) => changeMotif({ font: e.target.value })}
                    >
                      {fontChoices.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="motif-tools">
                  <button
                    className={`icon-button ${tool === "move" ? "active" : ""}`}
                    aria-label="Déplacer le motif"
                    title="Déplacer le motif"
                    onClick={() => {
                      setTool("move");
                      setOutline(true);
                      setPanMode(false);
                      setView("original");
                    }}
                  >
                    <MousePointer2 size={18} />
                  </button>
                  {selectedMotif.kind === "draw" && (
                    <>
                      <button
                        className={`icon-button ${tool === "draw" ? "active" : ""}`}
                        aria-label="Crayon"
                        title="Crayon"
                        onClick={() => {
                          setTool("draw");
                          setOutline(true);
                          setPanMode(false);
                          setView("original");
                        }}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className={`icon-button ${tool === "erase" ? "active" : ""}`}
                        aria-label="Gomme"
                        title="Gomme"
                        onClick={() => {
                          setTool("erase");
                          setOutline(true);
                          setPanMode(false);
                          setView("original");
                        }}
                      >
                        <Eraser size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Tout effacer"
                        title="Tout effacer"
                        onClick={() => changeMotif({ path: "", strokes: [] })}
                      >
                        <File size={18} />
                      </button>
                      <div className="brush-sizes">
                        {" "}
                        {[2, 5, 10, 20].map((width, i) => (
                          <button
                            key={width}
                            className={`icon-button ${selectedMotif.strokeWidth === width ? "active" : ""}`}
                            aria-label={`Épaisseur ${width} mm`}
                            title={`Épaisseur ${width} mm`}
                            onClick={() => changeMotif({ strokeWidth: width })}
                          >
                            <svg width="22" height="22">
                              <circle
                                cx="11"
                                cy="11"
                                r={[2, 4, 7, 10][i]}
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        ))}
                      </div>{" "}
                    </>
                  )}
                </div>
                {selectedMotif.kind === "svg" && (
                  <>
                    <p className="help">
                      Les formes sont converties en un tracé. Les ressources
                      externes et contenus actifs sont ignorés.
                    </p>
                    <button
                      className="secondary full"
                      onClick={() => svgInput.current?.click()}
                    >
                      Importer un autre SVG
                    </button>
                  </>
                )}
                <div className="divider" />
                <h3>Position et taille</h3>
                <Slider
                  label="Position horizontale"
                  min={0}
                  max={doc.geometry.width}
                  value={selectedMotif.x}
                  suffix=" mm"
                  onChange={(x) => changeMotif({ x })}
                />
                <Slider
                  label="Position verticale"
                  min={0}
                  max={doc.geometry.height}
                  value={selectedMotif.y}
                  suffix=" mm"
                  onChange={(y) => changeMotif({ y })}
                />
                <button
                  className="secondary center-motif"
                  aria-label="Centrer le motif"
                  title="Centrer le motif"
                  onClick={() =>
                    changeMotif({
                      x: doc.geometry.width / 2,
                      y: doc.geometry.height / 2,
                    })
                  }
                >
                  <Crosshair size={16} /> Centrer
                </button>
                <Slider
                  label="Échelle"
                  min={0.1}
                  max={3}
                  step={0.05}
                  value={selectedMotif.scale}
                  onChange={(scale) => changeMotif({ scale })}
                />
                <Slider
                  label="Rotation"
                  min={-180}
                  max={180}
                  value={selectedMotif.rotation}
                  suffix="°"
                  onChange={(rotation) => changeMotif({ rotation })}
                />
              </>
            )}
            {panel === "palette" && (
              <>
                <h3>La palette</h3>
                <div className="segmented" aria-label="Mode de palette">
                  <button
                    aria-pressed={doc.palette.mode === "guided"}
                    className={doc.palette.mode === "guided" ? "selected" : ""}
                    onClick={() => changePalette({ mode: "guided" })}
                  >
                    Guidée
                  </button>
                  <button
                    aria-pressed={doc.palette.mode === "free"}
                    className={doc.palette.mode === "free" ? "selected" : ""}
                    onClick={() => changePalette({ mode: "free" })}
                  >
                    Création libre
                  </button>
                </div>
                <label className="field">
                  Effet recherché
                  <select
                    aria-label="Effet recherché"
                    value={doc.palette.effect}
                    onChange={(e) => {
                      changePalette({
                        effect: e.target.value as PaletteSettings["effect"],
                      });
                      setActive(0);
                    }}
                  >
                    {Object.entries(effectNames).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {doc.palette.mode === "free" ? (
                  <>
                    <p className="help effect-description">
                      {effectDescriptions[doc.palette.effect]}
                    </p>
                    <details className="cmyk-picker">
                      <summary title="Choisir la base en CMJN">
                        <span
                          style={{ background: doc.palette.freeColors[0] }}
                        />
                        Base · CMJN
                      </summary>
                      {["Cyan", "Magenta", "Jaune", "Noir"].map((label, i) => (
                        <Slider
                          key={label}
                          label={label}
                          min={0}
                          max={100}
                          value={
                            (doc.palette.baseCMYK ??
                              (font
                                ? rgbToCMYK(hexRGB(doc.palette.freeColors[0]))
                                : [0, 0, 0, 0]))[i] * 100
                          }
                          suffix=" %"
                          onChange={(value) => {
                            const cmyk = [
                              ...(doc.palette.baseCMYK ??
                                rgbToCMYK(hexRGB(doc.palette.freeColors[0]))),
                            ] as Vec4;
                            cmyk[i] = value / 100;
                            const hex =
                              "#" +
                              cmykToRGB(cmyk)
                                .map((v) =>
                                  Math.round(clamp(v) * 255)
                                    .toString(16)
                                    .padStart(2, "0"),
                                )
                                .join("");
                            changePalette({
                              baseCMYK: cmyk,
                              freeColors: deriveFreeColors(hex),
                            });
                          }}
                        />
                      ))}
                    </details>
                    <label className="field">
                      Profil ciblé
                      <select
                        aria-label="Profil de recette"
                        value={doc.palette.profile}
                        onChange={(e) =>
                          changePalette({
                            profile: e.target
                              .value as PaletteSettings["profile"],
                          })
                        }
                      >
                        {Object.entries(profileNames).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="derived-colors">
                      {["Base", "Motif A", "Motif B"].map((label, i) => (
                        <div key={label} title={`${label} · couleur calculée`}>
                          <span
                            style={{
                              background: cssRGB(
                                previewRGB(doc.colors[i * 16 + 8]),
                              ),
                            }}
                          />
                          <small>{label}</small>
                        </div>
                      ))}
                    </div>
                    {doc.palette.baseCMYK &&
                      doc.palette.baseCMYK.reduce((sum, v) => sum + v, 0) >
                        2.6 && (
                        <p className="help has-error">
                          Encrage supérieur à 260 %, au-delà de la limite prévue
                          par ce profil. Les valeurs choisies sont conservées ;
                          réduisez-les pour ce procédé.
                        </p>
                      )}
                    {Math.max(
                      ...doc.colors[8].xyz.map((v, i) =>
                        Math.abs(v - doc.colors[24].xyz[i]),
                      ),
                    ) < 0.01 &&
                      doc.palette.effect !== "accessible" && (
                        <p className="help">
                          Cette base laisse peu de séparation possible pour ce
                          profil. Essayez une base moins sombre, moins claire ou
                          moins saturée.
                        </p>
                      )}
                    <p className="help">
                      Les couleurs des motifs sont calculées selon la Base,
                      l’effet et le profil ciblé. Valeurs CMJN FOGRA39 ; l’écran
                      affiche leur aperçu sRGB.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="help effect-description">
                      {effectDescriptions[doc.palette.effect]}
                    </p>
                    <label className="field">
                      Profil ciblé
                      <select
                        aria-label="Profil de recette"
                        value={doc.palette.profile}
                        onChange={(e) =>
                          changePalette({
                            profile: e.target
                              .value as PaletteSettings["profile"],
                          })
                        }
                      >
                        {Object.entries(profileNames).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Slider
                      label="Séparation chromatique"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={doc.palette.strength}
                      onChange={(strength) => changePalette({ strength })}
                    />
                    <div className="recipe-note">
                      <Info size={16} />
                      <p>
                        {experimental
                          ? "Recette expérimentale : la lecture cachée ou transformante doit être vérifiée avec des observateurs."
                          : "Les couleurs sont construites selon le modèle. L’effet réel dépend aussi des personnes et des conditions de présentation."}
                      </p>
                    </div>
                  </>
                )}
                <div className="divider" />
                <Slider
                  label="Bruit de luminance"
                  min={0}
                  max={1}
                  step={0.05}
                  value={doc.palette.noise}
                  onChange={(noise) => changePalette({ noise })}
                />
                <div className="swatch-strip">
                  {doc.colors
                    .filter((_, i) => i % 4 === 0)
                    .map((c, i) => (
                      <span
                        key={i}
                        style={{ background: cssRGB(previewRGB(c)) }}
                      />
                    ))}
                </div>
                <label className="background-field">
                  Couleur du support
                  <input
                    type="color"
                    value={doc.background}
                    aria-label="Couleur du support"
                    onChange={(e) =>
                      mutate((d) => ({
                        ...d,
                        background: e.target.value,
                        print: d.print
                          ? {
                              ...d.print,
                              background: rgbToCMYK(hexRGB(e.target.value)),
                            }
                          : undefined,
                      }))
                    }
                  />
                </label>
              </>
            )}
          </div>
          <div className="settings-help">
            <button
              className="help-button"
              aria-label="Aide et informations"
              title="Aide et informations"
              onClick={() => setAboutOpen(true)}
            >
              ?
            </button>
          </div>
        </aside>
        <main className="main-work">
          <div
            className="canvas-tools"
            role="toolbar"
            aria-label="Outils de l’illustration"
          >
            <button
              className="icon-button"
              aria-label={
                mobileSettings
                  ? "Masquer les réglages"
                  : "Afficher les réglages"
              }
              aria-expanded={mobileSettings}
              aria-controls="settings-panel"
              title="Panneau de composition"
              onClick={() => setMobileSettings((v) => !v)}
            >
              <PanelLeft size={18} />
            </button>
            <div className="tool-group">
              <button
                className="icon-button"
                aria-label="Annuler la modification"
                title="Annuler"
                disabled={!history.current.length}
                onClick={undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Rétablir la modification"
                title="Rétablir"
                disabled={!future.current.length}
                onClick={redo}
              >
                <Redo2 size={18} />
              </button>
            </div>
            {panel === "motif" && (
              <div className="segmented conception-toggle">
                <button
                  aria-label="Conception"
                  title="Conception"
                  aria-pressed={outline}
                  className={outline ? "selected" : ""}
                  onClick={() => setOutline(true)}
                >
                  <Layers size={16} />
                </button>
                <button
                  aria-label="Résultat"
                  title="Résultat"
                  aria-pressed={!outline}
                  className={!outline ? "selected" : ""}
                  onClick={() => setOutline(false)}
                >
                  <Eye size={16} />
                </button>
              </div>
            )}
            <div className="zoom-controls">
              <button
                className="icon-button"
                aria-label="Réduire le zoom"
                onClick={() => setZoom((v) => Math.max(0.5, v - 0.1))}
              >
                <ZoomOut size={16} />
              </button>
              <button
                className="zoom-label"
                aria-label="Ajuster à la fenêtre"
                title="Ajuster à la fenêtre"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                {Math.round(zoom * 100)} %
              </button>
              <button
                className="icon-button"
                aria-label="Augmenter le zoom"
                onClick={() => setZoom((v) => Math.min(6, v + 0.1))}
              >
                <ZoomIn size={16} />
              </button>
            </div>
            <button
              className={`icon-button ${panMode ? "active" : ""}`}
              aria-label="Panoter la vue"
              title="Déplacer la vue"
              aria-pressed={panMode}
              onClick={() => setPanMode((v) => !v)}
            >
              <Hand size={18} />
            </button>
            <button
              className="icon-button right-toggle"
              aria-label={
                rightPanel
                  ? "Masquer les simulations"
                  : "Afficher les simulations"
              }
              aria-expanded={rightPanel}
              aria-controls="inspection-panel"
              title="Panneau de simulation"
              onClick={() => setRightPanel((v) => !v)}
            >
              <PanelRight size={18} />
            </button>
          </div>
          <div
            className={`artboard-area ${panMode ? "pan-mode" : ""}`}
            ref={areaRef}
            onPointerDownCapture={(e) => {
              if (e.pointerType === "touch")
                touches.current.set(e.pointerId, {
                  x: e.clientX,
                  y: e.clientY,
                });
              if (touches.current.size >= 2) {
                const [a, b] = [...touches.current.values()];
                pinch.current = {
                  distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
                  x: (a.x + b.x) / 2,
                  y: (a.y + b.y) / 2,
                  zoom,
                  panX: pan.x,
                  panY: pan.y,
                };
                for (const id of touches.current.keys())
                  e.currentTarget.setPointerCapture(id);
                setNavigationGesture(true);
                panGesture.current = null;
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              if (
                !panMode &&
                !(
                  e.pointerType === "touch" &&
                  (panel !== "motif" || !outline || view !== "original")
                )
              )
                return;
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              panGesture.current = {
                x: e.clientX,
                y: e.clientY,
                ox: pan.x,
                oy: pan.y,
              };
            }}
            onPointerMoveCapture={(e) => {
              if (touches.current.has(e.pointerId))
                touches.current.set(e.pointerId, {
                  x: e.clientX,
                  y: e.clientY,
                });
              const gesture = pinch.current;
              if (gesture) {
                e.preventDefault();
                e.stopPropagation();
                if (touches.current.size >= 2) {
                  const [a, b] = [...touches.current.values()];
                  const ratio =
                    Math.min(
                      6,
                      Math.max(
                        0.5,
                        (gesture.zoom * Math.hypot(b.x - a.x, b.y - a.y)) /
                          gesture.distance,
                      ),
                    ) / gesture.zoom;
                  const bounds = e.currentTarget.getBoundingClientRect();
                  const cx = bounds.x + bounds.width / 2,
                    cy = bounds.y + bounds.height / 2;
                  setZoom(gesture.zoom * ratio);
                  setPan({
                    x:
                      (a.x + b.x) / 2 -
                      cx -
                      (gesture.x - cx - gesture.panX) * ratio,
                    y:
                      (a.y + b.y) / 2 -
                      cy -
                      (gesture.y - cy - gesture.panY) * ratio,
                  });
                }
                return;
              }
              const g = panGesture.current;
              if (g) {
                e.stopPropagation();
                setPan({
                  x: g.ox + e.clientX - g.x,
                  y: g.oy + e.clientY - g.y,
                });
              }
            }}
            onPointerUpCapture={(e) => {
              touches.current.delete(e.pointerId);
              if (pinch.current) {
                e.stopPropagation();
                if (!touches.current.size) {
                  pinch.current = null;
                  setNavigationGesture(false);
                }
              }
              panGesture.current = null;
            }}
            onPointerCancelCapture={(e) => {
              touches.current.delete(e.pointerId);
              panGesture.current = null;
              if (!touches.current.size) {
                pinch.current = null;
                setNavigationGesture(false);
              }
            }}
          >
            <div
              className="artboard"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                width:
                  Math.max(
                    1,
                    Math.min(
                      areaSize.width - 24,
                      ((areaSize.height - 24) * doc.geometry.width) /
                        doc.geometry.height,
                    ),
                  ) * zoom,
                aspectRatio: `${doc.geometry.width}/${doc.geometry.height}`,
              }}
            >
              <Plate
                doc={cooked}
                view={view}
                model={effectiveModel}
                severity={severity}
                proofColors={proof?.colors}
                proofBackground={proof?.background}
                active={active}
                tool={tool}
                outline={
                  outline &&
                  panel === "motif" &&
                  view === "original" &&
                  !navigationGesture
                }
                interactive
                zoom={zoom}
                onTransform={(x, y) => changeMotif({ x, y })}
                onDraw={(path) => {
                  const strokes = [
                    ...(selectedMotif.strokes ??
                      (selectedMotif.path
                        ? [
                            {
                              path: selectedMotif.path,
                              width: selectedMotif.strokeWidth,
                              erase: false,
                            },
                          ]
                        : [])),
                    {
                      path,
                      width: selectedMotif.strokeWidth,
                      erase: tool === "erase",
                    },
                  ];
                  if (
                    strokes.length > 1000 ||
                    strokes.reduce((sum, s) => sum + s.path.length, 0) > 400000
                  ) {
                    setError(
                      "Le dessin est trop complexe. Simplifiez-le ou effacez des traits.",
                    );
                    return;
                  }
                  changeMotif(
                    centerDrawing({ ...selectedMotif, kind: "draw", strokes }),
                  );
                }}
              />
            </div>
            {(generating || !font) && (
              <div className="generation-status">
                <LoaderCircle size={17} className="spin" />
                {font
                  ? `Placement des bulles… ${progress}`
                  : "Chargement de la police…"}
                {generating && (
                  <button
                    onClick={() => {
                      if (generationTimer.current)
                        clearTimeout(generationTimer.current);
                      worker.current?.terminate();
                      worker.current = null;
                      const last = completedGeometry.current;
                      if (last.disks.length) {
                        preserveGeometry.current = JSON.stringify(
                          last.geometry,
                        );
                        setDoc((d) => ({
                          ...d,
                          geometry: last.geometry,
                          disks: last.disks,
                        }));
                        setCancelled(false);
                      } else {
                        setDoc((d) => ({ ...d, disks: [] }));
                        setCancelled(true);
                      }
                      setGenerating(false);
                    }}
                  >
                    Interrompre
                  </button>
                )}
              </div>
            )}
            {cancelled && (
              <div className="generation-status">
                Génération interrompue
                <button
                  onClick={() => {
                    preserveGeometry.current = null;
                    setCancelled(false);
                    setGenerationNonce((v) => v + 1);
                  }}
                >
                  Reprendre
                </button>
              </div>
            )}
          </div>
          <div className="canvas-footer">
            <span data-testid="disk-count">
              {cooked.disks.length.toLocaleString("fr-FR")} bulles
            </span>
            <span className="footer-hint">
              {panMode
                ? "Main · déplacer la vue"
                : panel === "format"
                  ? "Format · ajuster le support et les bulles"
                  : panel === "palette" || !outline
                    ? "Résultat"
                    : tool === "draw"
                      ? "Crayon · tracez sur la surface"
                      : tool === "erase"
                        ? "Gomme · effacez sur la surface"
                        : "Déplacer le centre du motif"}
            </span>
            <span
              className={`status-message ${error ? "has-error" : ""}`}
              role={error ? "alert" : "status"}
            >
              {error || notice}
              {error && (
                <button
                  aria-label="Fermer l’erreur"
                  onClick={() => setError("")}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          </div>
        </main>
        <aside
          id="inspection-panel"
          className="inspection"
          hidden={!rightPanel}
        >
          <div className="view-tabs inspection-views">
            <button
              aria-label="Afficher les couleurs du document"
              className={view === "original" ? "selected" : ""}
              title="Aperçu sRGB des couleurs CMJN du document"
              onClick={() => setView("original")}
            >
              Couleurs
            </button>
            <button
              className={view === "simulation" ? "selected" : ""}
              title="Approximation de la perception pour le profil choisi"
              onClick={() => {
                setView("simulation");
                setOutline(false);
              }}
            >
              Simulation
            </button>
            <button
              className={view === "gray" ? "selected" : ""}
              title="Niveaux de gris : vérifier les indices de clarté"
              onClick={() => {
                setView("gray");
                setOutline(false);
              }}
            >
              Luminance
            </button>
            {proof && (
              <button
                className={view === "proof" ? "selected" : ""}
                onClick={() => setView("proof")}
              >
                Épreuve
              </button>
            )}
          </div>
          <p className="help">
            Couleurs : aperçu du document. Simulation : perception estimée du
            profil choisi. Luminance : niveaux de gris pour examiner les indices
            de clarté.
          </p>
          <div className="inspection-heading">
            <Eye size={18} />
            <h2>Changer de regard</h2>
            <button
              className="icon-button"
              aria-label="Fermer les simulations"
              onClick={() => setRightPanel(false)}
            >
              <X size={17} />
            </button>
          </div>
          <p className="help">
            Explorez une approximation de la perception des couleurs.
          </p>
          <label className="field">
            Profil ciblé
            <select
              aria-label="Profil ciblé"
              value={doc.palette.profile}
              onChange={(e) =>
                changePalette({
                  profile: e.target.value as PaletteSettings["profile"],
                })
              }
            >
              {Object.entries(profileNames).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Modèle de simulation
            <select
              aria-label="Modèle de simulation"
              value={effectiveModel}
              onChange={(e) => setModel(e.target.value as typeof model)}
            >
              <option value="brettel">Brettel · dichromatie</option>
              <option
                value="machado"
                disabled={doc.palette.profile === "tritan"}
              >
                Machado · degré variable
              </option>
            </select>
          </label>
          {model === "machado" && (
            <Slider
              label="Degré du modèle"
              min={0}
              max={1}
              step={0.05}
              value={severity}
              onChange={setSeverity}
            />
          )}
          <button
            className="mini-preview"
            title="Approximation de la perception pour le profil choisi"
            onClick={() => {
              setView("simulation");
              setOutline(false);
            }}
            aria-label="Afficher la simulation"
          >
            <Plate
              doc={cooked}
              view="simulation"
              model={effectiveModel}
              severity={severity}
              active={active}
              tool="move"
            />
            <span>
              {profileNames[doc.palette.profile].split(" ·")[0]}
              <ArrowUpRight size={15} />
            </span>
          </button>
          <button
            className="mini-preview gray-preview"
            title="Niveaux de gris : vérifier les indices de clarté"
            onClick={() => {
              setView("gray");
              setOutline(false);
            }}
            aria-label="Afficher en niveaux de gris"
          >
            <Plate
              doc={cooked}
              view="gray"
              model={effectiveModel}
              severity={severity}
              active={active}
              tool="move"
            />
            <span>
              Niveaux de gris
              <ArrowUpRight size={15} />
            </span>
          </button>
          <div className="divider" />
          <h3>Repères de palette</h3>
          <dl className="metrics">
            <div>
              <dt>Écart de luminance Y</dt>
              <dd>{metrics.luminance.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Écart XYZ simulé</dt>
              <dd>{metrics.simulated.toFixed(3)}</dd>
            </div>
          </dl>
          <p className="help">
            Comparaison de deux couleurs centrales. Ces valeurs ne prédisent pas
            la lisibilité d’une planche.
          </p>
          {experimental && (
            <span className="experimental-tag">Effet expérimental</span>
          )}
          <div className="inspection-note">
            <Info size={16} />
            <p>
              Un outil de création et de pédagogie. Les simulations ne
              constituent pas un test de dépistage.
            </p>
          </div>
        </aside>
      </div>
      {exportOpen && (
        <div className="modal-backdrop" onClick={() => setExportOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2 id="export-title">Emporter votre illustration</h2>
                <p>Conservez les formes et l’intention des couleurs.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Fermer les exports"
                onClick={() => setExportOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="export-row">
              <div>
                <h3>Projet chromablind</h3>
                <p>
                  Le même fichier JSON que le bouton Sauvegarder : paramètres,
                  motifs, bulles et couleurs CMJN.
                </p>
              </div>
              <button className="secondary" onClick={save} disabled={busy}>
                <Save size={16} />
                Sauvegarder le projet
              </button>
            </div>
            <div className="export-row">
              <div>
                <h3>SVG vectoriel</h3>
                <p>Disques éditables, dimensions en mm, couleurs sRGB.</p>
              </div>
              <button className="secondary" onClick={svg} disabled={busy}>
                <Download size={16} />
                Exporter en SVG
              </button>
            </div>
            <div className="divider" />
            <h3>PDF CMJN</h3>
            <p className="help">
              FOGRA39 par défaut. Le PDF conserve les composantes CMJN du projet
              et intègre leur profil.
            </p>
            <p className="help">
              Le document sera transmis au service d’export pour cette
              opération, sans conservation durable.
            </p>
            <details className="advanced-export">
              <summary>Options avancées d’impression</summary>
              <label className="field">
                Profil du catalogue
                <select
                  value={profileId}
                  aria-label="Profil du catalogue"
                  onChange={(e) => {
                    proofRequest.current++;
                    setProfileId(e.target.value);
                    setProfileFile(undefined);
                    setProof(undefined);
                  }}
                >
                  <option value="">Choisir explicitement un profil…</option>
                  {profiles.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {profiles.find((p) => p.id === profileId) && (
                <p className="help">
                  {profiles.find((p) => p.id === profileId)?.description}
                </p>
              )}
              <label className="icc-upload">
                Ou importer le profil de l’imprimeur
                <input
                  type="file"
                  accept=".icc,.icm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 5_000_000) {
                      setError("Profil limité à 5 Mo.");
                      return;
                    }
                    proofRequest.current++;
                    setProfileFile(f);
                    setProfileId("");
                    setProof(undefined);
                  }}
                />
                {profileFile && <span>{profileFile.name}</span>}
              </label>
            </details>
            {(error || notice) && (
              <p
                className={`help ${error ? "has-error" : ""}`}
                aria-live="polite"
              >
                {error || notice}
              </p>
            )}
            {!exportServiceAvailable && (
              <p className="help">
                Sur GitHub Pages, les projets et SVG sont disponibles. Le PDF
                CMJN et l’épreuvage nécessitent le service d’export du
                déploiement complet.
              </p>
            )}
            <div className="export-buttons">
              <button
                className="secondary"
                disabled={
                  !exportServiceAvailable ||
                  busy ||
                  exportBusy ||
                  (!profileId && !profileFile)
                }
                onClick={() => requestExport("proof")}
              >
                {exportBusy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Eye size={16} />
                )}
                Épreuver
              </button>
              <button
                className="primary"
                disabled={
                  !exportServiceAvailable ||
                  busy ||
                  exportBusy ||
                  (!profileId && !profileFile)
                }
                onClick={() => requestExport("pdf")}
              >
                <Download size={16} />
                Exporter le PDF CMJN
              </button>
            </div>

            {proof && (
              <div className="proof-report">
                <h3>{proof.profile}</h3>
                <p>
                  Écart maximal ΔE76 : {Math.max(...proof.deltaE).toFixed(1)}
                </p>
                <p>
                  {proof.outOfGamut.filter(Boolean).length} couleurs avec
                  altération notable (heuristique ΔE76 &gt; 3).
                </p>
                {proofMetrics && (
                  <p>
                    Après conversion : écart Y{" "}
                    {proofMetrics.luminance.toFixed(3)}, écart XYZ simulé{" "}
                    {proofMetrics.simulated.toFixed(3)} (hors simulation du
                    papier).
                  </p>
                )}
                {proof.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {aboutOpen && (
        <div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
          <section
            className="modal scientific"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="about-title">Aide · chromablind</h2>
              <button
                className="icon-button"
                aria-label="Fermer la méthode"
                onClick={() => setAboutOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <HelpContent />
          </section>
        </div>
      )}
    </div>
  );
}
