"""Voz en ingles generada en el servidor con Piper.

Por que existe: la voz con que AURA lee en inglés dependía de lo que tuviera instalado cada navegador. Si no
había ninguna voz en inglés, el navegador leía el inglés con la voz española. Piper es de código abierto, gratis,
corre en este mismo servidor (el texto no sale a ningún tercero) y suena igual en cualquier computadora.
"""
import asyncio
import importlib.util
import io
import threading
import wave
from collections import OrderedDict
from pathlib import Path

from fastapi_backend.config import Settings

CACHE_ENTRIES = 256


class PiperSynth:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._model_path = Path(settings.tts_voice_dir) / f"{settings.tts_en_voice}.onnx"
        self._voice = None
        self._load_lock = threading.Lock()
        # espeak-ng (el fonemizador de Piper) no es seguro entre hilos: una frase a la vez.
        self._run_lock = threading.Lock()
        self._cache: OrderedDict[str, bytes] = OrderedDict()

    @property
    def available(self) -> bool:
        """Hay voz si esta activada, existe el modelo en disco y esta instalado piper-tts."""
        return (
            self._settings.tts_enabled
            and self._model_path.is_file()
            and importlib.util.find_spec("piper") is not None
        )

    @property
    def voice_name(self) -> str:
        return self._settings.tts_en_voice

    def load(self) -> None:
        """Carga el modelo (≈1.5 s). Se llama al arrancar para que la primera frase no la pague."""
        if self._voice is not None:
            return
        with self._load_lock:
            if self._voice is not None:
                return
            import onnxruntime
            from piper import PiperVoice

            voice = PiperVoice.load(str(self._model_path))
            options = onnxruntime.SessionOptions()
            options.intra_op_num_threads = self._settings.tts_threads
            options.inter_op_num_threads = 1
            voice.session = onnxruntime.InferenceSession(
                str(self._model_path), sess_options=options, providers=["CPUExecutionProvider"]
            )
            self._voice = voice

    def _synthesize_blocking(self, text: str) -> bytes:
        self.load()
        buffer = io.BytesIO()
        with self._run_lock:
            with wave.open(buffer, "wb") as wav:
                self._voice.synthesize_wav(text, wav)
        return buffer.getvalue()

    async def synthesize(self, text: str) -> bytes:
        """Audio WAV de la frase. Las frases repetidas salen de la memoria sin volver a generarse."""
        cached = self._cache.get(text)
        if cached is not None:
            self._cache.move_to_end(text)
            return cached

        audio = await asyncio.to_thread(self._synthesize_blocking, text)
        self._cache[text] = audio
        while len(self._cache) > CACHE_ENTRIES:
            self._cache.popitem(last=False)
        return audio
