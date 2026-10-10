import { useEffect, useState } from "react";
const descriptions: Record<string, string> = {
  Texte: "Composer un motif typographique",
  Dessin: "Composer un dessin au crayon",
  SVG: "Importer un motif vectoriel",
  Format: "Régler le support et les bulles",
  Motif: "Composer et positionner les motifs",
  Couleurs: "Choisir la base et l’effet perceptif",
  Guidée: "Utiliser une recette de référence",
  "Création libre": "Calculer les motifs depuis votre base CMJN",
  Auto: "Adapter les bulles au support",
  "Nouvelle dispo": "Replacer les bulles avec une nouvelle graine",
  Simulation: "Estimer la perception du profil ciblé",
  Luminance: "Examiner les différences de clarté en gris",
};
export function QuickTooltip() {
  const [tip, setTip] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      setTip(null);
      if (current?.getAttribute("aria-describedby") === "quick-tooltip")
        current.removeAttribute("aria-describedby");
      current = null;
    };
    const show = (event: Event) => {
      const target = (event.target as Element)?.closest<HTMLElement>("button");
      if (!target || target === current) return;
      hide();
      current = target;
      const text = target.textContent?.trim() ?? "";
      const label =
        target.title ||
        target.dataset.tooltip ||
        descriptions[text] ||
        target.getAttribute("aria-label") ||
        text;
      if (!label) return;
      target.dataset.tooltip = label;
      target.removeAttribute("title");
      timer = setTimeout(() => {
        if (!target.isConnected) return;
        const b = target.getBoundingClientRect();
        target.setAttribute("aria-describedby", "quick-tooltip");
        setTip({
          label,
          x: Math.max(8, Math.min(window.innerWidth - 270, b.x)),
          y:
            b.bottom + 38 < window.innerHeight
              ? b.bottom + 6
              : Math.max(8, b.top - 38),
        });
      }, 180);
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerout", hide);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerout", hide);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  return tip ? (
    <div
      id="quick-tooltip"
      role="tooltip"
      className="quick-tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.label}
    </div>
  ) : null;
}
