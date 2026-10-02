"""Pruebas del endpoint HTTP con el pipeline simulado (sin Ollama ni nube).

Ejecutar desde la raiz:  python -m unittest fastapi_backend.test_api
"""
import logging
import logging.handlers
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from fastapi_backend import logbus, main
from fastapi_backend.cache import ResponseCache
from fastapi_backend.config import Settings
from fastapi_backend.pipeline import PipelineResult
from fastapi_backend.providers import ProviderError
from fastapi_backend.ratelimit import RateLimiter

KEY = "clave-de-prueba"
HEADERS = {"x-api-key": KEY}
IMAGE = {"image": "data:image/jpeg;base64,QUJD"}


def _result() -> PipelineResult:
    return PipelineResult(
        description="[TEXTO] Hola.",
        elements=[{"type": "Texto", "content": "Hola.", "lang": "es"}],
        page={"tabla": False, "grafica": False, "diagrama": False, "imagen": False, "matematicas": False, "columnas": 1},
        provider="gemini",
        model="gemini-2.5-flash",
        detector="ollama",
        steps=[{"name": "extraccion", "engine": "gemini", "seconds": 1.2}],
    )


class DescribeImageEndpointTests(unittest.TestCase):
    def setUp(self):
        patches = [
            mock.patch.object(main, "API_KEY_SECRET", KEY),
            mock.patch.object(main, "image_cache", ResponseCache(8)),
            mock.patch.object(main, "rate_limiter", RateLimiter(3)),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.client = TestClient(main.app)

    def _post(self, pipeline_mock, body=IMAGE, headers=HEADERS):
        with mock.patch.object(main, "run_pipeline", pipeline_mock):
            return self.client.post("/api/describe-image", json=body, headers=headers)

    def test_requires_the_api_key(self):
        response = self._post(mock.AsyncMock(return_value=_result()), headers={"x-api-key": "otra"})

        self.assertEqual(response.status_code, 401)

    def test_success_returns_elements_and_engine_details(self):
        response = self._post(mock.AsyncMock(return_value=_result()))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["elements"], [{"type": "Texto", "content": "Hola.", "lang": "es"}])
        self.assertEqual(data["description"], "[TEXTO] Hola.")
        self.assertEqual(data["provider"], "gemini")
        self.assertEqual(data["detector"], "ollama")
        self.assertEqual(data["steps"][0]["name"], "extraccion")
        self.assertIn("processing_seconds", data)
        self.assertNotIn("fallback_reason", data)

    def test_fallback_reason_is_reported(self):
        result = _result()
        result.fallback_reason = "gemini respondio HTTP 429"

        response = self._post(mock.AsyncMock(return_value=result))

        self.assertEqual(response.json()["fallback_reason"], "gemini respondio HTTP 429")

    def test_second_identical_request_comes_from_the_cache(self):
        pipeline_mock = mock.AsyncMock(return_value=_result())

        first = self._post(pipeline_mock)
        second = self._post(pipeline_mock)

        self.assertNotIn("cached", first.json())
        self.assertTrue(second.json()["cached"])
        self.assertEqual(pipeline_mock.await_count, 1)

    def test_provider_error_keeps_its_status_and_message(self):
        error = ProviderError(503, "El servicio de IA alcanzó su límite de uso.", log_detail="secreto interno")

        response = self._post(mock.AsyncMock(side_effect=error))

        self.assertEqual(response.status_code, 503)
        self.assertIn("límite de uso", response.json()["detail"])
        self.assertNotIn("secreto interno", response.text)

    def test_unexpected_error_is_a_generic_500(self):
        response = self._post(mock.AsyncMock(side_effect=RuntimeError("clave=AIza123")))

        self.assertEqual(response.status_code, 500)
        self.assertNotIn("AIza123", response.text)

    def test_rate_limit_returns_429_with_retry_after(self):
        pipeline_mock = mock.AsyncMock(return_value=_result())
        headers = {**HEADERS, "x-aura-client-ip": "9.9.9.9"}

        codes = [
            self._post(pipeline_mock, body={"image": f"data:image/jpeg;base64,QUJD{i}"}, headers=headers).status_code
            for i in range(4)
        ]

        self.assertEqual(codes, [200, 200, 200, 429])
        blocked = self._post(pipeline_mock, headers=headers)
        self.assertEqual(blocked.status_code, 429)
        self.assertGreaterEqual(int(blocked.headers["retry-after"]), 1)

    def test_rate_limit_is_per_client(self):
        pipeline_mock = mock.AsyncMock(return_value=_result())

        for i in range(3):
            self._post(pipeline_mock, body={"image": f"data:image/jpeg;base64,QUJD{i}"},
                       headers={**HEADERS, "x-aura-client-ip": "1.1.1.1"})
        other = self._post(pipeline_mock, headers={**HEADERS, "x-aura-client-ip": "2.2.2.2"})

        self.assertEqual(other.status_code, 200)

    def test_oversized_image_is_rejected_before_calling_any_model(self):
        pipeline_mock = mock.AsyncMock(return_value=_result())
        # base64 ocupa 4/3 de los bytes reales: 7 MB de texto son ~5.25 MB de imagen (limite: 5 MB).
        huge = {"image": "A" * (7 * 1024 * 1024)}

        response = self._post(pipeline_mock, body=huge)

        self.assertEqual(response.status_code, 413)
        pipeline_mock.assert_not_awaited()

    def test_empty_image_is_a_bad_request(self):
        response = self._post(mock.AsyncMock(return_value=_result()), body={"image": ""})

        self.assertEqual(response.status_code, 400)


class StartupTests(unittest.TestCase):
    """El historial de logs es de produccion: solo se abre cuando el servidor arranca de verdad."""

    @staticmethod
    def _file_handlers():
        return [h for h in logbus.logger.handlers if isinstance(h, logging.handlers.RotatingFileHandler)]

    def test_importing_the_module_does_not_open_the_production_log(self):
        production_path = str(Path(main.settings.log_file_path))

        self.assertNotIn(production_path, [h.baseFilename for h in self._file_handlers()])

    def test_starting_the_server_opens_the_history_file(self):
        with tempfile.TemporaryDirectory() as folder:
            log_path = Path(folder) / "backend.log"
            before = set(self._file_handlers())
            with mock.patch.object(main, "settings", Settings(log_file_path=str(log_path))):
                with TestClient(main.app):  # entrar al "with" ejecuta el arranque (lifespan)
                    opened = [h for h in self._file_handlers() if h not in before]
                    self.assertEqual([h.baseFilename for h in opened], [str(log_path)])
                    logbus.logger.info("linea de prueba")
                    for handler in opened:
                        handler.flush()
                    self.assertIn("AURA lista", log_path.read_text(encoding="utf-8"))
            for handler in self._file_handlers():
                if handler not in before:
                    logbus.logger.removeHandler(handler)
                    handler.close()
            logbus.LOG_HISTORY_PATH = None


class HealthTests(unittest.TestCase):
    def test_health_does_not_depend_on_any_model(self):
        response = TestClient(main.app).get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_ready_reports_hybrid_even_if_ollama_is_down(self):
        cloud = mock.Mock(model="gemini-2.5-flash")
        cloud.name = "gemini"
        settings = main.settings.__class__(gemini_api_key="k", pipeline="hybrid")
        with (
            mock.patch.object(main, "settings", settings),
            mock.patch.object(main, "cloud_provider", cloud),
            mock.patch.object(main, "_ollama_has_model", mock.AsyncMock(return_value=False)),
        ):
            response = TestClient(main.app).get("/api/ready")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["pipeline"], "hybrid")
        self.assertEqual(body["provider"], "gemini")
        self.assertEqual(body["detector"], "ollama no disponible")

    def test_ready_fails_with_v4_when_ollama_is_down(self):
        settings = main.settings.__class__(pipeline="v4")
        with (
            mock.patch.object(main, "settings", settings),
            mock.patch.object(main, "cloud_provider", None),
            mock.patch.object(main, "_ollama_has_model", mock.AsyncMock(return_value=False)),
        ):
            response = TestClient(main.app).get("/api/ready")

        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
