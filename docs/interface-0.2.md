# chromablind — évolution de l’éditeur

Demande : une interface compacte où le dessin occupe toute la hauteur disponible, avec panneaux masquables, barre d’outils haute unique et notifications dans une fine bande basse. Les côtés défilent seuls. L’aide dispose de trois onglets et affiche la version.

Le diamètre et les dimensions rectangulaires se valident par Entrée ou perte de focus. Les paramètres proposés suivent l’échelle du support par rapport à 200 mm : 1,1 / 3,8 / 0,65 / 0,28 / 0,9. Le motif de travail est une surface translucide ; Conception / Résultat sépare édition et rendu. Le dessin conserve les coups de crayon et de gomme avec leurs épaisseurs, et les coordonnées de position désignent le centre de ses bounds.

Les effets seront expliqués et renommés : Motif contrasté, Motif qui s’efface, Motif révélé par la simulation (expérimental), Deux motifs, deux lectures (expérimental). La palette libre part d’une Base et dérive les familles. Le contraste doit fonctionner dans les deux modes sans rendre obligatoirement la palette achromatique. Les recettes avancées doivent réduire explicitement leur séparation plutôt que produire une erreur de gamut au réglage initial.

La chaîne CMJN doit conserver les composantes CMJN maître et le profil qui leur donne leur sens, produire l’aperçu sRGB à partir de ces composantes et les émettre directement dans le PDF. Le SVG conserve l’aperçu sRGB portable et les CMJN dans ses métadonnées : le CMJN n’est pas un rendu SVG portable entre navigateurs. Le passage perceptif LMS/XYZ reste nécessaire pour concevoir et vérifier les recettes. Le profil et l’intention de rendu restent documentés.

Vérification : tests des nouvelles recettes, des données CMJN, du centrage et de la gomme, puis parcours clavier/panneaux/aide/export dans les trois moteurs ; contrôle visuel du viewport et des exports. README inspiré de pi-piquant, badge relié à un vrai workflow sans inventer une URL publiée.
