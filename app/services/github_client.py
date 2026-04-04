import httpx
from app.session_store import SessionData

BASE = "https://api.github.com"
_HEADERS = lambda token: {
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


async def list_repos(session: SessionData) -> list[dict]:
    repos = []
    page = 1
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(
                f"{BASE}/user/repos",
                headers=_HEADERS(session.access_token),
                params={"type": "all", "sort": "updated", "per_page": 100, "page": page},
            )
            data = resp.json()
            if not data:
                break
            repos.extend([
                {
                    "id": r["id"],
                    "name": r["name"],
                    "full_name": r["full_name"],
                    "owner": r["owner"]["login"],
                    "description": r.get("description", ""),
                    "private": r["private"],
                    "updated_at": r.get("updated_at", ""),
                    "stars": r.get("stargazers_count", 0),
                    "language": r.get("language", ""),
                    "default_branch": r.get("default_branch", "main"),
                }
                for r in data
            ])
            if len(data) < 100:
                break
            page += 1
    return repos


async def list_branches(session: SessionData, owner: str, repo: str) -> list[dict]:
    branches = []
    page = 1
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(
                f"{BASE}/repos/{owner}/{repo}/branches",
                headers=_HEADERS(session.access_token),
                params={"per_page": 100, "page": page},
            )
            data = resp.json()
            if not data:
                break
            branches.extend([{"name": b["name"]} for b in data])
            if len(data) < 100:
                break
            page += 1
    return branches


async def get_file_tree(session: SessionData, owner: str, repo: str, branch: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=60) as client:
        # Get branch SHA
        ref_resp = await client.get(
            f"{BASE}/repos/{owner}/{repo}/git/ref/heads/{branch}",
            headers=_HEADERS(session.access_token),
        )
        sha = ref_resp.json()["object"]["sha"]

        tree_resp = await client.get(
            f"{BASE}/repos/{owner}/{repo}/git/trees/{sha}",
            headers=_HEADERS(session.access_token),
            params={"recursive": "1"},
        )
        tree = tree_resp.json()

    return [
        {"path": item["path"], "type": "file" if item["type"] == "blob" else "dir", "size": item.get("size", 0)}
        for item in tree.get("tree", [])
    ]


async def get_file_content(session: SessionData, owner: str, repo: str, branch: str, path: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE}/repos/{owner}/{repo}/contents/{path}",
            headers=_HEADERS(session.access_token),
            params={"ref": branch},
        )
        data = resp.json()
        if "content" in data:
            import base64
            return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
    return ""


def clone_url(session: SessionData, owner: str, repo: str) -> str:
    return f"https://x-oauth-basic:{session.access_token}@github.com/{owner}/{repo}.git"


def compare_url(owner: str, repo: str, branch: str) -> str:
    return f"https://github.com/{owner}/{repo}/compare/{branch}"
