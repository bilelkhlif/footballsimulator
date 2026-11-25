# Inventaire des licences du serveur d'analyse (Python)

Généré le 25 novembre 2026 à partir des métadonnées des paquets installés dans l'environnement validé
(Python 3.11.9, PyTorch 2.14.1 + CUDA 12.6), installé selon `analysis/requirements.txt`. Les paquets ne sont
pas redistribués par le projet : chacun s'installe depuis PyPI ou l'index de PyTorch. `pip` et `setuptools`,
outils d'installation, sont omis.

Compatibilité avec l'AGPL-3.0, licence du serveur : les licences présentes (MIT, MIT-CMU, BSD-2-Clause,
BSD-3-Clause, 0BSD, ISC, Apache-2.0, PSF-2.0, MPL-2.0, Zlib, BSL-1.0, CC0-1.0) le sont ; les codecs FFmpeg
embarqués par `opencv-python` et `av` sont sous LGPL. Aucune licence
incompatible, propriétaire ou non commerciale n'a été trouvée. Ultralytics et ses deux paquets annexes sont
sous AGPL-3.0.

88 paquets, dont 15 dépendances directes.

| Paquet | Version | Licence déclarée | Dépendance |
| --- | --- | --- | --- |
| annotated-doc | 0.0.7 | MIT | transitive |
| annotated-types | 0.8.0 | MIT | transitive |
| anyio | 4.16.0 | MIT | transitive |
| attrs | 26.1.0 | MIT | transitive |
| av | 18.1.1 | BSD-3-Clause | transitive |
| beautifulsoup4 | 4.15.0 | MIT License | transitive |
| certifi | 2026.11.20 | Mozilla Public License 2.0 (MPL 2.0) | transitive |
| charset-normalizer | 3.5.3 | MIT | transitive |
| click | 8.5.1 | BSD-3-Clause | transitive |
| cloudpickle | 3.1.3 | BSD-3-Clause | transitive |
| colorama | 0.4.6 | BSD License | transitive |
| contourpy | 1.3.3 | BSD License | transitive |
| cycler | 0.12.1 | BSD License | transitive |
| defusedxml | 0.7.1 | Python Software Foundation License | transitive |
| filelock | 4.3.1 | MIT | transitive |
| fonttools | 4.68.0 | MIT | transitive |
| fsspec | 2026.9.0 | BSD-3-Clause | transitive |
| gdown | 5.2.2 | MIT License | directe |
| h11 | 0.16.0 | MIT License | transitive |
| hf-xet | 1.8.0 | Apache-2.0 | transitive |
| httpcore | 1.0.9 | BSD-3-Clause | transitive |
| httpx | 0.28.1 | BSD License | transitive |
| huggingface_hub | 1.33.0 | Apache Software License | transitive |
| idna | 3.20 | BSD-3-Clause | transitive |
| jinja2 | 3.1.6 | BSD License | transitive |
| joblib | 1.6.0 | BSD-3-Clause | transitive |
| jsonargparse | 4.53.0 | MIT | transitive |
| jsonschema | 4.23.0 | MIT License | directe |
| jsonschema-specifications | 2025.9.1 | MIT | transitive |
| kiwisolver | 1.5.1 | BSD License | transitive |
| llvmlite | 0.50.0 | BSD-2-Clause, avec LLVM (Apache-2.0 WITH LLVM-exception) — fichiers LICENSE du paquet | transitive |
| markdown-it-py | 4.3.0 | MIT License | transitive |
| markupsafe | 3.0.4 | BSD-3-Clause | transitive |
| matplotlib | 3.11.2 | Python Software Foundation License | transitive |
| mdurl | 0.1.2 | MIT License | transitive |
| mpmath | 1.3.0 | BSD License | transitive |
| networkx | 3.6.1 | BSD-3-Clause | transitive |
| numba | 0.68.1 | BSD License | transitive |
| numpy | 2.4.6 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | directe |
| nvidia-ml-py | 13.615.71 | BSD License | transitive |
| opencv-python | 4.14.0.94 | Apache Software License | directe |
| packaging | 26.4 | Apache-2.0 OR BSD-2-Clause | transitive |
| pillow | 13.0.0 | MIT-CMU | transitive |
| platformdirs | 4.14.8 | MIT | transitive |
| polars | 2.2.0 | MIT License | transitive |
| polars-runtime-32 | 2.2.0 | MIT License | transitive |
| protobuf | 7.36.2 | 3-Clause BSD License | transitive |
| psutil | 7.2.2 | BSD-3-Clause | transitive |
| pydantic | 2.14.4 | MIT | transitive |
| pydantic_core | 2.50.5 | MIT | transitive |
| pydeprecate | 0.14.0 | Apache-2.0 | transitive |
| pygments | 2.21.0 | BSD-2-Clause | transitive |
| pynndescent | 0.7.0 | BSD-2-Clause | transitive |
| pyparsing | 3.3.3 | MIT | transitive |
| pysocks | 1.7.1 | BSD | transitive |
| python-dateutil | 4.0.0 | BSD-3-Clause | transitive |
| pyyaml | 6.0.4 | MIT License | transitive |
| referencing | 0.37.0 | MIT | transitive |
| regex | 2026.11.24 | Apache-2.0 AND CNRI-Python | transitive |
| requests | 2.34.2 | Apache Software License | transitive |
| rich | 15.0.0 | MIT License | transitive |
| rpds-py | 2026.9.1 | MIT | transitive |
| safetensors | 0.8.0 | Apache Software License | transitive |
| scenedetect | 0.7.3 | BSD-3-Clause | directe |
| scikit-learn | 1.6.1 | BSD License | directe |
| scipy | 1.17.1 | BSD License | transitive |
| sentencepiece | 0.2.3 | Apache-2.0 | directe |
| shellingham | 1.5.4 | ISC License (ISCL) | transitive |
| soupsieve | 4.1.3 | MIT | transitive |
| sports | 0.1.0 | MIT License | directe |
| supervision | 0.31.7 | MIT | directe |
| sympy | 1.14.0 | BSD License | transitive |
| threadpoolctl | 3.8.0 | BSD-3-Clause | transitive |
| tokenizers | 0.22.2 | Apache Software License | transitive |
| torch | 2.14.1+cu126 | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT | directe |
| torchvision | 0.29.1+cu126 | BSD | directe |
| tqdm | 4.70.1 | MPL-2.0 AND MIT | transitive |
| trackers | 2.7.0 | Apache Software License | directe |
| transformers | 5.13.0 | Apache 2.0 License | directe |
| typer | 0.29.2 | MIT | transitive |
| typing-inspection | 0.4.5 | MIT | transitive |
| typing_extensions | 4.16.0 | PSF-2.0 | transitive |
| tzdata | 2026.6 | Apache-2.0 | transitive |
| ultralytics | 8.4.215 | GNU Affero General Public License v3 or later (AGPLv3+) | directe |
| ultralytics-platform | 0.1.121 | AGPL-3.0-only | transitive |
| ultralytics-thop | 2.2.5 | GNU Affero General Public License v3 or later (AGPLv3+) | transitive |
| umap-learn | 0.6.0 | BSD-3-Clause (fichier LICENSE du paquet) | directe |
| urllib3 | 2.8.0 | MIT | transitive |
