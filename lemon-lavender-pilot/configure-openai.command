#!/bin/zsh
set +x
set -eu
cd "${0:A:h}"
umask 077
if (( $# )); then
  print -u2 'Do not pass a key as an argument. Open this file directly in Terminal.'
  exit 2
fi
if [[ ! -x .venv/bin/python ]]; then
  print -u2 'The Training Center Python environment is missing. Ask for help before entering a key.'
  exit 1
fi
exec .venv/bin/python -B scripts/configure_openai_keychain.py
