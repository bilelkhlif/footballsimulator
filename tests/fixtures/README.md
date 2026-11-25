`synthetic-range.mp4` est une courte vidéo de test : 8 secondes, 160 × 90, H.264, 8 images/s, sans
son. Elle ne contient que des formes de football générées par ordinateur, sans image réelle ni poids
de modèle. Elle est tirée de la démonstration synthétique du visualiseur, au commit `84463ad`
(`demo/matches/match-synthetique/video.mp4`, générateur `football_analysis.demo_match`, graine 2026).

Reproduction depuis cette source synthétique, avec FFmpeg 8.0.1 :

```sh
ffmpeg -i video.mp4 -t 8 -vf scale=160:90,fps=8 -an -c:v libx264 -profile:v baseline -pix_fmt yuv420p -crf 32 -preset fast -g 8 -movflags +faststart synthetic-range.mp4
```

Le test de navigateur `tests/service-worker-media-tests.mjs` s'en sert avec de vraies réponses
HTTP 206, pour vérifier la lecture et les déplacements dans la vidéo sous le contrôle du Service
Worker de l'application. Ce fichier mesure la livraison de la vidéo, pas une précision d'analyse.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
