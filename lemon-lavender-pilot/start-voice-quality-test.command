#!/bin/zsh
set -eu
cd "${0:A:h}"
umask 077
print 'New approved voice-quality test — one start, at most $1 additional including coaching.'
print 'Four-minute active cutoff; five minutes reserved. Earlier test histories stay closed.'
print 'On this MacBook Pro, handle any Keychain/browser prompts personally. Never paste a key.'
print 'Then open http://127.0.0.1:8769/voice-quality-test/ and use learner@example.invalid.'
print 'No API call starts until you deliberately press Start call in the browser.'
exec .venv/bin/python manage.py serve_voice_quality_test --allow-keychain-prompt
