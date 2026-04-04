import base64
import httpx
from app.session_store import SessionData

BASE = "https://api.bitbucket.org/2.0"


def _headers(session: SessionData) -> dict:
    # API tokens use email:token for Basic auth (session.username stores the email)
    # session.workspace holds the workspace slug used in URL paths
    credentials = base64.b64encode(f"{session.username}:{session.access_token}".encode()).decode()
    return {"Authorization": f"Basic {credentials}"}


async def _list_workspaces(session: SessionData, client: httpx.AsyncClient) -> list[str]:
    """Return all workspace slugs the authenticated user belongs to."""
    slugs = []
    url = f"{BASE}/workspaces?pagelen=100&sort=slug"
    while url:
        resp = await client.get(url, headers=_headers(session))
        data = resp.json()
        slugs.extend(w["slug"] for w in data.get("values", []))
        url = data.get("next")
    # Always include the user's own workspace slug as a fallback
    if session.workspace and session.workspace not in slugs:
        slugs.insert(0, session.workspace)
    return slugs


async def list_repos(session: SessionData) -> list[dict]:
    repos = []
    seen = set()
    async with httpx.AsyncClient(timeout=30) as client:
        workspaces = await _list_workspaces(session, client)
        for ws in workspaces:
            url = f"{BASE}/repositories/{ws}?pagelen=100&sort=-updated_on"
            while url:
                resp = await client.get(url, headers=_headers(session))
                if resp.status_code != 200:
                    break
                data = resp.json()
                for r in data.get("values", []):
                    uid = r.get("uuid")
                    if uid in seen:
                        continue
                    seen.add(uid)
                    owner = r.get("workspace", {}).get("slug", ws)
                    repos.append({
                        "id": uid,
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
