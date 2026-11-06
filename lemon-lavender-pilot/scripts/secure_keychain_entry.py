"""Human-run hidden entry. No Django or provider initialization."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from training.keychain_entry import main
if __name__ == '__main__':
    raise SystemExit(main())
