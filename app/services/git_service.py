"""
Git operations via provider APIs — no local git binary required.
Works on serverless (Vercel) and traditional servers alike.
"""
import base64
import logging
from datetime import datetime, timezone

import httpx

from app.session_store import SessionData
from app.services import github_client, gitlab_client, bitbucket_client
from app.services.claude_analyzer import generate_fix

logger = logging.getLogger(__name__)


def _provider_client(session: SessionData):
    if session.provider == "github":
        return github_client
    if session.provider == "gitlab":
        return gitlab_client
    return bitbucket_client


async def prepare_branch(
    session: SessionData,
    selected_changes: list[dict],
    branch_name: str | None,
):
    """
    Async generator yielding SSE-style progress dicts.
    Fetches file content from the provider API, applies LLM fixes in memory,
    then creates a new branch + commit via the provider API.
    """
    branch = branch_name or f"cqa/improvements-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    total = len(selected_changes)

    # Group changes by file
    by_file: dict[str, list[dict]] = {}
    for change in selected_changes:
        by_file.setdefault(change["file_path"], []).append(change)

    yield {"event": "stage", "stage": "preparing", "message": f"Preparing {len(by_file)} file(s)…"}

    # ── Apply fixes in memory ─────────────────────────────────────────────────
    fixed_files: dict[str, str] = {}
    done = 0

    for file_path, changes in by_file.items():
        yield {
            "event": "progress", "done": done, "total": total,
            "file": file_path, "message": f"Fetching {file_path}…",
        }

        content = await _provider_client(session).get_file_content(
            session, session.owner, session.repo, session.branch, file_path
        )
        if not content:
            for _ in changes:
                done += 1
                yield {
                    "event": "progress", "done": done, "total": total,
                    "file": file_path, "message": f"Skipped (could not fetch): {file_path}",
                }
            continue

        lines = content.splitlines(keepends=True)
        sorted_changes = sorted(changes, key=lambda c: c.get("line_number", 0), reverse=True)

        for change in sorted_changes:
            done += 1
            yield {
                "event": "progress", "done": done, "total": total,
                "file": file_path, "message": f"Fixing: {change.get('issue', '')[:80]}",
            }
            try:
                fix_text = await generate_fix(session, content, change)
                line_no = change.get("line_number", 1) - 1
                if 0 <= line_no < len(lines):
                    fix_lines = (fix_text + "\n").splitlines(keepends=True)
                    lines[line_no:line_no + 1] = fix_lines
                    content = "".join(lines)
            except Exception as e:
                logger.error(f"Failed to apply fix for {file_path}: {e}")
                yield {"event": "fix_error", "file": file_path, "message": str(e)}

        fixed_files[file_path] = content

    if not fixed_files:
        session.pending_branch = branch
        session.commit_sha = ""
        session.diff_summary = "No files changed"
        yield {
            "event": "done", "branch_name": branch,
            "commit_sha": "", "diff_summary": "No files changed", "diff_text": "",
        }
        return

    # ── Commit via provider API ───────────────────────────────────────────────
    yield {"event": "stage", "stage": "committing", "message": "Creating branch and committing…"}

    commit_message = (
        f"chore: apply Code Quality Advisor recommendations\n\n"
        f"{len(selected_changes)} issue(s) addressed across {len(fixed_files)} file(s)"
    )

    try:
        if session.provider == "github":
            commit_sha, diff_summary, diff_text = await _github_commit(
                session, branch, fixed_files, commit_message
            )
        elif session.provider == "gitlab":
            commit_sha, diff_summary, diff_text = await _gitlab_commit(
                session, branch, fixed_files, commit_message
            )
        else:
            commit_sha, diff_summary, diff_text = await _bitbucket_commit(
                session, branch, fixed_files, commit_message
            )
    except Exception as e:
        logger.error(f"Commit failed: {e}")
        yield {"event": "error", "message": f"Commit failed: {e}"}
        return

    session.pending_branch = branch
    session.commit_sha = commit_sha
    session.diff_summary = diff_summary

    yield {
        "event": "done",
        "branch_name": branch,
        "commit_sha": commit_sha,
        "diff_summary": diff_summary,
        "diff_text": diff_text,
    }


# ── Provider-specific commit implementations ──────────────────────────────────

async def _github_commit(
    session: SessionData,
    branch: str,
    fixed_files: dict[str, str],
    commit_message: str,
) -> tuple[str, str, str]:
    """Create a new branch + commit via GitHub Git Data API."""
    token = session.access_token
    owner, repo, base_branch = session.owner, session.repo, session.branch
    api = "https://api.github.com"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        # 1. Get the latest commit SHA on the base branch
        ref = await client.get(f"{api}/repos/{owner}/{repo}/git/ref/heads/{base_branch}", headers=headers)
        ref.raise_for_status()
        base_sha = ref.json()["object"]["sha"]

        # 2. Get the tree SHA of that commit
        base_commit = await client.get(f"{api}/repos/{owner}/{repo}/git/commits/{base_sha}", headers=headers)
        base_commit.raise_for_status()
        base_tree_sha = base_commit.json()["tree"]["sha"]

        # 3. Create a blob for each changed file
        tree_items = []
        for file_path, content in fixed_files.items():
            blob = await client.post(
                f"{api}/repos/{owner}/{repo}/git/blobs",
                headers=headers,
                json={"content": base64.b64encode(content.encode()).decode(), "encoding": "base64"},
            )
            blob.raise_for_status()
            tree_items.append({"path": file_path, "mode": "100644", "type": "blob", "sha": blob.json()["sha"]})

        # 4. Create a new tree on top of the base tree
        new_tree = await client.post(
            f"{api}/repos/{owner}/{repo}/git/trees",
            headers=headers,
            json={"base_tree": base_tree_sha, "tree": tree_items},
        )
        new_tree.raise_for_status()
        new_tree_sha = new_tree.json()["sha"]

        # 5. Create the commit
        new_commit = await client.post(
            f"{api}/repos/{owner}/{repo}/git/commits",
            headers=headers,
            json={"message": commit_message, "tree": new_tree_sha, "parents": [base_sha]},
        )
        new_commit.raise_for_status()
        new_commit_sha = new_commit.json()["sha"]

        # 6. Create the branch ref
        create_ref = await client.post(
            f"{api}/repos/{owner}/{repo}/git/refs",
            headers=headers,
            json={"ref": f"refs/heads/{branch}", "sha": new_commit_sha},
        )
        create_ref.raise_for_status()

        # 7. Fetch the unified diff for the review step
        diff_resp = await client.get(
            f"{api}/repos/{owner}/{repo}/compare/{base_sha}...{new_commit_sha}",
            headers={**headers, "Accept": "application/vnd.github.diff"},
        )
        diff_text = diff_resp.text if diff_resp.status_code == 200 else ""
        diff_summary = _stat_from_diff(diff_text, fixed_files)

    return new_commit_sha[:8], diff_summary, diff_text


async def _gitlab_commit(
    session: SessionData,
    branch: str,
    fixed_files: dict[str, str],
    commit_message: str,
) -> tuple[str, str, str]:
    """Create a new branch + commit via GitLab Commits API."""
    from app.services.gitlab_client import _base, _headers, _resolve_project_id
    project_id = await _resolve_project_id(session, session.owner, session.repo)

    actions = [
        {"action": "update", "file_path": path, "content": content}
        for path, content in fixed_files.items()
    ]

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{_base()}/api/v4/projects/{project_id}/repository/commits",
            headers=_headers(session.access_token),
            json={
                "branch": branch,
                "start_branch": session.branch,
                "commit_message": commit_message,
                "actions": actions,
            },
        )
        resp.raise_for_status()
        commit_sha = resp.json().get("id", "")[:8]

    return commit_sha, _stat_summary(fixed_files), ""


async def _bitbucket_commit(
    session: SessionData,
    branch: str,
    fixed_files: dict[str, str],
    commit_message: str,
) -> tuple[str, str, str]:
    """Create a new Bitbucket branch then commit changed files via the Source API."""
    from app.services.bitbucket_client import BASE, _headers as bb_headers

    async with httpx.AsyncClient(timeout=60) as client:
        # Get the tip commit of the base branch
        tip = await client.get(
            f"{BASE}/repositories/{session.owner}/{session.repo}/refs/branches/{session.branch}",
            headers=bb_headers(session),
        )
        tip.raise_for_status()
        tip_sha = tip.json()["target"]["hash"]

        # Create the new branch
        br = await client.post(
            f"{BASE}/repositories/{session.owner}/{session.repo}/refs/branches",
            headers=bb_headers(session),
            json={"name": branch, "target": {"hash": tip_sha}},
        )
        br.raise_for_status()

        # Commit all files via multipart POST to /src
        src = await client.post(
            f"{BASE}/repositories/{session.owner}/{session.repo}/src",
            headers=bb_headers(session),
            data={"message": commit_message, "branch": branch},
            files=[(path, (path, content.encode(), "text/plain")) for path, content in fixed_files.items()],
        )
        src.raise_for_status()

    return "", _stat_summary(fixed_files), ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stat_from_diff(diff_text: str, fixed_files: dict) -> str:
    """Extract git diff --stat-style lines from a unified diff."""
    if diff_text:
        stat_lines = [l for l in diff_text.split("\n") if " | " in l]
        if stat_lines:
            return "\n".join(stat_lines)
    return _stat_summary(fixed_files)


def _stat_summary(fixed_files: dict) -> str:
    return "\n".join(f" {path} | modified" for path in fixed_files)


async def get_diff(session: SessionData) -> str:
    return session.diff_summary or ""


async def push_branch(session: SessionData) -> str:
    """
    Branch is already live (created during prepare_branch via API).
    Just return the compare URL.
    """
    return _provider_client(session).compare_url(session.owner, session.repo, session.pending_branch)
