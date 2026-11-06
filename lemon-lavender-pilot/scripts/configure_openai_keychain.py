"""Terminal entrypoint; does not initialize Django, read passwords, or use HTTP."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from training.keychain_setup import main

if __name__ == '__main__':
    raise SystemExit(main())
