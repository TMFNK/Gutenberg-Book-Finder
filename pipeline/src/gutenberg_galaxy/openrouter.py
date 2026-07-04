import json
import os
import time

import httpx

URL = "https://openrouter.ai/api/v1/chat/completions"


def chat_json(prompt: str, max_retries: int = 3, validate=None):
    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b")
    headers = {"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
               "HTTP-Referer": "https://github.com/TMFNK/Gutenberg-Galaxy",
               "X-Title": "Gutenberg Galaxy"}
    body = {"model": model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"}}
    last = None
    for attempt in range(max_retries):
        try:
            r = httpx.post(URL, json=body, headers=headers, timeout=120)
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            return validate(parsed) if validate else parsed
        except (httpx.HTTPError, json.JSONDecodeError, KeyError,
                ValueError, TypeError) as e:
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"OpenRouter failed after {max_retries} tries: {last}")
