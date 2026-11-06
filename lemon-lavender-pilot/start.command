#!/bin/zsh
set -eu
cd "${0:A:h}"
umask 077
if [[ ! -x .venv/bin/python ]]; then
  print 'First install the isolated Python environment described in README.md.'
  exit 1
fi
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py seed_demo
print 'Open http://127.0.0.1:8765 — local fictional pilot only. Press Control-C to stop.'
exec .venv/bin/python manage.py runserver 127.0.0.1:8765 --noreload --nothreading
