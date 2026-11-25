"""Tests de la documentation du code Python, selon la convention du dépôt
(docs/convention-de-documentation.md) : chaque fonction et chaque classe de premier niveau, et
chaque méthode, porte un en-tête avec @responsable, @date et @role ; chaque fichier renvoie à
ATTRIBUTION.md.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import ast
import re
import unittest
from pathlib import Path

#: Dossier analysis/ du dépôt.
ROOT = Path(__file__).resolve().parent.parent

#: Fichiers contrôlés : le paquet et ses tests.
FILES = sorted([*ROOT.glob("football_analysis/*.py"), *ROOT.glob("tests/*.py")])


def missing_tags(docstring):
    """Balises absentes ou invalides d'un en-tête.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — documentation du code
    """
    if not docstring:
        return ["docstring"]
    missing = []
    if not re.search(r"@responsable\s+\S", docstring):
        missing.append("@responsable")
    if not re.search(r"@date\s+\d{4}-\d{2}-\d{2}\b", docstring):
        missing.append("@date")
    if not re.search(r"@role\s+\S", docstring):
        missing.append("@role")
    return missing


def documented_nodes(tree):
    """Fonctions et classes de premier niveau, et méthodes des classes.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — documentation du code
    """
    kinds = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
    for node in tree.body:
        if isinstance(node, kinds):
            yield node
        if isinstance(node, ast.ClassDef):
            yield from (member for member in node.body if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)))


class DocumentationTest(unittest.TestCase):
    """Convention des en-têtes, appliquée au code Python.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — documentation du code
    """

    def test_every_function_has_a_header(self):
        """Chaque fonction, classe et méthode a son en-tête complet.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — documentation du code
        """
        problems = []
        for path in FILES:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in documented_nodes(tree):
                missing = missing_tags(ast.get_docstring(node))
                if missing:
                    problems.append(f"{path.relative_to(ROOT)}:{node.lineno} {node.name} : {', '.join(missing)}")
        self.assertEqual(problems, [])

    def test_every_file_refers_to_attribution(self):
        """Chaque fichier renvoie à ATTRIBUTION.md dans son en-tête.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — documentation du code
        """
        self.assertGreater(len(FILES), 10)
        missing = [str(p.relative_to(ROOT)) for p in FILES if "ATTRIBUTION.md" not in (ast.get_docstring(ast.parse(p.read_text(encoding="utf-8"))) or "")]
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
