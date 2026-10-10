# Modèles et recettes

## Références

- Brettel, Viénot et Mollon (1997), _Computerized simulation of color appearance for dichromats_. https://vision.psychol.cam.ac.uk/jdmollon/papers/Dichromat_simulation.pdf
- Machado, Oliveira et Fernandes (2009), _A physiologically-based model for simulation of color vision deficiency_. https://profs.ic.uff.br/~laffernandes/content/publications/journal/2009_tvcg_15(6)/machado_oliveira_fernandes-tvcg-15(6)-2009-corrected.pdf
- Regan, Reffin et Mollon (1994), _Luminance noise and the rapid determination of discrimination ellipses in colour deficiency_. https://vision.psychol.cam.ac.uk/jdmollon/papers/ReganReffinMollonCambridgeColourTest.pdf
- Implémentation de référence DaltonLens, MIT : https://github.com/DaltonLens/DaltonLens-Python ; version utilisée pour les coefficients et vecteurs de référence : 0.1.5.
- sRGB, XYZ et fonctions de transfert : https://www.w3.org/TR/css-color-4/
- Gestion ICC : https://www.littlecms.com/ ; API float64 définie par `lcms2.h`.

## Conventions

Depuis chromablind 0.2, le document conserve les encres CMJN maître et le SHA-256 de Coated Fogra39L VIGC 260. XYZ D65 est une référence perceptive dérivée du Lab PCS D50 du profil (LittleCMS, sans compensation de point noir), adaptée par Bradford. Les tables 17⁴ locales interpolent cette référence ; une validation d’export indépendante utilise directement les nombres CMJN sauvegardés. Les anciens documents XYZ sont migrés à l’ouverture.

La conception de recettes utilise sRGB linéaire et LMS avant leur séparation ICC en CMJN. La conversion d’impression peut rompre la confusion idéale : les indicateurs sont recalculés sur le document converti, sans promesse de lisibilité. Un travail de qualification perceptive reste nécessaire. L’aperçu portable utilise la table CMJN→sRGB relative avec compensation du point noir, de manière identique pour les bulles et le support. XYZ reste la référence native pour Y ; les simulations sont appliquées à l’aperçu écran. L’affichage seul écrête les résultats hors gamut ; les encres ne sont pas corrigées implicitement.

Les tables RGB→CMJN (33³), CMJN→RGB et CMJN→XYZ (17⁴), stockées en float32 et interpolées multilinéairement, sont des approximations documentées de conception/aperçu. Le test de table compare cent échantillons d’encrage ≤260 % à LittleCMS natif avec une tolérance maximale de 0,035 par canal sRGB encodé ; il ne constitue pas un étalonnage exhaustif. Le PDF n’utilise pas cette interpolation.

Brettel : sensibilités Smith–Pokorny, ancres 475/575 nm pour protan/deutan et 485/660 nm pour tritan, projection à deux plans. Le blanc sRGB remplace l’illuminant équiénergétique comme axe neutre : approximation documentée qui conserve les gris et réduit les sorties de gamut. Les matrices sont enregistrées avec leur précision numérique. Le code est vérifié contre les vecteurs indépendamment calculés par DaltonLens.

Machado : matrices publiées pour protan/deutan, interpolées entre les deux niveaux voisins. Aucun modèle de tritanopie Machado n’est proposé. Une simulation n’établit pas l’apparence subjective exacte de chaque observateur.

## Recettes du générateur, version 0.2

Ce sont des constructions proposées par l’application, pas des reproductions ni des validations de planches Ishihara originales.

| Effet                | Construction                                                                                 | Limite                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Motif contrasté | Familles colorées séparées en luminance, bruit commun réduit (modes libre et guidé)                                                 | Le contraste est un objectif, pas une garantie universelle                          |
| Motif qui s’efface        | Paires le long de l’axe LMS du système ciblé ; amplitude réduite pour rester dans sRGB       | Cible la dichromatie du modèle ; des anomalies partielles peuvent garder la lecture |
| Motif révélé par la simulation                | Bruit chromatique de fond le long de l’axe de confusion, petit signal conservé dans le motif | Masquage chez l’observateur standard à qualifier ; recette expérimentale            |
| Deux motifs, deux lectures       | Bit A : signal le long de l’axe de confusion ; bit B : signal conservé                       | Lecture sélective et interférence entre motifs à qualifier ; recette expérimentale  |

Chaque famille contient 16 variations. Le même niveau de variation est assigné indépendamment de la région, selon l’index stable du disque. Le bruit déplace les canaux linéaires selon la recette ; cela ne constitue pas une égalisation de luminosité perçue individuelle. La séparation peut modifier la luminance standard selon le profil ciblé. Les indicateurs Y et XYZ avertissent de cette différence ; des indices de luminance résiduels doivent être vérifiés par observation.

La géométrie est générée avant classification des centres des disques dans les régions. La classification au centre évite de couper les disques sur les contours. Pour les traits dessinés, le moteur classe les centres dans la région du trait à épaisseur donnée, avec extrémités et jonctions rondes.

## Écran et impression

L’aperçu sRGB ne garantit pas la calibration de l’écran. Les résultats dépendent de l’éclairage ambiant, du dispositif, de la taille et de l’observateur. L’impression dépend aussi des propriétés spectrales des pigments, du papier et de l’illuminant. ICC vise un observateur standard ; préserver une couleur ICC ne prouve pas le maintien d’une confusion daltonienne.

Le PDF conserve les composantes CMJN maître exactes pour le profil de référence, ou convertit la palette en double précision vers un autre profil de sortie, avec un espace ICCBased et un OutputIntent. Le softproof simule le papier. La restitution relative sert au contrôle des différences et des indicateurs perceptifs ; le blanc papier n’est pas utilisé comme faux bruit de luminance dans ces indicateurs.

Aucun pourcentage de lecteurs ni score de dépistage n’est affiché. Les motifs cachés/transformants sont signalés comme expérimentaux. Le tritan dépasse le périmètre rouge–vert des tests d’Ishihara classiques.


## Masques et positionnement

Le dessin conserve une suite ordonnée de coups de crayon et de gomme. Chaque coup possède sa propre largeur ; la gomme soustrait les coups précédents et un crayon ultérieur peut repeindre au même endroit. Le centre est mesuré sur le masque restant, avec extrémités rondes et largeurs de traits, à 8 pixels/mm au plus et dimension raster bornée à 2048 pixels. Les tracés sont ensuite translatés en sens inverse afin de conserver leurs positions dans le document. Cette mesure sert au positionnement seulement ; elle ne rasterise pas le motif sauvegardé.

## Profils d’impression

FOGRA39 est une référence explicite du document, pas une description universelle de toute imprimante. Le profil VIGC 260 fourni suppose un procédé sur papier couché et un encrage maximal de 260 %. Les saisies CMJN qui dépassent ce total sont conservées et signalées, sans normalisation silencieuse. Un autre profil choisi à l’export exige une reconversion des composantes et une nouvelle épreuve.


## Base personnalisée (interface 0.3)

La création libre calcule désormais les couleurs des motifs à partir de la base choisie et du profil ciblé. Le déplacement chromatique suit l’axe LMS manquant utilisé par la recette, borné par la marge disponible en sRGB linéaire. La base CMJN reste enregistrée ; la conversion des couleurs calculées et l’approximation des tables ICC peuvent modifier la confusion. Les constructions cachées utilisent un signal de clarté et des distracteurs chromatiques ; la composition double conserve ces distracteurs autour du motif B. Une couleur extrême peut annuler la séparation disponible. Ces recettes sont des intentions de conception, et ne permettent aucune garantie de visibilité exclusive pour les daltoniens ou les observateurs à vision standard.
