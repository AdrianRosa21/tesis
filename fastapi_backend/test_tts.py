"""Pruebas de la voz en ingles del servidor (Piper).

La prueba con Piper de verdad se salta sola si no esta instalado ni el modelo (por ejemplo en una PC de desarrollo);
en el pod si corre.  python -m unittest fastapi_backend.test_tts
"""
import asyncio
import io
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from fastapi_backend import main
from fastapi_backend.config import Settings, load_settings
from fastapi_backend.ratelimit import RateLimiter
from fastapi_backend.tts import CACHE_ENTRIES, PiperSynth

KEY = "clave-de-prueba"
HEADERS = {"x-api-key": KEY}
REAL = PiperSynth(Settings())  # usa /workspace/aura/tts: solo existe en el pod


def _wav(seconds: float = 0.1) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b"\x00\x00" * int(22050 * seconds))
    return buffer.getvalue()


class SettingsTests(unittest.TestCase):
    def test_defaults_point_at_the_persistent_voice_folder(self):
        settings = load_settings({})

        self.assertTrue(settings.tts_enabled)
        self.assertEqual(settings.tts_en_voice, "en_US-lessac-medium")
        self.assertEqual(settings.tts_voice_dir, "/workspace/aura/tts")
        self.assertEqual(settings.tts_threads, 4)

    def test_can_be_turned_off_and_values_are_validated(self):
        settings = load_settings({"AURA_TTS": "off", "AURA_TTS_THREADS": "0", "AURA_TTS_MAX_CHARS": "5"})

        self.assertFalse(settings.tts_enabled)
        self.assertEqual(settings.tts_threads, 1)  # nunca 0 hilos
        self.assertEqual(settings.tts_max_chars, 50)  # nunca un limite absurdo


class AvailabilityTests(unittest.TestCase):
    def test_not_available_without_the_model_file(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertFalse(PiperSynth(Settings(tts_voice_dir=folder)).available)

    def test_not_available_when_turned_off_even_if_the_model_exists(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "en_US-lessac-medium.onnx").write_bytes(b"x")
            self.assertFalse(PiperSynth(Settings(tts_voice_dir=folder, tts_enabled=False)).available)

    def test_not_available_when_piper_is_not_installed(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "en_US-lessac-medium.onnx").write_bytes(b"x")
            with mock.patch("importlib.util.find_spec", return_value=None):
                self.assertFalse(PiperSynth(Settings(tts_voice_dir=folder)).available)


class CacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_repeated_sentence_is_not_generated_twice(self):
        synth = PiperSynth(Settings())
        with mock.patch.object(synth, "_synthesize_blocking", return_value=b"WAV") as generate:
            first = await synth.synthesize("Hello there.")
            second = await synth.synthesize("Hello there.")
            await synth.synthesize("Another sentence.")

        self.assertEqual((first, second), (b"WAV", b"WAV"))
        self.assertEqual(generate.call_count, 2)

    async def test_the_cache_is_bounded(self):
        synth = PiperSynth(Settings())
        with mock.patch.object(synth, "_synthesize_blocking", return_value=b"WAV"):
            for index in range(CACHE_ENTRIES + 20):
                await synth.synthesize(f"Sentence number {index}.")

        self.assertEqual(len(synth._cache), CACHE_ENTRIES)


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.synth = mock.Mock()
        self.synth.available = True
        self.synth.voice_name = "en_US-lessac-medium"
        self.synth.synthesize = mock.AsyncMock(return_value=_wav())
        for patch in (
            mock.patch.object(main, "API_KEY_SECRET", KEY),
            mock.patch.object(main, "tts", self.synth),
            mock.patch.object(main, "tts_limiter", RateLimiter(3)),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.client = TestClient(main.app)

    def _speak(self, text="Hello there.", lang="en", headers=HEADERS):
        return self.client.post("/api/tts", json={"text": text, "lang": lang}, headers=headers)

    def test_status_reports_the_voice_when_available(self):
        body = self.client.get("/api/tts/status", headers=HEADERS).json()

        self.assertEqual(body["available"], True)
        self.assertEqual(body["languages"], ["en"])
        self.assertEqual(body["voice"], "en_US-lessac-medium")

    def test_status_reports_unavailable_without_inventing_a_voice(self):
        self.synth.available = False

        body = self.client.get("/api/tts/status", headers=HEADERS).json()

        self.assertEqual((body["available"], body["languages"], body["voice"]), (False, [], None))

    def test_speaking_returns_a_wav_the_browser_can_play(self):
        response = self._speak()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/wav")
        self.assertTrue(response.content.startswith(b"RIFF"))
        self.synth.synthesize.assert_awaited_once_with("Hello there.")

    def test_both_endpoints_require_the_api_key(self):
        self.assertEqual(self.client.get("/api/tts/status").status_code, 401)
        self.assertEqual(self._speak(headers={"x-api-key": "otra"}).status_code, 401)
        self.synth.synthesize.assert_not_awaited()

    def test_only_english_is_supported(self):
        self.assertEqual(self._speak(lang="es").status_code, 400)

    def test_empty_and_oversized_text_are_rejected_before_generating_audio(self):
        self.assertEqual(self._speak(text="   ").status_code, 400)
        self.assertEqual(self._speak(text="a" * 5000).status_code, 413)
        self.synth.synthesize.assert_not_awaited()

    def test_unavailable_voice_is_a_clear_503_so_the_browser_can_fall_back(self):
        self.synth.available = False

        self.assertEqual(self._speak().status_code, 503)

    def test_a_synthesis_failure_does_not_leak_internal_details(self):
        self.synth.synthesize.side_effect = RuntimeError("ruta secreta /workspace/x")

        response = self._speak()

        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secreta", response.text)

    def test_rate_limit_is_per_client(self):
        codes = [self._speak(headers={**HEADERS, "x-aura-client-ip": "1.1.1.1"}).status_code for _ in range(4)]
        other = self._speak(headers={**HEADERS, "x-aura-client-ip": "2.2.2.2"}).status_code

        self.assertEqual(codes, [200, 200, 200, 429])
        self.assertEqual(other, 200)


@unittest.skipUnless(REAL.available, "Piper o el modelo de voz no estan instalados en esta maquina")
class RealPiperTests(unittest.IsolatedAsyncioTestCase):
    async def test_generates_a_valid_us_english_wav_quickly(self):
        synth = PiperSynth(Settings())
        await asyncio.to_thread(synth.load)

        audio = await synth.synthesize("Could you please turn up the volume? I would like to listen to the news.")

        with wave.open(io.BytesIO(audio)) as wav:
            seconds = wav.getnframes() / wav.getframerate()
            channels, sample_rate = wav.getnchannels(), wav.getframerate()
        self.assertGreater(seconds, 2.0)  # una frase de ~75 caracteres dura varios segundos
        self.assertEqual(channels, 1)
        self.assertEqual(sample_rate, 22050)

    async def test_with_limited_threads_it_is_much_faster_than_real_time(self):
        synth = PiperSynth(Settings())
        await asyncio.to_thread(synth.load)
        await synth.synthesize("Warm up sentence.")  # calentamiento de ONNX

        loop = asyncio.get_running_loop()
        started = loop.time()
        audio = await synth.synthesize("The kid was so fast that no one saw him. Option A, so. Option B, too.")
        elapsed = loop.time() - started

        with wave.open(io.BytesIO(audio)) as wav:
            seconds = wav.getnframes() / wav.getframerate()
        # Con 256 hilos en un contenedor con cuota de ~7 CPUs iba a 0.7x (mas lento que hablar).
        self.assertLess(elapsed, seconds / 3, f"{seconds:.1f}s de audio tardaron {elapsed:.2f}s en generarse")


if __name__ == "__main__":
    unittest.main()
