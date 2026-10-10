# chromablind 0.3 — interface

Nouveau crée un document neuf sans texte, dessin ni SVG, avec le support de 200 mm et les paramètres recommandés. Une composition modifiée propose de télécharger le projet, de repartir sans sauvegarder ou d’annuler ; la sauvegarde automatique locale ne remplace pas ce téléchargement.

Les commandes de dessin sont dans Motif : déplacement, crayon, gomme, épaisseurs 2/5/10/20 mm et effacement. Le bouton de centrage utilise le centre du support. Les commandes Conception/Résultat apparaissent seulement dans Motif. La main déplace uniquement la vue ; ajuster à la fenêtre réinitialise zoom et déplacement. Deux doigts permettent le pincement et le déplacement tactile ; les brouillons texte et dessin sont conservés entre les onglets. Les infobulles apparaissent après 180 ms.

Le sélecteur de Base utilise les composantes CMJN FOGRA39. Les couleurs Base, Motif A et Motif B sont visibles ; les motifs sont calculés depuis la base et le profil ciblé, sans édition directe. Le contraste de Lecture commune est réduit. Lecture standard, Lecture daltonienne et Deux lectures décrivent des intentions perceptives ; les effets cachés et doubles restent expérimentaux, sans garantie de visibilité.

Couleurs, Simulation et Luminance sont dans le panneau de simulation avec leur explication. Le rappel technique des exports a été retiré de la modale ; les limites PDF/X restent documentées dans l’aide et le README.
