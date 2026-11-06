#!/bin/zsh
set -eu
cd "${0:A:h}"
umask 077
print 'This launches only the already-approved fictional OpenAI test (combined $2 / 10-minute ceiling).'
print 'Handle any macOS Keychain access prompt personally. Do not type or paste a key here.'
print 'The normal training app remains provider-off. Control-C ends and closes this test authorization.'
exec .venv/bin/python manage.py serve_live_test --allow-keychain-prompt
