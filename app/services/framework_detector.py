from dataclasses import dataclass


@dataclass
class Framework:
    id: str
    name: str
    category: str
    color: str
    description: str


# Each signature: files/dirs/extensions that imply the framework
_SIGNATURES = [
    # ── Salesforce ────────────────────────────────────────────────────────────
    {
        "id": "salesforce_apex",
        "name": "Salesforce Apex",
        "category": "salesforce",
        "color": "blue",
        "description": "Apex classes and triggers",
        "match_files": ["sfdx-project.json"],
        "match_extensions": [".cls", ".trigger"],
        "match_dirs": ["force-app"],
    },
    {
        "id": "salesforce_lwc",
        "name": "Lightning Web Components",
        "category": "salesforce",
        "color": "sky",
        "description": "LWC components",
        "match_files": [],
        "match_extensions": [],
        "match_dirs": ["lwc"],
    },
    {
        "id": "salesforce_aura",
        "name": "Aura Components",
        "category": "salesforce",
        "color": "indigo",
        "description": "Salesforce Aura components",
        "match_files": [],
        "match_extensions": [".cmp", ".evt", ".app"],
        "match_dirs": ["aura"],
    },
    {
        "id": "salesforce_visualforce",
        "name": "Visualforce",
        "category": "salesforce",
        "color": "purple",
        "description": "Visualforce pages and components",
        "match_files": [],
        "match_extensions": [".page", ".component"],
        "match_dirs": [],
    },
    # ── Frontend ──────────────────────────────────────────────────────────────
    {
        "id": "react",
        "name": "React",
        "category": "frontend",
        "color": "cyan",
        "description": "React component library",
        "match_files": [],
        "match_extensions": [".jsx", ".tsx"],
        "match_dirs": [],
    },
    {
        "id": "vue",
        "name": "Vue.js",
        "category": "frontend",
        "color": "emerald",
        "description": "Vue.js framework",
        "match_files": [],
        "match_extensions": [".vue"],
        "match_dirs": [],
    },
    {
        "id": "angular",
        "name": "Angular",
        "category": "frontend",
        "color": "red",
        "description": "Angular framework",
        "match_files": ["angular.json"],
        "match_extensions": [],
        "match_dirs": [],
    },
    {
        "id": "nextjs",
        "name": "Next.js",
        "category": "frontend",
        "color": "zinc",
        "description": "Next.js React framework",
        "match_files": ["next.config.js", "next.config.ts", "next.config.mjs"],
        "match_extensions": [],
        "match_dirs": [],
    },
    # ── Backend ───────────────────────────────────────────────────────────────
    {
        "id": "django",
        "name": "Django",
        "category": "backend",
        "color": "green",
        "description": "Django web framework",
        "match_files": ["manage.py"],
        "match_extensions": [],
        "match_dirs": [],
    },
    {
        "id": "fastapi",
        "name": "FastAPI",
        "category": "backend",
        "color": "teal",
        "description": "FastAPI web framework",
        "match_files": [],
        "match_extensions": [],
        "match_dirs": [],
        # Detected via requirements.txt content — handled separately
    },
    {
        "id": "flask",
        "name": "Flask",
        "category": "backend",
        "color": "amber",
        "description": "Flask web framework",
        "match_files": [],
        "match_extensions": [],
        "match_dirs": [],
    },
    {
        "id": "spring",
        "name": "Spring / Java",
        "category": "backend",
        "color": "lime",
        "description": "Spring Boot / Maven / Gradle",
        "match_files": ["pom.xml", "build.gradle", "build.gradle.kts"],
        "match_extensions": [".java"],
        "match_dirs": ["src/main/java"],
    },
    {
        "id": "rails",
        "name": "Ruby on Rails",
        "category": "backend",
        "color": "rose",
        "description": "Rails web framework",
        "match_files": ["Gemfile", "Rakefile"],
        "match_extensions": [".rb"],
        "match_dirs": ["app/controllers", "app/models"],
    },
    {
        "id": "laravel",
        "name": "Laravel / PHP",
        "category": "backend",
        "color": "orange",
        "description": "Laravel PHP framework",
        "match_files": ["artisan", "composer.json"],
        "match_extensions": [".php"],
        "match_dirs": ["app/Http/Controllers"],
    },
    {
        "id": "dotnet",
        "name": ".NET / C#",
        "category": "backend",
        "color": "violet",
        "description": ".NET / C# project",
        "match_files": [],
        "match_extensions": [".csproj", ".cs", ".sln"],
        "match_dirs": [],
    },
    {
        "id": "go",
        "name": "Go",
        "category": "backend",
        "color": "sky",
        "description": "Go language project",
        "match_files": ["go.mod"],
        "match_extensions": [".go"],
        "match_dirs": [],
    },
    {
        "id": "rust",
        "name": "Rust",
        "category": "backend",
        "color": "orange",
        "description": "Rust language project",
        "match_files": ["Cargo.toml"],
        "match_extensions": [".rs"],
        "match_dirs": [],
    },
    {
        "id": "node",
        "name": "Node.js",
        "category": "backend",
        "color": "yellow",
        "description": "Node.js project",
        "match_files": ["package.json"],
        "match_extensions": [],
        "match_dirs": [],
    },
    # ── Mobile ────────────────────────────────────────────────────────────────
    {
        "id": "react_native",
        "name": "React Native",
        "category": "mobile",
        "color": "cyan",
        "description": "React Native mobile app",
        "match_files": ["metro.config.js"],
        "match_extensions": [],
        "match_dirs": ["android", "ios"],
    },
    {
        "id": "flutter",
        "name": "Flutter",
        "category": "mobile",
        "color": "blue",
        "description": "Flutter mobile app",
        "match_files": ["pubspec.yaml"],
        "match_extensions": [".dart"],
        "match_dirs": [],
    },
]

# Python package-based detection via requirements.txt keywords
_PYTHON_KEYWORD_MAP = {
    "django": "django",
    "fastapi": "fastapi",
    "flask": "flask",
    "tornado": "tornado",
    "starlette": "fastapi",
}


def detect_frameworks(file_tree: list[dict]) -> list[Framework]:
    paths = {item["path"] for item in file_tree}
    filenames = {p.split("/")[-1] for p in paths}
    dirs = {"/".join(p.split("/")[:-1]) for p in paths if "/" in p}

    # Collect requirements.txt content hints (filename level only)
    req_keywords: set[str] = set()
    for item in file_tree:
        p = item["path"].lower()
        if p in ("requirements.txt", "pipfile", "pyproject.toml"):
            # We don't have content here — mark for content-based check
            req_keywords.add(p)

    found: dict[str, Framework] = {}

    for sig in _SIGNATURES:
        fid = sig["id"]
        # File match
        if any(f in filenames for f in sig["match_files"]):
            found[fid] = Framework(
                id=fid, name=sig["name"], category=sig["category"],
                color=sig["color"], description=sig["description"],
            )
            continue
        # Extension match
        if sig["match_extensions"] and any(
            any(p.endswith(ext) for p in paths) for ext in sig["match_extensions"]
        ):
            found[fid] = Framework(
                id=fid, name=sig["name"], category=sig["category"],
                color=sig["color"], description=sig["description"],
            )
            continue
        # Directory match
        if sig["match_dirs"] and any(
            any(d.endswith(md) or ("/" + md + "/") in ("/" + d + "/") for d in dirs)
            for md in sig["match_dirs"]
        ):
            found[fid] = Framework(
                id=fid, name=sig["name"], category=sig["category"],
                color=sig["color"], description=sig["description"],
            )

    # If requirements.txt is present, assume Python — mark for content-check at analysis time
    if req_keywords and not any(k in found for k in ("django", "fastapi", "flask")):
        found["python"] = Framework(
            id="python", name="Python", category="backend",
            color="yellow", description="Python project (framework TBD from requirements.txt)",
        )

    return list(found.values())
