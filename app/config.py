from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_base_url: str = "http://localhost:8000"
    secret_key: str = "change-me-in-production"
    log_level: str = "INFO"
    session_ttl_hours: int = 8

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/oauth/github/callback"

    # GitLab OAuth
    gitlab_client_id: str = ""
    gitlab_client_secret: str = ""
    gitlab_redirect_uri: str = "http://localhost:8000/api/oauth/gitlab/callback"
    gitlab_base_url: str = "https://gitlab.com"

    # Bitbucket OAuth
    bitbucket_client_id: str = ""
    bitbucket_client_secret: str = ""
    bitbucket_redirect_uri: str = "http://localhost:8000/api/oauth/bitbucket/callback"

    # Claude AI
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"
    claude_max_tokens: int = 4096
    claude_file_size_limit_kb: int = 100

    # Git operations
    git_clone_base_dir: str = "/tmp/cqa"
    git_commit_author_name: str = "Code Quality Advisor"
    git_commit_author_email: str = "cqa@noreply.local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
