import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.provider_discovery import optional_module_available


class ProviderDiscoveryTests(unittest.TestCase):
    def test_present_module(self):
        with patch("app.provider_discovery.importlib.util.find_spec", return_value=object()):
            self.assertTrue(optional_module_available("melo.api"))

    def test_missing_submodule(self):
        with patch("app.provider_discovery.importlib.util.find_spec", return_value=None):
            self.assertFalse(optional_module_available("melo.api"))

    def test_missing_parent(self):
        with patch(
            "app.provider_discovery.importlib.util.find_spec",
            side_effect=ModuleNotFoundError("No module named 'melo'", name="melo"),
        ):
            self.assertFalse(optional_module_available("melo.api"))

    def test_unrelated_import_failure_is_not_hidden(self):
        with patch(
            "app.provider_discovery.importlib.util.find_spec",
            side_effect=ModuleNotFoundError("No module named 'broken_dependency'", name="broken_dependency"),
        ):
            with self.assertRaises(ModuleNotFoundError):
                optional_module_available("melo.api")

    def test_unexpected_discovery_error_is_not_hidden(self):
        with patch("app.provider_discovery.importlib.util.find_spec", side_effect=RuntimeError("broken import")):
            with self.assertRaises(RuntimeError):
                optional_module_available("kokoro")
