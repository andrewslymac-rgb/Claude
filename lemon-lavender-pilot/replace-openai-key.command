#!/bin/zsh
set +x
set -eu
cd "${0:A:h}"
umask 077
if (( $# )); then
  print -u2 'Do not pass a key as an argument. Open this file directly in Terminal.'
  exit 2
fi
exec .venv/bin/python -B scripts/secure_keychain_entry.py replace
