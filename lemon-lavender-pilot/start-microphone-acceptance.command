#!/bin/zsh
set -eu
cd "${0:A:h}"
umask 077
print 'One user-operated fictional microphone test: new $1 / 5-minute allowance, one start including coaching.'
print 'The completed synthetic test history and budget remain unchanged.'
print 'Handle native Keychain and browser microphone prompts personally. Do not paste an API key.'
exec .venv/bin/python manage.py serve_microphone_test --allow-keychain-prompt
