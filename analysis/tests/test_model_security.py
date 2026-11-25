"""Intégrité avant désérialisation et refus du chargeur vulnérable.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

from football_analysis import models
from football_analysis.pipeline import AnalysisOptions, _load_models


class ModelSecurityTest(unittest.TestCase):
    """Les octets refusés n'atteignent aucun chargeur de checkpoint.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — chaîne de confiance des modèles
    """

    def test_resume_signature_changes_with_the_team_model_revision(self):
        """Une reprise ne mélange pas deux versions des plongements sous le même nom de modèle.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — identité des modèles lors d'une reprise
        """
        from football_analysis.incremental_pipeline import analysis_signature
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "video.mp4"
            video.write_bytes(b"signature fixture")
            options = AnalysisOptions(models_dir=Path(directory))
            before = analysis_signature(video, options)
            with patch.dict(models.MODEL_LOCK["backbones"]["siglip"], {"revision": "0" * 40, "sha256": "f" * 64}):
                after = analysis_signature(video, options)
            self.assertNotEqual(before, after)
            self.assertNotEqual(before["teamWeights"], after["teamWeights"])

    def test_digest_is_checked_not_only_size(self):
        """Une modification de même taille échoue, une entrée approuvée passe.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — empreintes des poids
        """
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pt"
            path.write_bytes(b"approved")
            expected = {"bytes": 8, "sha256": hashlib.sha256(b"approved").hexdigest()}
            self.assertEqual(models.verify_file(path, expected), expected["sha256"])
            path.write_bytes(b"modified")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                models.verify_file(path, expected)

    def test_corrupt_checkpoint_is_refused_before_yolo(self):
        """Un checkpoint local non approuvé ne déclenche même pas l'import d'Ultralytics.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — ordre des contrôles de modèle
        """
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / models.MODEL_FILES["players"][0]).write_bytes(b"not a checkpoint")
            fake = Mock()
            with patch.dict("sys.modules", {"ultralytics": fake}):
                with self.assertRaises(ValueError):
                    _load_models(AnalysisOptions(models_dir=Path(directory)), "cpu")
            fake.YOLO.assert_not_called()

    def test_vulnerable_and_unstable_torch_are_refused(self):
        """Le plancher de l'avis est refusé, les versions stables corrigées sont reconnues.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — garde de version de PyTorch
        """
        # 2.6.0 à 2.9.1 : GHSA-63cw-57p8-fm3p, exécution de code même avec weights_only=True.
        for installed in ("2.5.1+cu121", "2.4.0", "2.6.0", "2.9.1+cu126", "2.14.0rc1"):
            with patch.object(models, "version", return_value=installed), self.assertRaises(RuntimeError):
                models.require_secure_torch()
        for installed in ("2.10.0", "2.14.1+cu126", "2.15.0+cu132"):
            with patch.object(models, "version", return_value=installed):
                self.assertEqual(models.require_secure_torch(), installed)

    def test_malicious_pickle_is_refused_by_the_project_loader(self):
        """Un checkpoint dont le dépickling exécute du code est refusé, sans exécution, par le chargeur réel.

        Le contrôle sans garde-fous exécute bien la charge utile : le test prouve donc le refus. Chaque
        chargement tourne dans un processus neuf, comme le serveur, avec l'environnement de models.py.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — chargement restreint des checkpoints
        """
        import os
        import subprocess
        import sys

        import torch

        class Payload:
            """Écrit un fichier témoin si un chargeur exécute le pickle.

            @responsable Bilel Khlif
            @date 2026-11-25
            @role Tests — checkpoint malveillant
            """

            def __init__(self, canary):
                """@responsable Bilel Khlif
                @date 2026-11-25
                @role Tests — checkpoint malveillant
                """
                self.canary = canary

            def __reduce__(self):
                """@responsable Bilel Khlif
                @date 2026-11-25
                @role Tests — checkpoint malveillant
                """
                return (exec, (f"open({str(self.canary)!r}, 'w').write('execute')",))

        analysis = Path(__file__).resolve().parents[1]
        environment = {key: value for key, value in os.environ.items()
                       if key not in ("TORCH_FORCE_WEIGHTS_ONLY_LOAD", "ULTRALYTICS_SAFE_LOAD")}
        with tempfile.TemporaryDirectory() as directory:
            checkpoint, canary = Path(directory) / "evil.pt", Path(directory) / "canary.txt"
            torch.save({"model": Payload(canary), "train_args": {}}, checkpoint)
            loader = ("import sys; import football_analysis.models; from ultralytics.nn.tasks import torch_safe_load\n"
                      "try:\n    torch_safe_load(sys.argv[1])\nexcept TypeError:\n    sys.exit(3)\n")
            result = subprocess.run([sys.executable, "-c", loader, str(checkpoint)], cwd=analysis, env=environment,
                                    capture_output=True, text=True, timeout=180)
            self.assertEqual(result.returncode, 3, result.stderr[-800:])
            self.assertFalse(canary.exists(), "le chargeur du projet a exécuté le checkpoint")
            control = "import sys, torch; torch.load(sys.argv[1], weights_only=False)"
            subprocess.run([sys.executable, "-c", control, str(checkpoint)], env=environment, capture_output=True, timeout=180)
            self.assertTrue(canary.exists(), "contrôle : la charge utile doit être active sans garde-fous")

    def test_unsupported_restricted_mode_stops_the_analysis(self):
        """Si Ultralytics ne peut pas restreindre le chargement, l'analyse s'arrête au lieu de se replier.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — garde du chargeur restreint
        """
        with patch("football_analysis.pipeline.verified_models", return_value={}), \
                patch("football_analysis.pipeline.require_secure_torch"), \
                patch("ultralytics.nn.tasks._SafeLoad.SUPPORTED", False), patch("ultralytics.YOLO") as yolo:
            with self.assertRaisesRegex(RuntimeError, "Chargeur restreint"):
                _load_models(AnalysisOptions(), "cpu")
            yolo.assert_not_called()

    def test_linked_or_misplaced_weights_are_refused(self):
        """Un poids lié ou hors du dossier des modèles n'est jamais vérifié à la place de l'original.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — confinement des poids
        """
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pt"
            path.write_bytes(b"approved")
            expected = {"bytes": 8, "sha256": hashlib.sha256(b"approved").hexdigest()}
            with patch.object(Path, "is_symlink", return_value=True), self.assertRaisesRegex(ValueError, "lié"):
                models.verify_file(path, expected)
            with patch.object(models, "model_path", return_value=Path(directory).parent / "model.pt"), \
                    self.assertRaisesRegex(ValueError, "hors du dossier"):
                models.verified_models(Path(directory), ("players",))

    def test_models_command_reports_missing_or_altered_weights_without_traceback(self):
        """« models » sans téléchargement : code 1 et conseil lisible, pour un poids absent comme modifié.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — commande de vérification des modèles
        """
        import contextlib
        import io

        from football_analysis.__main__ import main

        with tempfile.TemporaryDirectory() as directory:
            for content in (None, b"modified"):
                if content is not None:
                    (Path(directory) / models.MODEL_FILES["players"][0]).write_bytes(content)
                # main() reconfigure la sortie en UTF-8 : il lui faut un vrai flux texte.
                errors = io.TextIOWrapper(io.BytesIO(), encoding="utf-8")
                with patch("football_analysis.__main__.MODELS_DIR", Path(directory)), contextlib.redirect_stderr(errors):
                    self.assertEqual(main(["models"]), 1)
                errors.flush()
                message = errors.buffer.getvalue().decode("utf-8")
                self.assertIn("Modèles non vérifiés", message)
                self.assertIn("--download", message)

    def test_failed_download_never_becomes_a_model(self):
        """Le téléchargement reste en quarantaine jusqu'à vérification de l'empreinte.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — promotion atomique des modèles
        """
        def download(**options):
            Path(options["output"]).write_bytes(b"modified")
            return options["output"]

        expected = {"bytes": 8, "sha256": hashlib.sha256(b"approved").hexdigest()}
        with tempfile.TemporaryDirectory() as directory, patch.object(models, "MODEL_FILES", {"players": ("model.pt", "id")}), \
                patch.dict(models.MODEL_LOCK, {"yolo": {"players": expected}}), patch("gdown.download", side_effect=download):
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                models.download_models(Path(directory))
            self.assertEqual(list(Path(directory).iterdir()), [])
