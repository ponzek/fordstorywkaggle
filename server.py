#!/usr/bin/env python3
"""
server.py -- Small local Flask server for "Beyond Ford" keeping API keys private
and powering the AI Chart Explainer & Best-Case Scenario (/api/explain).

Supports Google Gemini (default: gemini-3.5-flash-lite) and optional OpenAI fallback
(default: gpt-4o-mini), verifying every AI reply against live chart numbers.

Usage:
    1. Copy .env.example to .env and paste GEMINI_API_KEY (and/or OPENAI_API_KEY)
    2. python server.py
    3. Open http://127.0.0.1:5000/
"""
import json
import os
import pathlib

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
import requests

ROOT = pathlib.Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite"
GEMINI_FALLBACKS = [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3-flash-preview",
]
DEFAULT_OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")


def get_gemini_key() -> str:
    k = (os.getenv("GEMINI_API_KEY") or "").strip()
    return "" if not k or k == "your_gemini_api_key_here" else k


def get_openai_key() -> str:
    k = (os.getenv("OPENAI_API_KEY") or "").strip()
    return "" if not k or k == "your_openai_api_key_here" else k


def compact_summary(summary: dict) -> dict:
    """Keep prompt payload small and strictly numeric for sub-2s LLM replies."""
    spreads = [
        {
            "model": s.get("model"),
            "n": s.get("n"),
            "qualify": s.get("qualify"),
            "share": s.get("shareLabel"),
            "median": round(s["median"]) if s.get("median") is not None else None,
        }
        for s in (summary.get("spreads") or [])
    ]
    gaps = [
        {
            "model": g.get("model"),
            "gap": round(g["gap"]) if g.get("gap") is not None else None,
            "strataCount": g.get("strataCount"),
        }
        for g in (summary.get("gaps") or [])
    ]
    return {
        "source": summary.get("source"),
        "dateRange": summary.get("dateRange"),
        "poolCount": summary.get("poolCount"),
        "eligibleCount": summary.get("eligibleCount"),
        "nonFordCount": summary.get("nonFordCount"),
        "fordCount": summary.get("fordCount"),
        "atCapCount": summary.get("atCapCount"),
        "prevBudget": summary.get("prevBudget"),
        "budgetDelta": summary.get("budgetDelta"),
        "spreads": spreads,
        "gaps": gaps,
        "bestListing": summary.get("bestListing"),
        "bestShareAlt": summary.get("bestShareAlt"),
        "cheapestMedAlt": summary.get("cheapestMedAlt"),
        "bestReg": summary.get("bestReg"),
        "verifiedFacts": summary.get("verifiedFacts") or [],
    }


def build_prompt(view_title: str, question: str, filters: dict, compact: dict) -> str:
    return (
        "You are a clear, honest data storytelling assistant helping a first-time, budget-conscious "
        "U.S. used-car shopper understand charts comparing five compact SUVs (Ford Escape, Chevrolet Equinox, "
        "Honda CR-V, Toyota RAV4, Nissan Rogue).\n\n"
        f"Active View: {view_title}\n"
        f"User Question: {question}\n"
        f"Current Filters: {json.dumps(filters)}\n"
        f"Verified Chart Summary (USE ONLY THESE NUMBERS): {json.dumps(compact)}\n\n"
        "Rules:\n"
        "1. Only state counts, percentages, dollar figures, and vehicle details explicitly present in Verified Chart Summary.\n"
        "2. Explain plainly what the chart shows and what changed if prevBudget / budgetDelta is present.\n"
        "3. In `best_case_scenario`, recommend the best non-Ford option or concrete listing supported by the current numbers "
        "and explain one realistic trade-off (such as higher mileage, older year, or unknown condition) in `trade_off`.\n"
        "4. In `cited_facts`, list ONLY exact `id` strings from `verifiedFacts` that support your answer.\n"
        "5. Return ONLY valid JSON with these exact keys and types:\n"
        '{"headline":"string","what_changed":"string","best_case_scenario":"string","trade_off":"string","cited_facts":["fact_id"],"caveat":"string"}'
    )


def verify_parsed(parsed: dict, valid_fact_ids: set):
    if not isinstance(parsed, dict):
        return "Response is not a JSON object"
    cited = parsed.get("cited_facts") or []
    if not isinstance(cited, list) or any(cid not in valid_fact_ids for cid in cited):
        return "Model cited unverified fact IDs"
    for req_key in ("headline", "what_changed", "best_case_scenario", "trade_off", "caveat"):
        if not isinstance(parsed.get(req_key), str) or not parsed[req_key].strip():
            return f"Missing field: {req_key}"
    return None


def call_gemini(prompt: str, key: str, requested_model: str):
    candidates = [requested_model] + [m for m in GEMINI_FALLBACKS if m != requested_model]
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    last_err = None
    for model_name in candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        try:
            resp = requests.post(
                url,
                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                json=payload,
                timeout=12,
            )
            if resp.status_code in (404, 429, 503):
                last_err = f"{model_name} HTTP {resp.status_code}"
                continue
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text), model_name, None
        except Exception as exc:
            last_err = f"{model_name}: {type(exc).__name__}"
    return None, requested_model, last_err


def call_openai(prompt: str, key: str, model_name: str):
    payload = {
        "model": model_name,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "Return only valid JSON strictly matching the requested schema and numbers."},
            {"role": "user", "content": prompt},
        ],
    }
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        return json.loads(text), model_name, None
    except Exception as exc:
        return None, model_name, f"{model_name}: {type(exc).__name__}"


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    if filename.startswith(".") or ".env" in filename:
        return jsonify({"error": "Forbidden"}), 403
    return send_from_directory(ROOT, filename)


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "geminiConfigured": bool(get_gemini_key()),
        "openaiConfigured": bool(get_openai_key()),
        "model": DEFAULT_GEMINI_MODEL,
        "openaiModel": DEFAULT_OPENAI_MODEL,
        "providerPreference": (os.getenv("AI_PROVIDER") or "auto").strip().lower(),
    })


@app.post("/api/explain")
def explain():
    gem_key = get_gemini_key()
    oai_key = get_openai_key()
    if not gem_key and not oai_key:
        return jsonify({"ok": False, "error": "Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured in .env"}), 503

    body = request.get_json(silent=True) or {}
    view_title = str(body.get("viewTitle") or "Current view")
    question = str(body.get("question") or "Explain what this chart is saying and the best-case scenario.")
    filters = body.get("filters") or {}
    summary = body.get("summary") or {}
    compact = compact_summary(summary)
    valid_fact_ids = {f.get("id") for f in compact["verifiedFacts"] if isinstance(f, dict) and f.get("id")}
    prompt = build_prompt(view_title, question, filters, compact)

    pref = str(body.get("provider") or os.getenv("AI_PROVIDER") or "auto").strip().lower()
    order = ["openai", "gemini"] if pref == "openai" else ["gemini", "openai"]

    errors = []
    for prov in order:
        if prov == "gemini" and gem_key and pref != "openai":
            parsed, used_model, err = call_gemini(prompt, gem_key, str(body.get("model") or DEFAULT_GEMINI_MODEL).strip())
            if parsed is not None:
                v_err = verify_parsed(parsed, valid_fact_ids)
                if not v_err:
                    return jsonify({"ok": True, "provider": "gemini", "model": used_model, "explanation": parsed})
                errors.append(f"gemini verify: {v_err}")
            else:
                errors.append(f"gemini: {err}")

        if prov == "openai" and oai_key and pref != "gemini":
            parsed, used_model, err = call_openai(prompt, oai_key, DEFAULT_OPENAI_MODEL)
            if parsed is not None:
                v_err = verify_parsed(parsed, valid_fact_ids)
                if not v_err:
                    return jsonify({"ok": True, "provider": "openai", "model": used_model, "explanation": parsed})
                errors.append(f"openai verify: {v_err}")
            else:
                errors.append(f"openai: {err}")

    return jsonify({"ok": False, "error": "; ".join(errors) or "AI provider unavailable"}), 502


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    print(
        f"Serving Beyond Ford at http://127.0.0.1:{port}/ "
        f"(Gemini: {bool(get_gemini_key())}, OpenAI: {bool(get_openai_key())})"
    )
    app.run(host="127.0.0.1", port=port, debug=False)
