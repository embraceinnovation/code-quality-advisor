import asyncio
import json
import uuid
import logging
from typing import AsyncGenerator

from app.config import get_settings
from app.session_store import SessionData

logger = logging.getLogger(__name__)

# File extensions considered analyzable
_ANALYZABLE_EXTENSIONS = {
    # Salesforce
    ".cls", ".trigger", ".page", ".component", ".cmp", ".evt", ".app",
    # Web
    ".js", ".ts", ".jsx", ".tsx", ".vue", ".html", ".css", ".scss",
    # Backend
    ".py", ".java", ".rb", ".php", ".go", ".rs", ".cs", ".kt", ".swift",
    # Config / build (light analysis only)
    ".json", ".yaml", ".yml", ".toml",
}

_SKIP_PATHS = {
    "node_modules", "dist", "build", "__pycache__", ".git",
    "vendor", "target", "bin", "obj", ".venv", "venv",
}

_SKIP_FILENAMES = {
    "package-lock.json", "yarn.lock", "poetry.lock", "Pipfile.lock",
    "Cargo.lock", "composer.lock", "Gemfile.lock",
}


def _should_analyze(file: dict, size_limit_kb: int) -> bool:
    path = file.get("path", "")
    filename = path.split("/")[-1]

    if filename in _SKIP_FILENAMES:
        return False
    if any(part in _SKIP_PATHS for part in path.split("/")):
        return False
    if filename.endswith(".min.js") or filename.endswith(".bundle.js"):
        return False
    if not any(path.endswith(ext) for ext in _ANALYZABLE_EXTENSIONS):
        return False
    if file.get("size", 0) > size_limit_kb * 1024:
        return False
    return True


def _language_from_path(path: str) -> str:
    ext_map = {
        ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
        ".jsx": "JavaScript (React)", ".tsx": "TypeScript (React)",
        ".vue": "Vue", ".java": "Java", ".rb": "Ruby", ".php": "PHP",
        ".go": "Go", ".rs": "Rust", ".cs": "C#", ".kt": "Kotlin",
        ".swift": "Swift", ".cls": "Apex", ".trigger": "Apex (Trigger)",
        ".page": "Visualforce", ".component": "Visualforce", ".cmp": "Aura",
        ".html": "HTML", ".css": "CSS", ".scss": "SCSS",
        ".yaml": "YAML", ".yml": "YAML", ".json": "JSON", ".toml": "TOML",
    }
    for ext, lang in ext_map.items():
        if path.endswith(ext):
            return lang
    return "Unknown"


_ANALYSIS_SYSTEM_PROMPT = """You are a senior software engineer performing a thorough code quality review.
You respond ONLY with a valid JSON array — no prose, no markdown fences, no explanation.

Each element must have exactly these keys:
  "line_number": integer (the primary line the issue is on),
  "category": string (e.g. "Governor Limits", "Error Handling", "Security", "Documentation", "Performance", "Testing", "Code Style", "Bulkification", "Naming", "Dead Code"),
  "severity": one of "critical", "warning", or "suggestion",
  "issue": string (max 120 chars — what is wrong),
  "recommendation": string (max 300 chars — exactly how to fix it)

Severity guide:
  critical   = security vulnerability, data loss risk, bug that will definitely trigger in production, Salesforce governor limit violation
  warning    = performance problem, deprecated API, missing error handling, missing bulkification, poor testability
  suggestion = style, naming, documentation gap, minor improvement

For Salesforce Apex specifically, flag:
  - SOQL queries inside loops (critical)
  - DML inside loops (critical)
  - Missing null checks on SObject fields (warning)
  - Missing WITH SECURITY_ENFORCED or WITH USER_MODE in SOQL (warning)
  - Logic directly in trigger body instead of a handler class (warning)
  - Multiple triggers on the same object (warning)
  - Test methods with no assertions (warning)
  - Missing Test.startTest()/stopTest() (suggestion)
  - Hardcoded IDs or record type names (critical)

For LWC specifically, flag:
  - Missing error handling on @wire or imperative Apex calls (warning)
  - Improper use of @track on non-reactive properties (suggestion)
  - Memory leaks from event listeners not removed in disconnectedCallback (warning)

Skip cosmetic whitespace issues. Skip lines with no meaningful improvement.
If the file has no issues, return [].
Respond with the JSON array only."""

_FIX_SYSTEM_PROMPT = """You are a senior software engineer generating a precise code fix.
Given a file's content and a specific issue with its recommendation, return ONLY the corrected
version of the affected lines as a plain code block (no markdown, no explanation).
If the fix requires changes across multiple non-contiguous lines, return all changed lines
with their correct line numbers in this JSON format:
[{"line": <int>, "new_content": "<replacement line>"}]
Otherwise return the replacement code block directly."""

_REPORT_SYSTEM_PROMPT = """You are a senior engineering mentor writing a friendly, practical improvement guide.
Use markdown with headers, bullet points, and short illustrative code examples.
Do NOT reference specific file names or line numbers — write general, reusable best practices.
Tone: encouraging and constructive, never condescending.
Structure the document with these sections:
1. Overview — a brief, warm summary of what was found
2. Most Common Issues — explain each category found and how to avoid it next time
3. Recommended Tools & Linters — specific to the detected tech stack
4. Code Review Checklist — actionable items for future PRs
5. Further Reading — relevant docs, guides, or books

Keep it under 1500 words. Use real code examples where they help."""


# Base URLs for OpenAI-compatible providers
_OPENAI_COMPAT_BASE_URLS = {
    "groq":      "https://api.groq.com/openai/v1",
    "mistral":   "https://api.mistral.ai/v1",
    "deepseek":  "https://api.deepseek.com/v1",
    "cerebras":  "https://api.cerebras.ai/v1",
    "together":  "https://api.together.xyz/v1",
    "ollama":    "http://localhost:11434/v1",
}


async def _call_llm(
    provider: str,
    model: str,
    api_key: str,
    system_prompt: str,
    user_message: str,
    max_tokens: int,
) -> str:
    """Dispatch to the correct LLM provider and return the text response."""

    if provider == "anthropic":
        import anthropic as _anthropic
        ai = _anthropic.AsyncAnthropic(api_key=api_key)
        msg = await ai.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return msg.content[0].text

    elif provider == "google":
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        loop = asyncio.get_event_loop()

        def _generate():
            gemini = genai.GenerativeModel(
                model_name=model,
                system_instruction=system_prompt,
            )
            return gemini.generate_content(user_message).text

        return await loop.run_in_executor(None, _generate)

    elif provider in ("openai", "groq", "mistral", "deepseek", "cerebras", "together", "ollama"):
        from openai import AsyncOpenAI

        base_url = _OPENAI_COMPAT_BASE_URLS.get(provider)
        # Ollama doesn't need a real key; use a placeholder so the client doesn't complain
        effective_key = api_key if api_key else ("ollama" if provider == "ollama" else api_key)
        client_kwargs: dict = {"api_key": effective_key}
        if base_url:
            client_kwargs["base_url"] = base_url

        ai = AsyncOpenAI(**client_kwargs)
        resp = await ai.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        return resp.choices[0].message.content

    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


# Concurrency limits per provider — free tiers have low RPM ceilings
_PROVIDER_CONCURRENCY = {
    "groq":     2,   # 30 RPM free tier — keep well under
    "cerebras": 2,   # similar free tier constraints
    "mistral":  2,
    "deepseek": 3,
    "together": 3,
    "ollama":   2,   # local CPU/GPU — don't overwhelm
    "google":   4,
    "openai":   5,
    "anthropic": 5,
}
_DEFAULT_CONCURRENCY = 3


def _extract_retry_after(exc: Exception) -> float:
    """Pull retry-after seconds from a 429 exception if available."""
    msg = str(exc)
    # httpx / openai SDK often includes 'retry-after: N' or 'please try again in Xs'
    import re
    m = re.search(r'retry.after[:\s]+([0-9.]+)', msg, re.IGNORECASE)
    if m:
        return float(m.group(1)) + 1
    m = re.search(r'try again in ([0-9.]+)s', msg, re.IGNORECASE)
    if m:
        return float(m.group(1)) + 1
    return 60.0  # safe default: wait a full minute


async def analyze_files(
    client,
    session: SessionData,
    files: list[dict],
    frameworks: list[str],
) -> AsyncGenerator[dict, None]:
    settings = get_settings()
    provider = session.llm_provider
    concurrency = _PROVIDER_CONCURRENCY.get(provider, _DEFAULT_CONCURRENCY)
    semaphore = asyncio.Semaphore(concurrency)
    size_limit = settings.claude_file_size_limit_kb

    model = session.llm_model
    api_key = session.llm_api_key or settings.anthropic_api_key
    max_tokens = settings.claude_max_tokens

    analyzable = [f for f in files if _should_analyze(f, size_limit)]
    frameworks_str = ", ".join(frameworks) if frameworks else "general"

    # Queue lets worker tasks push rate-limit notifications to the generator
    notify_queue: asyncio.Queue = asyncio.Queue()

    async def analyze_one(file: dict) -> dict:
        path = file["path"]
        async with semaphore:
            try:
                content = await client.get_file_content(
                    session, session.owner, session.repo, session.branch, path
                )
                if not content.strip():
                    return {"event": "progress", "file": path, "changes": []}

                lang = _language_from_path(path)
                # Groq and other providers with small context windows: truncate content
                _CHAR_LIMITS = {
                    "groq": 12000, "cerebras": 12000, "mistral": 16000,
                    "deepseek": 24000, "together": 16000,
                }
                char_limit = _CHAR_LIMITS.get(provider)
                if char_limit and len(content) > char_limit:
                    content = content[:char_limit] + "\n\n# ... [truncated for length]"
                user_msg = (
                    f"Framework context: {frameworks_str}\n"
                    f"File: {path}\n"
                    f"Language: {lang}\n\n"
                    f"```{lang.lower().split()[0]}\n{content}\n```"
                )

                for attempt in range(5):
                    try:
                        raw = await _call_llm(provider, model, api_key, _ANALYSIS_SYSTEM_PROMPT, user_msg, max_tokens)
                        issues = json.loads(raw.strip())
                        changes = [
                            {
                                "id": str(uuid.uuid4()),
                                "file_path": path,
                                "line_number": issue.get("line_number", 0),
                                "category": issue.get("category", "General"),
                                "severity": issue.get("severity", "suggestion"),
                                "issue": issue.get("issue", ""),
                                "recommendation": issue.get("recommendation", ""),
                            }
                            for issue in issues
                            if isinstance(issue, dict)
                        ]
                        # Clear any rate-limit status now that we succeeded
                        await notify_queue.put({"event": "rate_limit_clear"})
                        return {"event": "progress", "file": path, "changes": changes}
                    except json.JSONDecodeError:
                        logger.warning(f"JSON parse failed for {path}, attempt {attempt + 1}")
                        await asyncio.sleep(2 ** attempt)
                    except Exception as e:
                        if "429" in str(e) or "rate" in str(e).lower():
                            wait = _extract_retry_after(e)
                            logger.warning(f"Rate limit on {path}, waiting {wait:.0f}s (attempt {attempt + 1})")
                            await notify_queue.put({
                                "event": "rate_limit",
                                "wait": round(wait),
                                "file": path,
                                "attempt": attempt + 1,
                            })
                            await asyncio.sleep(wait)
                        else:
                            raise

                return {"event": "progress", "file": path, "changes": []}

            except Exception as e:
                logger.error(f"Error analyzing {path}: {e}")
                return {"event": "error", "file": path, "message": str(e)}

    tasks = [asyncio.create_task(analyze_one(f)) for f in analyzable]
    for coro in asyncio.as_completed(tasks):
        # Drain any queued rate-limit notifications before yielding the next result
        while not notify_queue.empty():
            yield notify_queue.get_nowait()
        result = await coro
        while not notify_queue.empty():
            yield notify_queue.get_nowait()
        yield result


async def generate_fix(session: SessionData, file_content: str, change: dict) -> str:
    settings = get_settings()
    lang = _language_from_path(change.get("file_path", ""))
    user_msg = (
        f"File: {change['file_path']}\n"
        f"Language: {lang}\n"
        f"Issue at line {change['line_number']}: {change['issue']}\n"
        f"Recommendation: {change['recommendation']}\n\n"
        f"Full file content:\n```{lang.lower().split()[0]}\n{file_content}\n```\n\n"
        "Provide the fix."
    )
    return await _call_llm(
        session.llm_provider,
        session.llm_model,
        session.llm_api_key or settings.anthropic_api_key,
        _FIX_SYSTEM_PROMPT,
        user_msg,
        2048,
    )


async def generate_report(session: SessionData) -> str:
    settings = get_settings()

    category_counts: dict[str, list] = {}
    for c in session.changes:
        cat = c.get("category", "General")
        category_counts.setdefault(cat, []).append(c)

    summary = {
        cat: {
            "count": len(items),
            "sample_issues": [i["issue"] for i in items[:3]],
        }
        for cat, items in category_counts.items()
    }

    user_msg = (
        f"Tech stack: {', '.join(session.selected_frameworks) or 'general'}\n"
        f"Repository: {session.owner}/{session.repo}\n"
        f"Total issues found: {len(session.changes)}\n\n"
        f"Issues by category:\n{json.dumps(summary, indent=2)}\n\n"
        "Write the 'Ways to Improve Next Time' guide."
    )

    return await _call_llm(
        session.llm_provider,
        session.llm_model,
        session.llm_api_key or settings.anthropic_api_key,
        _REPORT_SYSTEM_PROMPT,
        user_msg,
        4096,
    )
