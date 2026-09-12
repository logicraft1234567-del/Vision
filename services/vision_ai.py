"""
services/vision_ai.py

Single source of truth for talking to Groq. Every VISION AI feature
(project review, pitch improvement, roadmap, investor analysis, outreach
writing, chat) goes through ask_vision_ai() / ask_vision_ai_json() so the
API key, model choice, and error handling only live in one place.

Note on openai/gpt-oss-120b: it's a reasoning model, so part of every
max_tokens budget is spent on internal reasoning before it writes the
actual answer. In JSON mode that can truncate the JSON mid-object, which
Groq's strict validator then rejects outright (json_validate_failed)
instead of handing back partial text. We handle that below by (a) asking
for low reasoning effort on JSON calls to leave more budget for output,
(b) giving JSON calls a bigger token budget, and (c) trying to repair or
retry a truncated response before giving up.
"""

import os
import re
import ast
import json

from groq import Groq

GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

_client = None


def _get_client():
    """Lazily construct the Groq client so a missing key doesn't crash the
    app at import time — only when VISION AI is actually used."""
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Add it to your .env file "
                "(GROQ_API_KEY=your_key_here) in the project root and "
                "restart the server."
            )
        _client = Groq(api_key=api_key)
    return _client


SYSTEM_PROMPT = (
    "You are VISION AI, the built-in startup copilot inside the VISION "
    "platform, where builders, investors, and companies connect around real "
    "projects. You are sharp, encouraging, and concrete — never generic "
    "filler. You never invent facts, numbers, traction, or user data that "
    "hasn't been given to you; if information is missing, say so plainly "
    "instead of guessing. Keep answers focused and practical."
)

# Applied to every *free-text* (non-JSON) reply. These render inside a
# narrow ~380px chat panel or a chat message bubble, so anything wider than
# plain text (big tables, deep nesting, headers) shows up broken or as a
# wall of stray punctuation. Keeping the model to plain, short-form text is
# far more reliable than trying to render arbitrary markdown afterwards.
CHAT_FORMATTING_RULES = (
    "\n\nFormatting rules for this reply — it renders in a narrow chat "
    "bubble, not a document:\n"
    "- Plain conversational text. No markdown tables, no '|' pipes.\n"
    "- No headers (#, ##) and no horizontal rules.\n"
    "- Bold only for a handful of genuinely key terms, using **word**.\n"
    "- If you need to list things, use short '- ' bullet lines, one idea "
    "each — never a table of columns.\n"
    "- Prefer 2-5 short paragraphs or a short bullet list over one long "
    "block of text. Keep the whole reply under ~180 words unless the "
    "person clearly asked for an in-depth breakdown."
)


def _is_json_validate_error(exc):
    code = getattr(exc, "code", None)
    if code == "json_validate_failed":
        return True
    body = getattr(exc, "body", None)
    if isinstance(body, dict) and body.get("error", {}).get("code") == "json_validate_failed":
        return True
    return "json_validate_failed" in str(exc)


def _extract_failed_generation(exc):
    """Groq includes the (invalid) text it generated in the error body —
    pull it out so we can try to repair it instead of throwing it away."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        gen = body.get("error", {}).get("failed_generation")
        if gen:
            return gen
    match = re.search(r"-\s*(\{.*\})\s*$", str(exc), re.DOTALL)
    if match:
        try:
            data = ast.literal_eval(match.group(1))
            return data.get("error", {}).get("failed_generation")
        except Exception:
            return None
    return None


def _try_repair_json(text):
    """Best-effort repair for JSON truncated mid-string/array/object: closes
    whatever braces/brackets/quotes were left open, in the right order."""
    if not text:
        return None
    text = text.strip()
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass

    closers = {"{": "}", "[": "]"}
    openers = {"}", "]"}
    stack = []
    out = []
    in_string = False
    escape = False
    for ch in text:
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
        elif ch in closers:
            stack.append(closers[ch])
            out.append(ch)
        elif ch in openers:
            # A closing char that doesn't match the innermost open structure
            # means something inside was truncated — insert its missing
            # closer(s) first, then consume this one against what's left.
            while stack and stack[-1] != ch:
                out.append(stack.pop())
            if stack and stack[-1] == ch:
                stack.pop()
            out.append(ch)
        else:
            out.append(ch)

    repaired = "".join(out)
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)  # trailing commas before a close
    if in_string:
        repaired += '"'
    repaired += "".join(reversed(stack))  # anything still open at the very end

    try:
        return json.loads(repaired)
    except (json.JSONDecodeError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Result sanitization
#
# The model occasionally hands back a JSON object where a field that should
# be a clean list of strings is instead a single string containing several
# comma-separated, quoted fragments (e.g. missing_info becomes the literal
# text  "item one","item two","item three"  instead of a real array), or a
# stray leftover bracket from a truncated/repaired array. Left alone, that
# renders in the UI as a raw, quote-and-comma-riddled mess. Everything below
# normalizes a parsed result before it's ever sent to the browser, so the
# front end can always trust that a "list-shaped" field really is a list.
# ---------------------------------------------------------------------------

_STRAY_EDGE_CHARS = ' \t\n"\'[]{}'


def _clean_list_item(item):
    """Strip stray quotes/brackets/whitespace left over from a malformed
    array-as-string so individual list entries read cleanly."""
    text = str(item).strip().strip(_STRAY_EDGE_CHARS).strip()
    # Collapse an item that still has internal `","` joins (nested failure).
    if '","' in text:
        return [p.strip().strip(_STRAY_EDGE_CHARS).strip() for p in text.split('","') if p.strip()]
    return text


def _coerce_string_list(value):
    """Turn `value` into a clean list[str], however it actually arrived."""
    if value is None:
        return []

    if isinstance(value, list):
        items = []
        for entry in value:
            cleaned = _clean_list_item(entry)
            if isinstance(cleaned, list):
                items.extend(c for c in cleaned if c)
            elif cleaned:
                items.append(cleaned)
        return items

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        # It might actually be a valid (or almost-valid) JSON array as text.
        if text.startswith("["):
            parsed = _try_repair_json(text)
            if isinstance(parsed, list):
                return _coerce_string_list(parsed)
        # Most common failure mode: `"a","b","c"` with the brackets missing
        # entirely, or trailing/leading bracket debris from a bad repair.
        quoted = re.findall(r'"([^"]+)"', text)
        if len(quoted) > 1:
            return [q.strip() for q in quoted if q.strip()]
        # Fall back to splitting on newlines, then semicolons/commas.
        for sep in ["\n", ";", ","]:
            if sep in text:
                parts = [p.strip().strip(_STRAY_EDGE_CHARS).strip("- ").strip()
                         for p in text.split(sep)]
                parts = [p for p in parts if p]
                if len(parts) > 1:
                    return parts
        cleaned = text.strip(_STRAY_EDGE_CHARS).strip()
        return [cleaned] if cleaned else []

    return [str(value)]


def _dedupe_keys_case_insensitive(data):
    """If the model emits both `suggestions` and `Suggestions`, keep whichever
    value is more useful (a non-empty one, preferring an already-real list)
    instead of showing both fields as separate, half-empty cards."""
    if not isinstance(data, dict):
        return data

    buckets = {}
    order = []
    for key, value in data.items():
        lower = key.lower()
        if lower not in buckets:
            order.append(lower)
            buckets[lower] = (key, value)
        else:
            existing_key, existing_value = buckets[lower]

            def _score(v):
                if isinstance(v, list):
                    return 2 + (1 if v else 0)
                if isinstance(v, str):
                    return 1 if v.strip() else 0
                return 1 if v else 0

            if _score(value) > _score(existing_value):
                buckets[lower] = (key, value)

    return {buckets[lower][0]: buckets[lower][1] for lower in order}


# Field names that should always end up as list[str] in the payloads our
# prompts ask for, across every VISION AI action.
_LIST_FIELDS = {
    "strengths", "weaknesses", "missing_info", "suggestions",
    "mvp", "beta", "launch",
    "biggest_risks", "biggest_opportunities", "suggested_questions",
    "questions",
    "critical_risks", "market_risks", "execution_risks",
    "legal_or_ethical_risks", "how_to_derisk",
    "growth_levers", "milestones", "partnership_ideas", "warning_signs_to_watch",
}


def sanitize_json_result(data):
    """Normalize a parsed VISION AI JSON result before it reaches the API
    response: dedupe case-variant keys and coerce known list fields (plus
    anything that merely *looks* like a mis-encoded list) into real lists."""
    if not isinstance(data, dict):
        return data

    data = _dedupe_keys_case_insensitive(data)

    cleaned = {}
    for key, value in data.items():
        looks_like_list_string = isinstance(value, str) and ('","' in value or value.strip().startswith("["))
        is_list_of_objects = isinstance(value, list) and value and all(isinstance(v, dict) for v in value)
        if is_list_of_objects:
            # Structured list (e.g. find_matches' investor/company objects) —
            # leave as-is. The string-coercion path below is only meant to
            # repair a list that should have been plain strings.
            cleaned[key] = value
        elif key.lower() in _LIST_FIELDS or isinstance(value, list) or looks_like_list_string:
            cleaned[key] = _coerce_string_list(value)
        elif isinstance(value, str):
            cleaned[key] = value.strip().strip('"').strip()
        else:
            cleaned[key] = value
    return cleaned


def ask_vision_ai(prompt, context=None, json_mode=False, max_tokens=None, _retry=True):
    """
    Send `prompt` to Groq and return the raw text of the response.

    `context` is an optional dict describing who's asking and what they're
    looking at (role, current page, project fields, profile info). It's
    folded into the system message so every answer is grounded in the real
    session instead of being a blind guess.

    `json_mode` asks the model to return a single JSON object with no
    markdown or commentary, so the caller can parse it directly.
    """
    client = _get_client()

    if max_tokens is None:
        max_tokens = 2500 if json_mode else 1200

    system_message = SYSTEM_PROMPT
    if context:
        system_message += "\n\nContext about the current user/session:\n" + json.dumps(context, default=str)
    if json_mode:
        system_message += (
            "\n\nRespond with ONLY a single valid JSON object. No markdown, "
            "no code fences, no commentary before or after it. Every field "
            "that is a list MUST be a real JSON array of short plain-text "
            "strings — e.g. [\"first point\", \"second point\"] — never a "
            "single string with the items separated by commas or quotes, "
            "and never markdown/bullets inside the array. Keep list items "
            "short so the whole object stays compact."
        )
    else:
        system_message += CHAT_FORMATTING_RULES

    kwargs = dict(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt},
        ],
        max_tokens=max_tokens,
        temperature=0.6,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
        kwargs["reasoning_effort"] = "low"  # leave more of the token budget for the actual JSON

    try:
        completion = client.chat.completions.create(**kwargs)
        return completion.choices[0].message.content
    except Exception as exc:
        if json_mode and _is_json_validate_error(exc):
            failed_text = _extract_failed_generation(exc)
            repaired = _try_repair_json(failed_text) if failed_text else None
            if repaired is not None:
                return json.dumps(repaired)
            if _retry:
                # Likely a truncation — retry once with a bigger budget.
                return ask_vision_ai(
                    prompt, context=context, json_mode=json_mode,
                    max_tokens=min(max_tokens * 2, 6000), _retry=False,
                )
        raise


def ask_vision_ai_json(prompt, context=None, max_tokens=None):
    """Same as ask_vision_ai(json_mode=True) but parses the result.

    Falls back to {"raw": <text>} if the model ever returns malformed JSON,
    so a parsing hiccup never turns into a 500 for the user.
    """
    raw = ask_vision_ai(prompt, context=context, json_mode=True, max_tokens=max_tokens)
    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        parsed = _try_repair_json(cleaned)
        if parsed is None:
            return {"raw": raw}
    return sanitize_json_result(parsed)