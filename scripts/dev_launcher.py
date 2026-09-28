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
BACKEND_TESTS = "cd backend && dotnet test"
# E2E boots the API itself, but it needs the database to be up.
FRONTEND_TESTS = f"{START_DB} && cd frontend && npm run test:run && npm run test:e2e"
ALL_TESTS = f"({BACKEND_TESTS}) && ({FRONTEND_TESTS})"


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
    ("Start website", [("Backend", f"{START_DB} && {BACKEND}"), ("Frontend", f"{FRONTEND} -- --open")]),
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

    root.mainloop()


if __name__ == "__main__":
    main()
