# Rapport d'état de l'art

| Fichier | Contenu |
| --- | --- |
| `etat_de_l_art.pdf` | Le rapport compilé : 12 pages, 9 tableaux, 3 figures et 29 références |
| `etat_de_l_art.tex` | Sa source LaTeX |
| `figures/` | Captures du prototype du sprint 1, insérées dans le rapport |

## Recompiler le PDF

Avec une distribution LaTeX (MiKTeX sous Windows, TeX Live sous Linux ou macOS), depuis ce dossier :

```bash
latexmk -pdf etat_de_l_art.tex
```

`latexmk` lance pdfLaTeX autant de fois que nécessaire pour la table des matières et les renvois. Sans `latexmk`, lancer deux fois `pdflatex etat_de_l_art.tex`.

MiKTeX installe à la volée les paquets manquants. Avec TeX Live, les paquets utilisés (`babel` en français, `lmodern`, `tikz`, `tcolorbox`, `booktabs`, `pifont`, `xurl`, `hyperref`, entre autres) font partie de l'installation complète (`scheme-full`).

`latexmk -c` supprime ensuite les fichiers intermédiaires ; ils sont de toute façon ignorés par Git.
