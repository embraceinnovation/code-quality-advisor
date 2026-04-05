"""
LLM recommendation engine — scores providers against detected frameworks.
All data lives in llm_scores.json; no LLM calls required.
"""
import json
import os
from functools import lru_cache

_SCORES_PATH = os.path.join(os.path.dirname(__file__), "llm_scores.json")


@lru_cache(maxsize=1)
def _load_scores() -> dict:
    with open(_SCORES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# Human-readable reason templates keyed by provider
_REASON_TEMPLATES = {
    "anthropic": "Strongest on {top_frameworks}. Claude excels at Salesforce and complex enterprise patterns.",
    "openai":    "Excellent on {top_frameworks}. GPT-4o leads on enterprise stacks and Next.js.",
    "deepseek":  "Top-rated for {top_frameworks}. DeepSeek has deep systems-language and Python training.",
    "google":    "Best fit for {top_frameworks}. Gemini leads on Flutter/Dart and Angular.",
    "groq":      "Free tier — solid generalist for {top_frameworks}. Fast inference, lower Salesforce depth.",
    "mistral":   "Free tier — good coverage of {top_frameworks}. Strong on PHP/Laravel.",
    "cerebras":  "Free tier — ultra-fast inference for {top_frameworks}. Best for large repos on a budget.",
    "ollama":    "Runs locally — no API cost or data egress. Good generalist for {top_frameworks}.",
}


def _framework_label(fid: str) -> str:
    labels = {
        "salesforce_apex": "Apex", "salesforce_lwc": "LWC", "salesforce_aura": "Aura",
        "salesforce_visualforce": "Visualforce", "react": "React", "vue": "Vue",
        "angular": "Angular", "nextjs": "Next.js", "django": "Django",
        "fastapi": "FastAPI", "flask": "Flask", "spring": "Spring/Java",
        "rails": "Rails", "laravel": "Laravel", "dotnet": ".NET/C#",
        "go": "Go", "rust": "Rust", "node": "Node.js",
        "react_native": "React Native", "flutter": "Flutter", "python": "Python",
    }
    return labels.get(fid, fid)


def recommend_llms(framework_ids: list[str], top_n: int = 3) -> list[dict]:
    """
    Score all providers against the detected frameworks and return
    the top_n ranked with a score and human-readable reason.
    """
    data = _load_scores()
    providers = data["providers"]
    tier_bonus = data.get("tier_bonus", {})

    if not framework_ids:
        # No frameworks detected — return providers in tier order
        framework_ids = []

    results = []
    for provider_id, scores in providers.items():
        if not framework_ids:
            avg = 7.0
            top_fw: list[str] = []
        else:
            fw_scores = [(fid, scores.get(fid, 5)) for fid in framework_ids]
            avg = sum(s for _, s in fw_scores) / len(fw_scores)
            # Find the frameworks where this provider scores highest
            top_fw = [fid for fid, s in sorted(fw_scores, key=lambda x: -x[1])[:3]]

        total = avg + tier_bonus.get(provider_id, 0)

        # Build reason string
        fw_labels = ", ".join(_framework_label(f) for f in top_fw) if top_fw else "general codebases"
        template = _REASON_TEMPLATES.get(provider_id, "Good fit for {top_frameworks}.")
        reason = template.format(top_frameworks=fw_labels)

        results.append({
            "provider": provider_id,
            "display": scores.get("display", provider_id),
            "score": round(total, 2),
            "reason": reason,
        })

    results.sort(key=lambda r: -r["score"])
    return results[:top_n]
