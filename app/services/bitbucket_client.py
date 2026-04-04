import base64
import httpx
from app.session_store import SessionData

BASE = "https://api.bitbucket.org/2.0"


def _headers(session: SessionData) -> dict:
    credentials = base64.b64encode(f"{session.workspace}:{session.access_token}".encode()).decode()
    return {"Authorization": f"Basic {credentials}"}


async def list_repos(session: SessionData) -> list[dict]:
    repos = []
    url = f"{BASE}/repositories/{session.workspace}?pagelen=100&sort=-updated_on"
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            resp = await client.get(url, headers=_headers(session))
            data = resp.json()
            for r in data.get("values", []):
                owner = r.get("workspace", {}).get("slug", session.workspace)
                repos.append({
                    "id": r["uuid"],
                    "name": r["slug"],
                    "full_name": r["full_name"],
                    "owner": owner,
                    "description": r.get("description", ""),
                    "private": r.get("is_private", True),
                    "updated_at": r.get("updated_on", ""),
                    "stars": 0,
                    "language": r.get("language", ""),
                    "default_branch": r.get("mainbranch", {}).get("name", "main"),
                })
            url = data.get("next")
    return repos


async def list_branches(session: SessionData, owner: str, repo: str) -> list[dict]:
    branches = []
    url = f"{BASE}/repositories/{owner}/{repo}/refs/branches?pagelen=100"
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            resp = await client.get(url, headers=_headers(session))
            data = resp.json()
            branches.extend([{"name": b["name"]} for b in data.get("values", [])])
            url = data.get("next")
    return branches


async def get_file_tree(session: SessionData, owner: str, repo: str, branch: str) -> list[dict]:
    items = []
    # Bitbucket paginates the tree — collect all pages
    url = f"{BASE}/repositories/{owner}/{repo}/src/{branch}/?pagelen=100&q=type=%22commit_file%22"
    async with httpx.AsyncClient(timeout=60) as client:
        while url:
            resp = await client.get(url, headers=_headers(session))
            data = resp.json()
            for item in data.get("values", []):
                items.append({
                    "path": item["path"],
                    "type": "file" if item.get("type") == "commit_file" else "dir",
                    "size": item.get("size", 0),
                })
            url = data.get("next")
    return items


async def get_file_content(session: SessionData, owner: str, repo: str, branch: str, path: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE}/repositories/{owner}/{repo}/src/{branch}/{path}",
            headers=_headers(session),
        )
        if resp.status_code == 200:
            return resp.text
    return ""


def clone_url(session: SessionData, owner: str, repo: str) -> str:
    return f"https://{session.workspace}:{session.access_token}@bitbucket.org/{owner}/{repo}.git"


def compare_url(owner: str, repo: str, branch: str) -> str:
    return f"https://bitbucket.org/{owner}/{repo}/branch/{branch}"
