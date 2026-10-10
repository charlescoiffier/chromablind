import { useRef, useState } from "react";
import { version } from "../../package.json";
const tabs = ["Comprendre les modèles", "Méthode et limites", "Infos"];
export function HelpContent() {
  const [tab, setTab] = useState(0),
    refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      <nav role="tablist" aria-label="Aide chromablind" className="help-tabs">
        {tabs.map((label, i) => (
          <button
            key={label}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`help-tab-${i}`}
            role="tab"
            aria-selected={tab === i}
            aria-controls={`help-panel-${i}`}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => setTab(i)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowRight"
                  ? (i + 1) % 3
                  : e.key === "ArrowLeft"
                    ? (i + 2) % 3
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 2
                        : null;
              if (next !== null) {
                e.preventDefault();
                setTab(next);
                refs.current[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div
        className="help-content"
        role="tabpanel"
        id={`help-panel-${tab}`}
        aria-labelledby={`help-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 0 && (
          <>
            <h3>Des couleurs qui peuvent se confondre</h3>
            <p>
              Les illustrations pseudo-isochromatiques utilisent des bulles
              colorées pour former un motif. Leur géométrie reste indépendante
              du motif, afin que leur disposition ne révèle pas son contour.
            </p>
            <h3>Trois regards sur votre création</h3>
            <p>
              <strong>Couleurs</strong> affiche l’aperçu sRGB des couleurs CMJN
              du document. <strong>Simulation</strong> applique le profil de
              vision choisi à droite : c’est une approximation de la perception
              d’une autre personne, pas votre propre perception automatiquement
              détectée. <strong>Luminance</strong> affiche les niveaux de gris
              pour repérer les indices de clarté qui pourraient révéler un motif
              censé s’effacer.
            </p>
            <h3>Les effets proposés</h3>
            <p>
              <strong>Lecture commune</strong> sépare les clartés et conserve
              une teinte : il recherche une lecture robuste.{" "}
              <strong>Lecture standard</strong> sépare les couleurs selon un axe
              de confusion du profil ciblé. <strong>Lecture daltonienne</strong>{" "}
              ajoute un signal conservé à un bruit chromatique qui peut masquer
              le motif. <strong>Deux lectures</strong> compose un motif A qui
              tend à s’effacer et un motif B conservé dans la simulation. Les
              deux derniers effets sont expérimentaux ; les deux motifs peuvent
              aussi rester visibles simultanément.
            </p>
            <h3>Brettel et Machado</h3>
            <p>
              Brettel (1997) modélise les dichromaties protan, deutan et tritan
              par deux plans dans un espace LMS. Machado (2009) propose un degré
              variable pour protan et deutan. Le curseur décrit le modèle, pas
              une sévérité clinique ni une proportion de population.
            </p>
            <p>
              Protan concerne le système L, deutan le système M et tritan le
              système S. Les noms décrivent des familles de vision des couleurs
              et ne donnent pas un diagnostic.
            </p>
            <h3>Base personnalisée et gestes tactiles</h3>
            <p>
              En Création libre, choisissez la base CMJN et le profil ciblé :
              les couleurs A et B sont calculées selon l’effet. Une base extrême
              peut ne pas laisser assez de marge pour cet effet. Les modèles ne
              garantissent pas une visibilité exclusive pour un groupe de
              personnes.
            </p>
            <p>
              À deux doigts, pincez pour zoomer et déplacez pour panoter. En
              Résultat ou dans Format, un doigt déplace la vue. En Conception,
              un doigt dessine ou déplace le motif ; la main permet de déplacer
              la vue.
            </p>
            <h3>Gamut et paramètres</h3>
            <p>
              Le gamut est l’ensemble des couleurs représentables dans un espace
              ou par un procédé d’impression. La recette réserve maintenant la
              marge nécessaire à ses signaux et réduit la séparation si besoin,
              avant la conversion CMJN. Les couleurs imprimables peuvent encore
              modifier l’effet : comparez la simulation et une épreuve physique.
            </p>
            <p>
              <a
                href="https://vision.psychol.cam.ac.uk/jdmollon/papers/Dichromat_simulation.pdf"
                target="_blank"
                rel="noreferrer"
              >
                Brettel, Viénot et Mollon, 1997
              </a>{" "}
              ·{" "}
              <a
                href="https://profs.ic.uff.br/~laffernandes/content/publications/journal/2009_tvcg_15(6)/machado_oliveira_fernandes-tvcg-15(6)-2009-corrected.pdf"
                target="_blank"
                rel="noreferrer"
              >
                Machado, Oliveira et Fernandes, 2009
              </a>
            </p>
          </>
        )}
        {tab === 1 && (
          <>
            <h3>Création, pédagogie et expérimentations</h3>
            <p>
              chromablind n’est pas un outil de dépistage. Les modèles et
              indicateurs ne garantissent pas la lisibilité humaine. Les
              recettes doivent être qualifiées avec des observateurs aux profils
              documentés, dans des conditions de lumière, de distance et de
              présentation contrôlées.
            </p>
            <h3>Du CMJN à l’écran</h3>
            <p>
              Les composantes CMJN maître sont associées au profil Coated
              Fogra39L VIGC 260 (papier couché, encrage maximal 260 %). Une
              valeur CMJN ne décrit pas une couleur universelle : son apparence
              dépend du profil et du support. Les calculs perceptifs utilisent
              XYZ/LMS. L’aperçu sRGB du navigateur utilise des tables LittleCMS
              interpolées et reste approximatif ; le PDF conserve les
              composantes CMJN exactes et intègre le profil ICC.
            </p>
            <p>
              Les options avancées permettent un autre profil d’impression ; les
              composantes sont alors reconverties. Le SVG reste en sRGB pour
              être lisible dans les navigateurs et conserve les CMJN dans ses
              métadonnées. Pour une livraison CMJN, utilisez le PDF.
            </p>
            <h3>Épreuves et conformité</h3>
            <p>
              La calibration de l’écran, le papier, les encres et l’éclairage
              influencent le résultat. Une épreuve physique reste nécessaire. La
              conformité PDF/X n’est pas revendiquée sans validation de
              prépresse indépendante.
            </p>
            <h3>Données et sauvegarde</h3>
            <p>
              L’édition et la sauvegarde automatique se font sur cet appareil.
              Le bouton Sauvegarder et la première option des exports
              téléchargent le même projet JSON réouvrable. Le PDF et l’épreuve
              avancée transmettent le projet au service de conversion, qui le
              traite en mémoire sans conservation durable.
            </p>
            <p>
              Les contenus actifs des SVG sont supprimés. Les masques, textes
              non vectorisés et contours complexes doivent être convertis en
              surfaces avant import. Limite initiale : 20 000 bulles.
            </p>
            <p>
              <a
                href="https://www.color.org/faqs/"
                target="_blank"
                rel="noreferrer"
              >
                International Color Consortium : couleurs et profils
              </a>
            </p>
          </>
        )}
        {tab === 2 && (
          <>
            <h3>chromablind</h3>
            <p>
              Version <strong>{version}</strong>
            </p>
            <p>
              Un atelier d’illustrations à bulles inspirées des planches
              d’Ishihara, pour créer et explorer la perception des couleurs.
            </p>
            <p>
              React · TypeScript · Canvas · opentype.js · LittleCMS · FastAPI ·
              pydyf.
            </p>
            <p>
              <a
                href="https://github.com/charlescoiffier/chromablind"
                target="_blank"
                rel="noreferrer"
              >
                Code source et documentation sur GitHub
              </a>
            </p>
            <p>
              <a
                href="/THIRD_PARTY_NOTICES.txt"
                target="_blank"
                rel="noreferrer"
              >
                Licences des polices, modèles et profils
              </a>
            </p>
            <p>
              Les essais logiciels valident la géométrie, les conversions, la
              sérialisation et les interactions automatisées. Les essais avec
              observateurs, l’iPad physique et la validation PDF/X restent
              distincts de ces contrôles.
            </p>
          </>
        )}
      </div>
    </>
  );
}
