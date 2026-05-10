#!/usr/bin/env python3
"""CLI runner for the CareMind small transformer."""

from pathlib import Path
import sys


repo_root = Path(__file__).resolve().parents[1]
repo_root_text = str(repo_root)
if repo_root_text not in sys.path:
    sys.path.insert(0, repo_root_text)

from scripts.small_transformer import main


if __name__ == "__main__":
    main()
