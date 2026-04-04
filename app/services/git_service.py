import asyncio
import logging
import os
import shutil
import stat
from datetime import date

import git

from app.config import get_settings
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
    Async generator that yields SSE-style progress dicts and finally a 'done' event.
    Stages: cloning → applying fixes (one event per change) → committing
    """
    settings = get_settings()
    client = _provider_client(session)

    dir_key = f"{session.owner}-{session.repo}-{session.username}"
    clone_dir = os.path.join(settings.git_clone_base_dir, dir_key)
    if os.path.exists(clone_dir):
        def _force_remove(func, path, _exc):
            os.chmod(path, stat.S_IWRITE)
            func(path)
        shutil.rmtree(clone_dir, onerror=_force_remove)

    url = client.clone_url(session, session.owner, session.repo)
    branch = branch_name or f"cqa/improvements-{date.today().isoformat()}"
    total = len(selected_changes)

    # ── Stage 1: Clone ────────────────────────────────────────────────────────
    yield {"event": "stage", "stage": "cloning", "message": f"Cloning {session.owner}/{session.repo}…"}

    def _clone():
        repo = git.Repo.clone_from(url, clone_dir, branch=session.branch)
        repo.git.checkout("-b", branch)
        return repo

    loop = asyncio.get_event_loop()
    repo = await loop.run_in_executor(None, _clone)

    # ── Stage 2: Apply fixes ──────────────────────────────────────────────────
    by_file: dict[str, list[dict]] = {}
    for change in selected_changes:
        by_file.setdefault(change["file_path"], []).append(change)

    done = 0
    for file_path, changes in by_file.items():
        abs_path = os.path.join(clone_dir, file_path.replace("/", os.sep))
        if not os.path.exists(abs_path):
            logger.warning(f"File not found in clone: {abs_path}")
            for _ in changes:
                done += 1
                yield {"event": "progress", "done": done, "total": total,
                       "file": file_path, "message": f"Skipped (file not found): {file_path}"}
            continue

        with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        lines = content.splitlines(keepends=True)
        sorted_changes = sorted(changes, key=lambda c: c.get("line_number", 0), reverse=True)

        for change in sorted_changes:
            done += 1
            yield {
                "event": "progress",
                "done": done,
                "total": total,
                "file": file_path,
                "message": f"Fixing: {change.get('issue', '')[:80]}",
            }
            try:
                fix_text = await generate_fix(session, content, change)
                line_no = change.get("line_number", 1) - 1
                if 0 <= line_no < len(lines):
                    fix_lines = (fix_text + "\n").splitlines(keepends=True)
                    lines[line_no:line_no + 1] = fix_lines
                    content = "".join(lines)
            except Exception as e:
                logger.error(f"Failed to apply fix for {file_path}:{change.get('line_number')}: {e}")
                yield {"event": "fix_error", "file": file_path, "message": str(e)}

        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(content)

    # ── Stage 3: Commit ───────────────────────────────────────────────────────
    yield {"event": "stage", "stage": "committing", "message": "Committing changes…"}

    def _commit():
        repo.git.add(A=True)
        if not repo.is_dirty(index=True, working_tree=True):
            return None, "No changes to commit"
        author = git.Actor(settings.git_commit_author_name, settings.git_commit_author_email)
        commit = repo.index.commit(
            f"chore: apply Code Quality Advisor recommendations\n\n"
            f"{len(selected_changes)} issue(s) addressed across {len(by_file)} file(s)",
            author=author,
            committer=author,
        )
        diff = repo.git.diff("HEAD~1", "HEAD", stat=True)
        return str(commit.hexsha[:8]), diff

    commit_sha, diff_summary = await loop.run_in_executor(None, _commit)
    diff_text = await get_diff_from_dir(clone_dir)

    # Store results on session so the push endpoint can find them
    session.clone_dir = clone_dir
    session.pending_branch = branch
    session.commit_sha = commit_sha or ""
    session.diff_summary = diff_summary

    yield {
        "event": "done",
        "branch_name": branch,
        "commit_sha": commit_sha or "",
        "diff_summary": diff_summary,
        "diff_text": diff_text,
    }


async def get_diff_from_dir(clone_dir: str) -> str:
    def _diff():
        try:
            repo = git.Repo(clone_dir)
            return repo.git.diff("HEAD~1", "HEAD")
        except Exception:
            return ""

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _diff)


async def get_diff(session: SessionData) -> str:
    return await get_diff_from_dir(session.clone_dir)


async def push_branch(session: SessionData) -> str:
    client = _provider_client(session)

    def _push():
        repo = git.Repo(session.clone_dir)
        origin = repo.remote("origin")
        origin.push(refspec=f"{session.pending_branch}:{session.pending_branch}")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _push)

    return client.compare_url(session.owner, session.repo, session.pending_branch)
