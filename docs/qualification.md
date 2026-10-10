# Qualification et essais à poursuivre

## Vérification technique

Les suites exécutables vérifient les invariants géométriques, la limite 20 000, les références numériques, la sérialisation, les masques et les parcours de navigateur. La suite Python ouvre les PDF avec un lecteur indépendant (pypdf), vérifie dimensions, ICCBased, OutputIntent et commandes de courbes. Les profils réels FOGRA39/47 sont testés pour la conversion et l’épreuvage.

Dernière vérification locale : 20 tests du moteur et de la couleur, 10 tests du service et 55 parcours de navigateur validés (19 Chromium, 18 Firefox, 18 WebKit), dont un geste multi-touch injecté avec Chromium. Les deux variantes de ce test tactile sont explicitement non exécutées sous Firefox et WebKit, dont l’injection native multi-touch n’est pas disponible dans ce harnais. Compilation TypeScript et build de production réussis. Le PDF CMJN a également été ouvert avec Poppler et contrôlé visuellement après rendu.

Mesure indicative sur la machine de développement, navigateurs automatisés : import et affichage d’un projet de 20 000 disques en 182 ms sous Chromium, 585 ms sous Firefox et 125 ms sous WebKit au format tablette. Cette mesure ne caractérise pas les performances d’un iPad physique ni tous les paramètres de remplissage.

PDF/X-4 : non qualifié. Une vérification structurelle avec pypdf n’est pas une certification PDF/X. Avant de revendiquer cette conformité, utiliser un validateur de prépresse indépendant sur les exports RGB/CMYK, vérifier les métadonnées requises, les boîtes de page, espaces colorimétriques et profils, puis corriger et requalifier. Le générateur ne déclare pas de version GTS_PDFX dans les métadonnées.

Docker Compose : fichiers fournis ; moteur Docker et plugin Compose indisponibles dans l’environnement de qualification ; validation de déploiement requise sur un hôte disposant de Docker. Mise en ligne et HTTPS à configurer selon l’hébergement retenu.

## Essais perceptifs

1. Documenter la recette, le profil simulé, la graine, les deux motifs et toutes les couleurs maître/exportées.
2. Définir écran calibré, éclairage, distance, taille, durée d’exposition et consignes. Pour l’impression, définir papier, procédé, profil et illuminant d’observation, puis tirer une épreuve physique.
3. Recruter des observateurs dont la vision des couleurs est documentée indépendamment de l’application. Distinguer dichromatie et trichromatie anormale ; ne pas assimiler un curseur de modèle à une sévérité clinique.
4. Présenter les planches dans un ordre randomisé, avec contrôle en niveaux de gris et motifs témoins. Mesurer identification, temps et erreurs selon le groupe et les conditions.
5. Examiner la fuite d’information par luminance et géométrie, les chevauchements de motifs et les effets du bruit. Ne qualifier une recette que pour les conditions et profils effectivement étudiés.

Ces essais ne sont pas réalisés par les tests logiciels. Ils ne deviennent pas des études cliniques de dépistage sans un protocole et une validation adaptés.

## Ordinateur et tablette

Les tests WebKit avec profil iPad vérifient le moteur et le format tactile simulé. Une recette de test manuel reste à exécuter sur iPad physique : stylet, interruptions PointerCancel, passage portrait/paysage, clavier virtuel, sauvegarde iOS et fichiers ICC. Vérifier également Safari macOS avec un écran calibré.


## Livraison chromablind 0.2

La référence maître est CMJN FOGRA39. Les tests vérifient la conservation des quatre encres entre ouverture et sauvegarde, un cas hors gamut écran, l’identité des valeurs dans le PDF, et le rendu cohérent des bulles et du support. Les grilles locales sont comparées à LittleCMS natif ; leur interpolation est un aperçu approximatif documenté. La conversion native et les indicateurs ne remplacent pas une qualification perceptive.

Les nouveaux scénarios vérifient la saisie différée des dimensions, les paramètres proportionnels, les panneaux, l’absence de défilement central, l’aide à onglets, les polices, le crayon et la gomme, la largeur par coup de pinceau, le retour arrière entre projets de géométries différentes et la réouverture après rechargement de page.

Le workflow CI et son badge sont configurés dans le dépôt local. Aucun push ni exécution distante n’a été effectué dans cette session.
