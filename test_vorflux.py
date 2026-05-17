"""Test Vorflux API integration."""
import asyncio
import sys
sys.path.insert(0, ".")

from backend.config import load_settings
from backend.services.ai_analyzer import analyze_code_with_ai

settings = load_settings()
print(f"Vorflux key: {settings.vorflux_api_key[:15]}...")
print(f"Base URL: {settings.vorflux_base_url}")

# Test with demo-app files
import os
files = {}
demo_path = "demo-app"
for root, dirs, filenames in os.walk(demo_path):
    dirs[:] = [d for d in dirs if d not in ("__pycache__", ".git")]
    for fname in filenames:
        if fname.endswith((".py", ".txt")):
            fpath = os.path.join(root, fname)
            rel = os.path.relpath(fpath, demo_path)
            with open(fpath, "r") as f:
                files[rel] = f.read()

print(f"Files: {list(files.keys())}")
print("Calling Vorflux AI agent...")

async def main():
    findings = await analyze_code_with_ai(files, "demo-app", settings)
    print(f"\n{'='*50}")
    print(f"AI Agent found {len(findings)} issues:")
    print(f"{'='*50}")
    for f in findings:
        print(f"\n  [{f['severity']}] {f['finding_type']}")
        print(f"  Title: {f['title']}")
        if f.get("file_path"):
            print(f"  File: {f['file_path']}:{f.get('line_number', '?')}")
        if f.get("description"):
            print(f"  Desc: {f['description'][:100]}")
        if f.get("fix_hint"):
            print(f"  Fix: {f['fix_hint']}")

asyncio.run(main())
