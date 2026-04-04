import httpx
from app.session_store import SessionData
from app.config import get_settings


def _base() -> str:
    return get_settings().gitlab_base_url


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _resolve_project_id(session: SessionData, owner: str, repo: str) -> str:
    """Resolve owner/repo to GitLab numeric project ID, cached in session."""
    key = f"{owner}/{repo}"
    if session.repo_id and session.repo == repo and session.owner == owner:
        return session.repo_id

    encoded = key.replace("/", "%2F")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{_base()}/api/v4/projects/{encoded}",
            headers=_headers(session.access_token),
        )
        project_id = str(resp.json().get("id", ""))
        session.repo_id = project_id
        return project_id


async def list_repos(session: SessionData) -> list[dict]:
    repos = []
    page = 1
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(
                f"{_base()}/api/v4/projects",
                headers=_headers(session.access_token),
                params={"membership": "true", "order_by": "updated_at", "per_page": 100, "page": page},
            )
            data = resp.json()
            if not data:
                break
            repos.extend([
                {
                    "id": str(r["id"]),
                    "name": r["name"],
                    "full_name": r["path_with_namespace"],
                    "owner": r["namespace"]["path"],
                    "description": r.get("description", ""),
                    "private": r.get("visibility") != "public",
                    "updated_at": r.get("last_activity_at", ""),
                    "stars": r.get("star_count", 0),
                    "language": "",
                    "default_branch": r.get("default_branch", "main"),
                }
                for r in data
            ])
            if len(data) < 100:
                break
            page += 1
    return repos


async def list_branches(session: SessionData, owner: str, repo: str) -> list[dict]:
    project_id = await _resolve_project_id(session, owner, repo)
    branches = []
    page = 1
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(
                f"{_base()}/api/v4/projects/{project_id}/repository/branches",
                headers=_headers(session.access_token),
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
    project_id = await _resolve_project_id(session, owner, repo)
    items = []
    page = 1
    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            resp = await client.get(
                f"{_base()}/api/v4/projects/{project_id}/repository/tree",
                headers=_headers(session.access_token),
                params={"ref": branch, "recursive": "true", "per_page": 100, "page": page},
            )
            data = resp.json()
            if not data:
                break
            items.extend([
                {"path": i["path"], "type": "file" if i["type"] == "blob" else "dir", "size": 0}
                for i in data
            ])
            if len(data) < 100:
                break
            page += 1
    return items


async def get_file_content(session: SessionData, owner: str, repo: str, branch: str, path: str) -> str:
    project_id = await _resolve_project_id(session, owner, repo)
    encoded_path = path.replace("/", "%2F")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{_base()}/api/v4/projects/{project_id}/repository/files/{encoded_path}/raw",
            headers=_headers(session.access_token),
            params={"ref": branch},
        )
        if resp.status_code == 200:
            return resp.text
    return ""


def clone_url(session: SessionData, owner: str, repo: str) -> str:
    base = _base()
    return f"{base.replace('://', f'://oauth2:{session.access_token}@')}/{owner}/{repo}.git"


def compare_url(owner: str, repo: str, branch: str) -> str:
    base = _base()
    return f"{base}/{owner}/{repo}/-/compare/{branch}"
