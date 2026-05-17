from dataclasses import dataclass
from dotenv import dotenv_values
import os

@dataclass
class Settings:
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    vorflux_api_key: str = ""
    vorflux_base_url: str = "https://api.vorflux.com/v1"
    github_token: str = ""
    github_repo: str = "owner/demo-app"
    github_owner: str = "owner"
    database_url: str = "sqlite:///./runtimeguard.db"
    docker_base_image: str = "python:3.11-slim"
    sandbox_timeout: int = 60
    demo_app_branch: str = "main"
    log_level: str = "INFO"

def load_settings() -> Settings:
    """Load settings from .env file with sensible defaults."""
    env = dotenv_values(".env")
    # Also check os.environ for CI/Docker environments
    def get(key, default=""):
        return env.get(key, os.environ.get(key, default))
    
    return Settings(
        anthropic_api_key=get("ANTHROPIC_API_KEY"),
        gemini_api_key=get("GEMINI_API_KEY"),
        vorflux_api_key=get("VORFLUX_API_KEY"),
        vorflux_base_url=get("VORFLUX_BASE_URL", "https://api.vorflux.com/v1"),
        github_token=get("GITHUB_TOKEN"),
        github_repo=get("GITHUB_REPO", "owner/demo-app"),
        github_owner=get("GITHUB_OWNER", "owner"),
        database_url=get("DATABASE_URL", "sqlite:///./runtimeguard.db"),
        docker_base_image=get("DOCKER_BASE_IMAGE", "python:3.11-slim"),
        sandbox_timeout=int(get("SANDBOX_TIMEOUT", "60")),
        demo_app_branch=get("DEMO_APP_BRANCH", "main"),
        log_level=get("LOG_LEVEL", "INFO"),
    )
