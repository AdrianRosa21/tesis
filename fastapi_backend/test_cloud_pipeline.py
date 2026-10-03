"""Pruebas del pipeline hybrid (nube + detector local), los proveedores y los modulos de apoyo.

No usan red ni claves: los proveedores son falsos y las respuestas HTTP simuladas.
Ejecutar desde la raiz:  python -m unittest fastapi_backend.test_cloud_pipeline
"""
import asyncio
import json
import unittest
from unittest import mock

import httpx

from fastapi_backend import pipeline
from fastapi_backend.budget import CloudBudget
from fastapi_backend.cache import ResponseCache, build_cache_key
from fastapi_backend.config import Settings, load_settings
from fastapi_backend.normalize import blocks_to_elements
from fastapi_backend.providers import AnthropicProvider, GeminiProvider, ModelResult, OpenAIProvider, ProviderError
from fastapi_backend.providers.base import error_from_response
from fastapi_backend.providers.http import post_json
from fastapi_backend.ratelimit import RateLimiter
from fastapi_backend.schemas import (
    EXTRACT_SCHEMA_CLOUD,
    to_anthropic_schema,
    to_gemini_schema,
    to_openai_strict_schema,
)


# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------

class SettingsTests(unittest.TestCase):
    def test_without_cloud_key_hybrid_falls_back_to_v4(self):
        settings = load_settings({})

        self.assertEqual(settings.pipeline, "hybrid")
        self.assertFalse(settings.cloud_ready)
        self.assertEqual(settings.effective_pipeline, "v4")
        self.assertEqual(settings.prompt_version, "faithful-reader-v4")
        self.assertEqual(settings.engine_tag, "v4:qwen2.5vl")

    def test_gemini_key_activates_hybrid(self):
        settings = load_settings({"GEMINI_API_KEY": "k"})

        self.assertEqual(settings.effective_pipeline, "hybrid")
        self.assertEqual(settings.prompt_version, "faithful-reader-cloud-v1")
        self.assertIn("gemini", settings.engine_tag)
        self.assertIn(settings.gemini_model, settings.engine_tag)

    def test_provider_choice_selects_matching_key_and_model(self):
        settings = load_settings({"AURA_PROVIDER": "openai", "OPENAI_API_KEY": "k", "GEMINI_API_KEY": "otra"})

        self.assertEqual(settings.cloud_api_key, "k")
        self.assertEqual(settings.cloud_model, settings.openai_model)

    def test_provider_is_detected_from_the_key_when_aura_provider_is_missing(self):
        # Caso real: solo se puso OPENAI_API_KEY. No debe quedarse en silencio usando Ollama.
        only_openai = load_settings({"OPENAI_API_KEY": "k"})
        self.assertEqual((only_openai.provider, only_openai.effective_pipeline), ("openai", "hybrid"))
        self.assertEqual(load_settings({"ANTHROPIC_API_KEY": "k"}).provider, "anthropic")
        self.assertEqual(load_settings({"GEMINI_API_KEY": "k"}).provider, "gemini")
        self.assertEqual(load_settings({}).provider, "gemini")  # sin ninguna clave: v4, da igual

    def test_explicit_provider_wins_over_detection(self):
        settings = load_settings({"AURA_PROVIDER": "anthropic", "OPENAI_API_KEY": "k", "ANTHROPIC_API_KEY": "k2"})

        self.assertEqual(settings.provider, "anthropic")

    def test_when_several_keys_exist_openai_is_preferred(self):
        self.assertEqual(load_settings({"OPENAI_API_KEY": "a", "GEMINI_API_KEY": "b"}).provider, "openai")

    def test_daily_cloud_limit_is_read_from_the_environment(self):
        self.assertEqual(load_settings({}).cloud_max_pages_per_day, 0)
        self.assertEqual(load_settings({"AURA_CLOUD_MAX_PAGES_PER_DAY": "400"}).cloud_max_pages_per_day, 400)

    def test_anthropic_is_selected_with_its_own_key_and_model(self):
        settings = load_settings({"AURA_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "k"})

        self.assertTrue(settings.cloud_ready)
        self.assertEqual(settings.effective_pipeline, "hybrid")
        self.assertEqual(settings.cloud_model, "claude-sonnet-5-5")
        self.assertIn("anthropic:claude-sonnet-5-5", settings.engine_tag)

        custom = load_settings({
            "AURA_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "k", "ANTHROPIC_MODEL": "claude-haiku-4-5-20251001",
        })
        self.assertEqual(custom.cloud_model, "claude-haiku-4-5-20251001")

    def test_anthropic_effort_rejects_unknown_values(self):
        self.assertEqual(load_settings({"ANTHROPIC_EFFORT": "ultra"}).anthropic_effort, "auto")
        self.assertEqual(load_settings({"ANTHROPIC_EFFORT": "HIGH"}).anthropic_effort, "high")

    def test_key_of_the_other_provider_does_not_activate_cloud(self):
        settings = load_settings({"AURA_PROVIDER": "openai", "GEMINI_API_KEY": "k"})

        self.assertFalse(settings.cloud_ready)
        self.assertEqual(settings.effective_pipeline, "v4")

    def test_v3_and_v4_can_be_forced_even_with_a_key(self):
        for pipeline_name in ("v3", "v4"):
            settings = load_settings({"AURA_PIPELINE": pipeline_name, "GEMINI_API_KEY": "k"})
            self.assertEqual(settings.effective_pipeline, pipeline_name)

    def test_invalid_values_use_the_default(self):
        settings = load_settings({"AURA_PIPELINE": "v9", "AURA_PROVIDER": "x", "AURA_TIME_BUDGET_S": "mucho"})

        self.assertEqual(settings.pipeline, "hybrid")
        self.assertEqual(settings.provider, "gemini")
        self.assertEqual(settings.time_budget_s, 80.0)

    def test_logs_key_defaults_to_api_key(self):
        self.assertEqual(load_settings({"API_KEY": "abc"}).logs_stream_key, "abc")
        self.assertEqual(load_settings({"API_KEY": "abc", "LOGS_STREAM_KEY": "log"}).logs_stream_key, "log")

    def test_uses_ollama_only_when_detector_or_fallback_need_it(self):
        self.assertTrue(load_settings({"GEMINI_API_KEY": "k"}).uses_ollama)
        self.assertTrue(load_settings({"GEMINI_API_KEY": "k", "AURA_DETECTOR": "off"}).uses_ollama)  # respaldo
        self.assertTrue(load_settings({"GEMINI_API_KEY": "k", "AURA_FALLBACK": "off"}).uses_ollama)  # detector
        self.assertFalse(
            load_settings({"GEMINI_API_KEY": "k", "AURA_DETECTOR": "off", "AURA_FALLBACK": "off"}).uses_ollama
        )
        self.assertTrue(load_settings({"AURA_PIPELINE": "v4"}).uses_ollama)
        # hybrid sin clave cae a v4, que si usa Ollama aunque detector y respaldo esten apagados
        self.assertTrue(load_settings({"AURA_DETECTOR": "off", "AURA_FALLBACK": "off"}).uses_ollama)

    def test_engine_tag_changes_with_detector_model(self):
        with_detector = load_settings({"GEMINI_API_KEY": "k"})
        without_detector = load_settings({"GEMINI_API_KEY": "k", "AURA_DETECTOR": "off"})

        self.assertNotEqual(with_detector.engine_tag, without_detector.engine_tag)


# ---------------------------------------------------------------------------
# Cache y limite de peticiones
# ---------------------------------------------------------------------------

class CacheTests(unittest.TestCase):
    def test_key_depends_on_engine_and_prompt_version(self):
        base = build_cache_key("img", "ctx", "v4:qwen", "faithful-reader-v4")

        self.assertNotEqual(base, build_cache_key("img", "ctx", "hybrid:gemini", "faithful-reader-v4"))
        self.assertNotEqual(base, build_cache_key("img", "ctx", "v4:qwen", "faithful-reader-cloud-v1"))
        self.assertEqual(base, build_cache_key("img", "ctx", "v4:qwen", "faithful-reader-v4"))

    def test_lru_evicts_the_least_recently_used(self):
        cache = ResponseCache(max_entries=2)
        cache.put("a", {"n": 1})
        cache.put("b", {"n": 2})
        cache.get("a")  # "b" queda como el menos usado
        cache.put("c", {"n": 3})

        self.assertIsNotNone(cache.get("a"))
        self.assertIsNone(cache.get("b"))
        self.assertIsNotNone(cache.get("c"))
        self.assertEqual(len(cache), 2)


class RateLimiterTests(unittest.TestCase):
    def setUp(self):
        self.now = 0.0
        self.limiter = RateLimiter(max_per_window=3, window_s=60, clock=lambda: self.now)

    def test_allows_up_to_the_limit_then_rejects_with_wait_time(self):
        for _ in range(3):
            self.assertIsNone(self.limiter.check("1.2.3.4"))

        self.now = 10.0
        wait = self.limiter.check("1.2.3.4")

        self.assertIsNotNone(wait)
        self.assertAlmostEqual(wait, 50.0)

    def test_window_slides(self):
        for _ in range(3):
            self.limiter.check("1.2.3.4")

        self.now = 61.0

        self.assertIsNone(self.limiter.check("1.2.3.4"))

    def test_clients_are_independent(self):
        for _ in range(3):
            self.limiter.check("a")

        self.assertIsNotNone(self.limiter.check("a"))
        self.assertIsNone(self.limiter.check("b"))

    def test_zero_disables_the_limit(self):
        limiter = RateLimiter(max_per_window=0)
        for _ in range(100):
            self.assertIsNone(limiter.check("a"))


# ---------------------------------------------------------------------------
# Esquemas y proveedores
# ---------------------------------------------------------------------------

class SchemaTests(unittest.TestCase):
    def test_gemini_schema_uses_uppercase_types_and_drops_unknown_keys(self):
        converted = to_gemini_schema(
            {"type": "object", "additionalProperties": False, "properties": {"a": {"type": "string", "title": "x"}}}
        )

        self.assertEqual(converted["type"], "OBJECT")
        self.assertNotIn("additionalProperties", converted)
        self.assertEqual(converted["properties"]["a"], {"type": "STRING"})

    def test_cloud_schema_adds_language_without_touching_the_ollama_schema(self):
        from fastapi_backend.prompts import EXTRACT_SCHEMA

        cloud_props = EXTRACT_SCHEMA_CLOUD["properties"]["bloques"]["items"]["properties"]
        ollama_props = EXTRACT_SCHEMA["properties"]["bloques"]["items"]["properties"]

        self.assertIn("idioma", cloud_props)
        self.assertNotIn("idioma", ollama_props)


class OllamaWarmUpTests(unittest.IsolatedAsyncioTestCase):
    async def test_warm_up_uses_the_same_context_size_as_real_requests(self):
        from fastapi_backend.providers import OllamaProvider

        sent = []

        def handler(request):
            sent.append(json.loads(request.content))
            return httpx.Response(200, json={"done": True})

        provider = OllamaProvider(Settings(ollama_num_ctx=16384, ollama_keep_alive="30m"))
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await provider.warm_up(client)
            await provider.generate(client, "p", "IMG")  # peticion real (usa /api/chat)

        warm_up_body = sent[0]
        self.assertEqual(warm_up_body["options"]["num_ctx"], sent[1]["options"]["num_ctx"])
        self.assertEqual(warm_up_body["keep_alive"], "30m")
        self.assertNotIn("prompt", warm_up_body)  # sin prompt: solo carga, no genera


class GeminiProviderTests(unittest.TestCase):
    def test_body_has_image_prompt_schema_and_no_thinking_for_flash(self):
        provider = GeminiProvider(Settings(gemini_api_key="k", gemini_model="gemini-2.5-flash"))

        body = provider.build_body("lee esto", "IMG", {"type": "object"}, 4096, 0.0)

        parts = body["contents"][0]["parts"]
        self.assertEqual(parts[0]["inline_data"]["data"], "IMG")
        self.assertEqual(parts[1]["text"], "lee esto")
        config = body["generationConfig"]
        self.assertEqual(config["responseMimeType"], "application/json")
        self.assertEqual(config["responseSchema"]["type"], "OBJECT")
        self.assertEqual(config["thinkingConfig"], {"thinkingBudget": 0})
        self.assertEqual(config["maxOutputTokens"], 4096)

    def test_other_models_do_not_get_a_thinking_budget_in_auto_mode(self):
        provider = GeminiProvider(Settings(gemini_api_key="k", gemini_model="gemini-2.5-pro"))

        body = provider.build_body("p", "IMG", None, 100, 0.0)

        self.assertNotIn("thinkingConfig", body["generationConfig"])
        self.assertNotIn("responseSchema", body["generationConfig"])

    def test_parse_skips_thought_parts_and_reads_usage(self):
        result = GeminiProvider.parse_response({
            "candidates": [{
                "content": {"parts": [{"text": "pensando", "thought": True}, {"text": '{"bloques": []}'}]},
                "finishReason": "STOP",
            }],
            "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5, "thoughtsTokenCount": 2},
        })

        self.assertEqual(result.text, '{"bloques": []}')
        self.assertEqual(result.usage, {"input": 10, "output": 5, "thinking": 2})

    def test_parse_raises_when_blocked_or_empty(self):
        with self.assertRaises(ProviderError) as blocked:
            GeminiProvider.parse_response({"promptFeedback": {"blockReason": "SAFETY"}})
        self.assertIn("SAFETY", blocked.exception.log_detail)

        with self.assertRaises(ProviderError):
            GeminiProvider.parse_response({"candidates": [{"content": {"parts": []}, "finishReason": "STOP"}]})


class OpenAIProviderTests(unittest.TestCase):
    def test_body_sends_image_and_json_schema(self):
        provider = OpenAIProvider(Settings(openai_api_key="k", openai_model="gpt-4.1-mini"))

        body = provider.build_body("lee", "IMG", {"type": "object"}, 2000, 0.0)

        content = body["messages"][0]["content"]
        self.assertTrue(content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,IMG"))
        self.assertEqual(body["response_format"]["type"], "json_schema")
        self.assertEqual(body["temperature"], 0.0)
        self.assertEqual(body["max_completion_tokens"], 2000)

    def test_reasoning_models_do_not_get_temperature(self):
        provider = OpenAIProvider(Settings(openai_api_key="k", openai_model="gpt-5-mini"))

        self.assertNotIn("temperature", provider.build_body("p", "IMG", None, 100, 0.0))

    def test_parse_and_empty_response(self):
        result = OpenAIProvider.parse_response({
            "choices": [{"message": {"content": "hola"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 7, "completion_tokens": 3},
        })
        self.assertEqual(result.text, "hola")
        self.assertEqual(result.usage, {"input": 7, "output": 3})

        with self.assertRaises(ProviderError):
            OpenAIProvider.parse_response({"choices": [{"message": {"content": "", "refusal": "no"}}]})


class AnthropicProviderTests(unittest.IsolatedAsyncioTestCase):
    def _provider(self, model: str, **overrides) -> AnthropicProvider:
        return AnthropicProvider(Settings(anthropic_api_key="k", anthropic_model=model, **overrides))

    def _body(self, model: str, schema=None, **overrides) -> dict:
        return self._provider(model, **overrides).build_body("lee", "IMG", schema, 4096, 0.0)

    def test_image_goes_before_the_text_and_schema_uses_output_config(self):
        body = self._body("claude-sonnet-5-5", schema={"type": "object", "properties": {"a": {"type": "string"}}})

        content = body["messages"][0]["content"]
        self.assertEqual([part["type"] for part in content], ["image", "text"])
        self.assertEqual(content[0]["source"], {"type": "base64", "media_type": "image/jpeg", "data": "IMG"})
        fmt = body["output_config"]["format"]
        self.assertEqual(fmt["type"], "json_schema")
        self.assertFalse(fmt["schema"]["additionalProperties"])
        self.assertNotIn("tool_choice", body)  # forzar herramientas da 400 en Sonnet/Opus 5.5
        self.assertNotIn("tools", body)

    def test_sonnet_55_turns_off_upfront_thinking_and_never_sends_temperature(self):
        body = self._body("claude-sonnet-5-5")

        self.assertEqual(body["thinking"], {"type": "between_tools"})
        self.assertEqual(body["output_config"]["effort"], "low")
        self.assertNotIn("temperature", body)  # un valor no predeterminado da 400

    def test_opus_55_cannot_disable_thinking_so_it_only_lowers_effort(self):
        body = self._body("claude-opus-5-5")

        self.assertNotIn("thinking", body)  # thinking: disabled/between_tools dan 400 en Opus 5.5
        self.assertEqual(body["output_config"]["effort"], "low")
        self.assertNotIn("temperature", body)

    def test_haiku_has_no_effort_or_thinking_but_accepts_temperature(self):
        body = self._body("claude-haiku-4-5-20251001", schema={"type": "object"})

        self.assertNotIn("thinking", body)
        self.assertNotIn("effort", body["output_config"])
        self.assertEqual(body["temperature"], 0.0)

    def test_unknown_models_get_no_reasoning_fields_in_auto_mode(self):
        body = self._body("claude-futuro-9")

        self.assertNotIn("thinking", body)
        self.assertNotIn("output_config", body)  # sin esquema ni effort: nada que mandar

    def test_explicit_effort_is_respected_and_between_tools_needs_effort_up_to_high(self):
        high = self._body("claude-sonnet-5-5", anthropic_effort="high")
        xhigh = self._body("claude-sonnet-5-5", anthropic_effort="xhigh")
        default = self._body("claude-sonnet-5-5", anthropic_effort="default")

        self.assertEqual((high["thinking"], high["output_config"]["effort"]), ({"type": "between_tools"}, "high"))
        self.assertNotIn("thinking", xhigh)  # between_tools con xhigh/max da 400
        self.assertEqual(xhigh["output_config"]["effort"], "xhigh")
        self.assertNotIn("thinking", default)
        self.assertNotIn("output_config", default)

    def test_parse_reads_only_text_blocks_even_if_a_thinking_block_comes_first(self):
        result = AnthropicProvider.parse_response({
            "content": [
                {"type": "thinking", "thinking": "", "signature": "x"},
                {"type": "text", "text": '{"bloques": []}'},
            ],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 100, "output_tokens": 20, "output_tokens_details": {"thinking_tokens": 5}},
        })

        self.assertEqual(result.text, '{"bloques": []}')
        self.assertEqual(result.finish_reason, "end_turn")
        self.assertEqual(result.usage, {"input": 100, "output": 20, "thinking": 5})

    def test_max_tokens_is_reported_as_length_so_the_pipeline_rescues_blocks(self):
        result = AnthropicProvider.parse_response({
            "content": [{"type": "text", "text": '{"bloques": [{"tipo"'}],
            "stop_reason": "max_tokens",
        })

        self.assertEqual(result.finish_reason, "length")

    def test_refusal_and_empty_answers_raise_so_the_pipeline_can_fall_back(self):
        with self.assertRaises(ProviderError) as refusal:
            AnthropicProvider.parse_response({
                "content": [], "stop_reason": "refusal", "stop_details": {"category": "general_harms"},
            })
        self.assertIn("general_harms", refusal.exception.log_detail)
        self.assertNotIn("general_harms", refusal.exception.message)

        with self.assertRaises(ProviderError):
            AnthropicProvider.parse_response({"content": [{"type": "text", "text": "  "}], "stop_reason": "end_turn"})

    async def test_generate_sends_the_required_headers_to_the_messages_endpoint(self):
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            seen["headers"] = request.headers
            return httpx.Response(200, json={
                "content": [{"type": "text", "text": "hola"}], "stop_reason": "end_turn", "usage": {},
            })

        provider = self._provider("claude-sonnet-5-5")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await provider.generate(client, "p", "IMG")

        self.assertEqual(result.text, "hola")
        self.assertEqual(seen["url"], "https://api.anthropic.com/v1/messages")
        self.assertEqual(seen["headers"]["x-api-key"], "k")
        self.assertEqual(seen["headers"]["anthropic-version"], "2023-06-01")

    async def test_http_errors_become_provider_errors_without_leaking_the_key(self):
        def handler(request):
            return httpx.Response(401, json={
                "type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key sk-ant-123"},
            })

        provider = self._provider("claude-sonnet-5-5")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with self.assertRaises(ProviderError) as ctx:
                await provider.generate(client, "p", "IMG")

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertNotIn("sk-ant-123", ctx.exception.message)


class AnthropicSchemaTests(unittest.TestCase):
    def test_every_object_forbids_extra_properties_and_unsupported_keywords_are_dropped(self):
        converted = to_anthropic_schema({
            "type": "object",
            "properties": {
                "n": {"type": "integer", "minimum": 0, "maximum": 5},
                "s": {"type": "string", "minLength": 1, "maxLength": 9},
                "lista": {"type": "array", "maxItems": 3, "minItems": 5, "items": {
                    "type": "object", "properties": {"x": {"type": "string"}},
                }},
            },
            "required": ["n"],
        })

        self.assertFalse(converted["additionalProperties"])
        self.assertFalse(converted["properties"]["lista"]["items"]["additionalProperties"])
        self.assertEqual(converted["properties"]["n"], {"type": "integer"})
        self.assertEqual(converted["properties"]["s"], {"type": "string"})
        self.assertEqual(converted["properties"]["lista"].keys(), {"type", "items"})  # sin maxItems ni minItems=5
        self.assertEqual(converted["required"], ["n"])

    def test_the_real_extraction_schema_converts_and_stays_within_documented_limits(self):
        converted = to_anthropic_schema(EXTRACT_SCHEMA_CLOUD)

        def objects(node):
            if isinstance(node, dict):
                if node.get("type") == "object":
                    yield node
                for value in node.values():
                    yield from objects(value)
            elif isinstance(node, list):
                for item in node:
                    yield from objects(item)

        found = list(objects(converted))
        self.assertEqual(len(found), 4)  # raiz, bloque, dato de grafica, conexion de diagrama
        self.assertTrue(all(obj["additionalProperties"] is False for obj in found))
        optional = sum(len(set(obj.get("properties", {})) - set(obj.get("required", []))) for obj in found)
        self.assertLessEqual(optional, 24)  # limite documentado de parametros opcionales


class OpenAIStrictModeTests(unittest.IsolatedAsyncioTestCase):
    def test_strict_schema_requires_every_field_and_makes_optional_ones_nullable(self):
        converted = to_openai_strict_schema(EXTRACT_SCHEMA_CLOUD)
        block = converted["properties"]["bloques"]["items"]

        self.assertFalse(converted["additionalProperties"])
        self.assertFalse(block["additionalProperties"])
        self.assertEqual(set(block["required"]), set(block["properties"]))  # todos obligatorios
        self.assertEqual(block["properties"]["filas"]["type"], ["array", "null"])
        self.assertEqual(block["properties"]["idioma"]["type"], ["string", "null"])
        self.assertEqual(block["properties"]["tipo"]["type"], "string")  # ya era obligatorio
        self.assertIn("tabla", block["properties"]["tipo"]["enum"])

        def objects(node):
            if isinstance(node, dict):
                if node.get("type") == "object":
                    yield node
                for value in node.values():
                    yield from objects(value)
            elif isinstance(node, list):
                for item in node:
                    yield from objects(item)

        for obj in objects(converted):
            self.assertIs(obj["additionalProperties"], False)
            self.assertEqual(set(obj["required"]), set(obj["properties"]))

    def test_original_schema_is_not_modified(self):
        before = json.dumps(EXTRACT_SCHEMA_CLOUD, sort_keys=True)

        to_openai_strict_schema(EXTRACT_SCHEMA_CLOUD)

        self.assertEqual(json.dumps(EXTRACT_SCHEMA_CLOUD, sort_keys=True), before)

    def test_null_optional_fields_from_strict_mode_do_not_break_the_reader(self):
        elements = blocks_to_elements([
            {"tipo": "texto", "contenido": "Hola.", "encabezados": None, "filas": None,
             "datos": None, "conexiones": None, "idioma": None},
            {"tipo": "tabla", "contenido": "", "encabezados": ["A"], "filas": [["1"]],
             "datos": None, "conexiones": None, "idioma": "es"},
        ])

        self.assertEqual(elements[0], {"type": "Texto", "content": "Hola."})
        self.assertEqual(elements[1]["lang"], "es")

    def test_body_uses_strict_json_schema_and_temperature_only_for_gpt4_family(self):
        mini = OpenAIProvider(Settings(openai_api_key="k", openai_model="gpt-4.1-mini"))
        newer = OpenAIProvider(Settings(openai_api_key="k", openai_model="gpt-6-algo"))

        body = mini.build_body("p", "IMG", EXTRACT_SCHEMA_CLOUD, 2000, 0.0)

        self.assertTrue(body["response_format"]["json_schema"]["strict"])
        self.assertEqual(body["response_format"]["json_schema"]["name"], "aura_page")
        self.assertEqual(body["temperature"], 0.0)
        self.assertNotIn("temperature", newer.build_body("p", "IMG", None, 100, 0.0))  # modelo desconocido: omitir

    async def test_if_openai_rejects_the_strict_schema_it_retries_once_without_strict(self):
        bodies = []

        def handler(request):
            body = json.loads(request.content)
            bodies.append(body)
            if body["response_format"]["json_schema"]["strict"]:
                return httpx.Response(400, json={"error": {"message": "Invalid schema", "code": "invalid_json_schema"}})
            return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]})

        provider = OpenAIProvider(Settings(openai_api_key="k"))
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await provider.generate(client, "p", "IMG", schema=EXTRACT_SCHEMA_CLOUD)
            await provider.generate(client, "p", "IMG", schema=EXTRACT_SCHEMA_CLOUD)

        self.assertEqual([b["response_format"]["json_schema"]["strict"] for b in bodies], [True, False, False])

    async def test_a_400_that_is_not_about_the_schema_still_fails_after_the_single_retry(self):
        def handler(request):
            return httpx.Response(400, json={"error": {"message": "bad request"}})

        provider = OpenAIProvider(Settings(openai_api_key="k"))
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with self.assertRaises(ProviderError) as ctx:
                await provider.generate(client, "p", "IMG", schema=EXTRACT_SCHEMA_CLOUD)

        self.assertEqual(ctx.exception.status_code, 502)


class CloudBudgetTests(unittest.IsolatedAsyncioTestCase):
    def test_stops_at_the_daily_limit_and_resets_the_next_utc_day(self):
        now = [1_700_000_000.0]
        budget = CloudBudget(2, clock=lambda: now[0])

        self.assertEqual([budget.try_acquire() for _ in range(3)], [True, True, False])
        self.assertEqual(budget.used_today, 2)

        now[0] += 24 * 3600
        self.assertTrue(budget.try_acquire())
        self.assertEqual(budget.used_today, 1)

    def test_zero_means_no_limit_but_still_counts(self):
        budget = CloudBudget(0)

        self.assertTrue(all(budget.try_acquire() for _ in range(50)))
        self.assertEqual(budget.used_today, 50)

    async def test_when_the_limit_is_reached_the_page_is_read_locally_without_calling_the_cloud(self):
        settings = Settings(openai_api_key="k", provider="openai", cloud_max_pages_per_day=1)
        budget = CloudBudget(1)
        cloud = FakeProvider("openai", "gpt-4.1-mini", [_json_result([{"tipo": "texto", "contenido": "Nube."}])])

        def local():
            return FakeProvider("ollama", "qwen2.5vl", [
                _classification(), _classification(), _json_result([{"tipo": "texto", "contenido": "Local."}]),
            ])

        first = await pipeline.run_pipeline(mock.Mock(), "IMG", None, settings, cloud, local(), asyncio.Lock(), budget)
        second = await pipeline.run_pipeline(mock.Mock(), "IMG", None, settings, cloud, local(), asyncio.Lock(), budget)

        self.assertEqual((first.provider, first.elements[0]["content"]), ("openai", "Nube."))
        self.assertEqual((second.provider, second.elements[0]["content"]), ("ollama", "Local."))
        self.assertIn("limite diario", second.fallback_reason)
        self.assertEqual(len(cloud.calls), 1)  # la segunda pagina no llego a la nube

    async def test_without_fallback_the_limit_returns_a_clear_error(self):
        settings = Settings(openai_api_key="k", provider="openai", fallback="off")
        budget = CloudBudget(1)
        budget.try_acquire()
        cloud = FakeProvider("openai", "gpt-4.1-mini", [_json_result([])])

        with self.assertRaises(ProviderError) as ctx:
            await pipeline.run_pipeline(
                mock.Mock(), "IMG", None, settings, cloud,
                FakeProvider("ollama", "qwen2.5vl", [_classification()]), asyncio.Lock(), budget,
            )

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIn("límite diario", ctx.exception.message)
        self.assertEqual(cloud.calls, [])


class ErrorMappingTests(unittest.TestCase):
    def _error(self, status: int, body=None) -> ProviderError:
        return error_from_response("gemini", httpx.Response(status, json=body or {"error": {"message": "detalle"}}))

    def test_status_codes_map_to_client_facing_errors(self):
        self.assertEqual(self._error(401).status_code, 502)
        self.assertEqual(self._error(404).status_code, 502)
        self.assertEqual(self._error(429).status_code, 503)
        self.assertEqual(self._error(402).status_code, 503)  # sin saldo (Anthropic)
        self.assertEqual(self._error(500).status_code, 502)

    def test_running_out_of_credit_is_not_reported_as_a_temporary_rate_limit(self):
        for code in ("credit_balance_exhausted", "insufficient_quota", "organization_spend_limit_exceeded"):
            error = self._error(429, {"error": {"message": "sin saldo", "code": code}})
            self.assertEqual(error.status_code, 503)
            self.assertIn("saldo", error.message)

        rate_limit = self._error(429, {"error": {"message": "muy rapido", "code": "slow_down"}})
        self.assertIn("límite de uso", rate_limit.message)

    def test_secrets_stay_in_the_log_not_in_the_client_message(self):
        error = self._error(401, {"error": {"message": "API key not valid: AIza-secreta"}})

        self.assertIn("AIza-secreta", error.log_detail)
        self.assertNotIn("AIza-secreta", error.message)


class PostJsonTests(unittest.IsolatedAsyncioTestCase):
    async def _post(self, handler, **kwargs):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await post_json(
                client, "gemini", "https://x.test/y", json={}, headers={}, timeout=5, retry_wait_s=0, **kwargs
            )

    async def test_retries_once_after_a_5xx(self):
        calls = []

        def handler(request):
            calls.append(1)
            return httpx.Response(503 if len(calls) == 1 else 200, json={"ok": True})

        response = await self._post(handler)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(calls), 2)

    async def test_client_errors_are_returned_without_retry(self):
        calls = []

        def handler(request):
            calls.append(1)
            return httpx.Response(429, json={"error": {"message": "cuota"}})

        response = await self._post(handler)

        self.assertEqual(response.status_code, 429)
        self.assertEqual(len(calls), 1)

    async def test_timeout_is_not_retried_and_maps_to_504(self):
        calls = []

        def handler(request):
            calls.append(1)
            raise httpx.ReadTimeout("lento", request=request)

        with self.assertRaises(ProviderError) as ctx:
            await self._post(handler)

        self.assertEqual(ctx.exception.status_code, 504)
        self.assertEqual(len(calls), 1)

    async def test_persistent_5xx_raises_after_the_retry(self):
        def handler(request):
            return httpx.Response(500, json={"error": {"message": "caido"}})

        with self.assertRaises(ProviderError) as ctx:
            await self._post(handler)

        self.assertEqual(ctx.exception.status_code, 502)


# ---------------------------------------------------------------------------
# Idioma en la salida
# ---------------------------------------------------------------------------

class LanguageOutputTests(unittest.TestCase):
    def test_english_blocks_get_english_labels_and_lang(self):
        elements = blocks_to_elements([{
            "tipo": "tabla", "idioma": "en", "contenido": "",
            "encabezados": ["Name", "Age"], "filas": [["Ann", "30"]],
        }])

        self.assertEqual(elements[0]["lang"], "en")
        self.assertIn("Table. 1 rows", elements[0]["content"])
        self.assertIn("Columns: Name; Age", elements[0]["content"])
        self.assertEqual(elements[1]["content"], "Row 1. Name: Ann; Age: 30")

    def test_visual_descriptions_are_always_spanish(self):
        elements = blocks_to_elements([{"tipo": "imagen", "idioma": "en", "contenido": "Un gato sobre una mesa."}])

        self.assertEqual(elements[0]["lang"], "es")

    def test_blocks_without_language_keep_the_previous_shape(self):
        elements = blocks_to_elements([{"tipo": "texto", "contenido": "Hola mundo."}])

        self.assertEqual(elements, [{"type": "Texto", "content": "Hola mundo."}])

    def test_every_line_of_a_multiline_block_keeps_its_prefix(self):
        from fastapi_backend.normalize import elements_to_description

        description = elements_to_description([
            {"type": "Texto", "content": "Actividad: Un día en el parque\nObserva la ilustración."},
            {"type": "Descripción Visual", "content": "Un parque con árboles."},
        ])

        self.assertEqual(
            description.split("\n"),
            [
                "[TEXTO] Actividad: Un día en el parque",
                "[TEXTO] Observa la ilustración.",
                "[IMAGEN] Un parque con árboles.",
            ],
        )

    def test_region_codes_are_normalized(self):
        elements = blocks_to_elements([{"tipo": "texto", "idioma": "en-US", "contenido": "Hello."}])

        self.assertEqual(elements[0]["lang"], "en")


# ---------------------------------------------------------------------------
# Pipeline hybrid
# ---------------------------------------------------------------------------

class FakeProvider:
    """Proveedor falso: devuelve respuestas en orden o lanza el error indicado."""

    def __init__(self, name: str, model: str, responses=(), delay: float = 0.0):
        self.name = name
        self.model = model
        self._responses = list(responses)
        self._delay = delay
        self.calls: list[dict] = []

    async def generate(self, client, prompt, image_b64, *, schema=None, max_tokens=4096,
                       temperature=0.0, repeat_penalty=None):
        self.calls.append({"prompt": prompt, "schema": schema, "max_tokens": max_tokens})
        if self._delay:
            await asyncio.sleep(self._delay)
        response = self._responses.pop(0) if len(self._responses) > 1 else self._responses[0]
        if isinstance(response, Exception):
            raise response
        return response


def _json_result(blocks: list[dict]) -> ModelResult:
    return ModelResult(text=json.dumps({"bloques": blocks}), finish_reason="STOP")


def _classification(**flags) -> ModelResult:
    page = {"tabla": False, "grafica": False, "diagrama": False, "imagen": False, "matematicas": False, "columnas": 1}
    page.update(flags)
    return ModelResult(text=json.dumps(page))


class HybridPipelineTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.settings = Settings(gemini_api_key="k", pipeline="hybrid")
        self.lock = asyncio.Lock()
        self.client = mock.Mock()  # los proveedores falsos no lo usan

    async def _run(self, cloud, local, settings=None):
        return await pipeline.run_pipeline(
            self.client, "IMG", None, settings or self.settings, cloud, local, self.lock
        )

    async def test_cloud_reads_the_page_and_ollama_only_detects(self):
        cloud = FakeProvider("gemini", "gemini-2.5-flash", [_json_result([
            {"tipo": "texto", "contenido": "Hola mundo.", "idioma": "es"},
        ])])
        local = FakeProvider("ollama", "qwen2.5vl", [_classification(columnas=2)])

        result = await self._run(cloud, local)

        self.assertEqual(result.provider, "gemini")
        self.assertEqual(result.model, "gemini-2.5-flash")
        self.assertEqual(result.detector, "ollama")
        self.assertEqual(result.elements, [{"type": "Texto", "content": "Hola mundo.", "lang": "es"}])
        self.assertEqual(result.page["columnas"], 2)
        self.assertIsNone(result.fallback_reason)
        self.assertEqual([step["name"] for step in result.steps], ["deteccion", "extraccion"])
        self.assertEqual(len(local.calls), 1)  # solo clasifica, no extrae
        self.assertEqual(local.calls[0]["max_tokens"], 120)

    async def test_detector_off_skips_ollama_and_infers_page_from_blocks(self):
        settings = Settings(gemini_api_key="k", detector="off")
        cloud = FakeProvider("gemini", "m", [_json_result([
            {"tipo": "tabla", "contenido": "Ventas", "encabezados": ["A"], "filas": [["1"]]},
        ])])
        local = FakeProvider("ollama", "qwen2.5vl", [_classification()])

        result = await self._run(cloud, local, settings)

        self.assertIsNone(result.detector)
        self.assertEqual(local.calls, [])
        self.assertTrue(result.page["tabla"])

    async def test_without_detector_the_log_still_shows_what_the_page_contains(self):
        settings = Settings(gemini_api_key="k", detector="off", fallback="off")
        cloud = FakeProvider("gemini", "m", [_json_result([
            {"tipo": "imagen", "contenido": "Un gato negro."},
        ])])
        local = FakeProvider("ollama", "qwen2.5vl", [_classification()])

        with self.assertLogs("aura", level="INFO") as logs:
            await self._run(cloud, local, settings)

        self.assertTrue(any("Clasificacion" in line and "'imagen': True" in line for line in logs.output))
        self.assertEqual(local.calls, [])  # Ollama no participa para nada

    async def test_followup_goes_to_the_cloud_when_detector_sees_an_undescribed_image(self):
        cloud = FakeProvider("gemini", "m", [
            _json_result([{"tipo": "texto", "contenido": "Solo texto."}]),
            ModelResult(text="Un gato negro sobre una mesa."),
        ])
        local = FakeProvider("ollama", "qwen2.5vl", [_classification(imagen=True)])

        result = await self._run(cloud, local)

        self.assertEqual(len(cloud.calls), 2)
        self.assertEqual(len(local.calls), 1)
        self.assertIn("Un gato negro sobre una mesa.", result.description)
        self.assertIn("llamada_enfocada", [step["name"] for step in result.steps])

    async def test_slow_detector_does_not_delay_the_answer(self):
        cloud = FakeProvider("gemini", "m", [_json_result([{"tipo": "texto", "contenido": "Listo."}])])
        local = FakeProvider("ollama", "qwen2.5vl", [_classification(imagen=True)], delay=5.0)

        with mock.patch.object(pipeline, "DETECT_GRACE_S", 0.05):
            result = await asyncio.wait_for(self._run(cloud, local), timeout=2.0)

        self.assertEqual(result.elements[0]["content"], "Listo.")
        detection = next(step for step in result.steps if step["name"] == "deteccion")
        self.assertEqual(detection["detail"], "omitida por tiempo")
        self.assertFalse(self.lock.locked())  # el detector cancelado libero el candado de la GPU

    async def test_detector_failure_does_not_break_the_request(self):
        cloud = FakeProvider("gemini", "m", [_json_result([{"tipo": "texto", "contenido": "Listo."}])])
        local = FakeProvider("ollama", "qwen2.5vl", [httpx.ConnectError("apagado")])

        result = await self._run(cloud, local)

        self.assertEqual(result.elements[0]["content"], "Listo.")
        self.assertEqual(result.steps[0]["detail"], "no disponible")

    async def test_free_text_answer_is_used_when_json_is_unreadable(self):
        cloud = FakeProvider("gemini", "m", [ModelResult(text="[TEXTO] Respuesta sin JSON.")])
        local = FakeProvider("ollama", "qwen2.5vl", [_classification()])

        result = await self._run(cloud, local)

        self.assertEqual(result.elements[0]["content"], "Respuesta sin JSON.")


class FallbackTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.lock = asyncio.Lock()
        self.client = mock.Mock()

    def _local(self) -> FakeProvider:
        return FakeProvider("ollama", "qwen2.5vl", [
            _classification(),                                               # clasificacion 1
            _classification(),                                               # clasificacion 2
            _json_result([{"tipo": "texto", "contenido": "Leido en local."}]),  # extraccion
        ])

    async def test_cloud_failure_falls_back_to_ollama_v4(self):
        settings = Settings(gemini_api_key="k")
        cloud = FakeProvider("gemini", "m", [ProviderError(503, "limite", log_detail="gemini respondio HTTP 429: cuota")])

        result = await pipeline.run_pipeline(
            mock.Mock(), "IMG", None, settings, cloud, self._local(), self.lock
        )

        self.assertEqual(result.provider, "ollama")
        self.assertEqual(result.elements[0]["content"], "Leido en local.")
        self.assertIn("cuota", result.fallback_reason)
        self.assertEqual(result.steps[0]["engine"], "gemini")
        self.assertEqual(result.steps[0]["detail"], "fallo")
        self.assertFalse(self.lock.locked())

    async def test_network_error_also_falls_back(self):
        settings = Settings(gemini_api_key="k")
        cloud = FakeProvider("gemini", "m", [httpx.ConnectError("sin internet")])

        result = await pipeline.run_pipeline(
            mock.Mock(), "IMG", None, settings, cloud, self._local(), self.lock
        )

        self.assertEqual(result.provider, "ollama")
        self.assertIsNotNone(result.fallback_reason)

    async def test_fallback_off_returns_the_provider_error(self):
        settings = Settings(gemini_api_key="k", fallback="off")
        cloud = FakeProvider("gemini", "m", [ProviderError(503, "limite")])

        with self.assertRaises(ProviderError) as ctx:
            await pipeline.run_pipeline(mock.Mock(), "IMG", None, settings, cloud, self._local(), self.lock)

        self.assertEqual(ctx.exception.status_code, 503)

    async def test_no_fallback_when_the_cloud_already_used_the_time_budget(self):
        # Presupuesto 0: cualquier fallo se considera tardio y no se repite toda la pagina en local.
        settings = Settings(gemini_api_key="k", time_budget_s=0.0)
        cloud = FakeProvider("gemini", "m", [ProviderError(504, "tardo", log_detail="sin respuesta")], delay=0.05)

        with self.assertRaises(ProviderError) as ctx:
            await pipeline.run_pipeline(mock.Mock(), "IMG", None, settings, cloud, self._local(), self.lock)

        self.assertEqual(ctx.exception.status_code, 504)

    async def test_network_error_without_fallback_becomes_a_503(self):
        settings = Settings(gemini_api_key="k", fallback="off")
        cloud = FakeProvider("gemini", "m", [httpx.ConnectError("sin internet")])

        with self.assertRaises(ProviderError) as ctx:
            await pipeline.run_pipeline(mock.Mock(), "IMG", None, settings, cloud, self._local(), self.lock)

        self.assertEqual(ctx.exception.status_code, 503)


class PipelineSelectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_without_cloud_provider_hybrid_setting_runs_v4(self):
        settings = Settings(pipeline="hybrid")  # sin clave => v4
        local = FakeProvider("ollama", "qwen2.5vl", [
            _classification(), _classification(), _json_result([{"tipo": "texto", "contenido": "Local."}]),
        ])

        result = await pipeline.run_pipeline(mock.Mock(), "IMG", None, settings, None, local, asyncio.Lock())

        self.assertEqual(result.provider, "ollama")
        self.assertEqual(result.detector, "ollama")
        self.assertEqual(result.elements[0]["content"], "Local.")

    async def test_v3_uses_a_single_call(self):
        settings = Settings(pipeline="v3")
        local = FakeProvider("ollama", "qwen2.5vl", [ModelResult(text="[TEXTO] Una linea.")])

        result = await pipeline.run_pipeline(mock.Mock(), "IMG", None, settings, None, local, asyncio.Lock())

        self.assertEqual(len(local.calls), 1)
        self.assertEqual(result.elements[0]["content"], "Una linea.")


if __name__ == "__main__":
    unittest.main()
