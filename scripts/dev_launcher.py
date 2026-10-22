#!/usr/bin/env python3
"""Small control panel for local development.

Each button opens a new macOS Terminal window and runs the matching commands
from the repository root, so logs stay visible and processes can be stopped
with Ctrl+C.

Usage: python3 scripts/dev_launcher.py
"""

import shlex
import subprocess
import tkinter as tk
from pathlib import Path
from tkinter import messagebox

REPO_ROOT = Path(__file__).resolve().parent.parent

START_DB = "docker compose up -d --wait"
BACKEND = "dotnet run --project backend/src/Portfolio.Api --launch-profile http"
FRONTEND = "cd frontend && npm run dev"
# The browser opens as soon as Vite is up, so wait for the API first; otherwise the page's
# first /api calls hit a closed port (Vite logs "http proxy error ... ECONNREFUSED").
WAIT_FOR_API = (
    "echo 'Waiting for the API to be healthy...' && "
    "until curl -sf http://localhost:5105/api/health > /dev/null; do sleep 1; done"
)
# 3D architecture map (tools/repomap): builds the graph (cached after the first run), opens the
# viewer in the browser and rebuilds it whenever the code changes. npm install only runs once.
REPO_MAP = "cd tools/repomap && ([ -d node_modules ] || npm install) && npm start"
# Unit + integration tests with coverage of the API; the report opens in the browser afterwards, whether the
# tests passed or not.
BACKEND_TESTS = "backend/test.sh; open backend/coverage/index.html"
# Vitest in headless Chromium, with coverage of all of frontend/src; the report opens in the browser
# afterwards, whether the tests passed or not.
FRONTEND_TESTS = "cd frontend && npm test; open coverage/index.html"
# Both, one after the other (the backend's integration tests and the frontend's browser tests are heavy
# together), then both coverage reports.
ALL_TESTS = "backend/test.sh; (cd frontend && npm test); open backend/coverage/index.html frontend/coverage/index.html"
# Production: a pull request develop → main that merges itself once the tests pass, then deploys.
DEPLOY = "scripts/deploy.sh"
# The Deploy button only works on this branch.
DEPLOY_BRANCH = "develop"


def current_branch() -> str:
    result = subprocess.run(["git", "branch", "--show-current"], cwd=REPO_ROOT, capture_output=True, text=True)
    return result.stdout.strip()


def open_terminal(title: str, command: str) -> None:
    """Open a new Terminal window that cds to the repo root and runs `command`."""
    shell_command = f"cd {shlex.quote(str(REPO_ROOT))} && printf '\\e]0;{title}\\a' && {command}"
    escaped = shell_command.replace("\\", "\\\\").replace('"', '\\"')
    script = f'tell application "Terminal"\n  activate\n  do script "{escaped}"\nend tell'
    try:
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        messagebox.showerror("Failed to open Terminal", error.stderr or str(error))


ACTIONS: list[tuple[str, list[tuple[str, str]]]] = [
    ("Start backend", [("Backend", f"{START_DB} && {BACKEND}")]),
    ("Start frontend", [("Frontend", FRONTEND)]),
    ("Start website", [("Backend", f"{START_DB} && {BACKEND}"), ("Frontend", f"{WAIT_FOR_API} && {FRONTEND} -- --open")]),
    ("Open repo map", [("Repo map", REPO_MAP)]),
    ("Run backend tests", [("Backend tests", BACKEND_TESTS)]),
    ("Run frontend tests", [("Frontend tests", FRONTEND_TESTS)]),
    ("Run all tests", [("All tests", ALL_TESTS)]),
]


def main() -> None:
    root = tk.Tk()
    root.title("jechel.dev launcher")
    root.resizable(False, False)

    frame = tk.Frame(root, padx=16, pady=16)
    frame.pack()

    for label, terminals in ACTIONS:
        def run(terminals=terminals) -> None:
            for title, command in terminals:
                open_terminal(title, command)

        tk.Button(frame, text=label, width=22, command=run).pack(pady=3)

    deploy = tk.Button(frame, text="Deploy to production", width=22, command=lambda: open_terminal("Deploy", DEPLOY))
    deploy.pack(pady=(12, 3))
    hint = tk.Label(frame, fg="grey")
    hint.pack()

    def refresh_deploy() -> None:
        branch = current_branch()
        on_branch = branch == DEPLOY_BRANCH
        deploy.config(state=tk.NORMAL if on_branch else tk.DISABLED)
        hint.config(text=f"from {DEPLOY_BRANCH}" if on_branch else f"on {branch or '?'}: switch to {DEPLOY_BRANCH}")
        root.after(2000, refresh_deploy)

    refresh_deploy()
    root.mainloop()


if __name__ == "__main__":
    main()
