> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Local demo audio update

Current recordings: `training/static/training/audio/samantha-v2/`.
Manifest: `manifest.json`, including exact scripts, duration, voice, and SHA-256 hashes.

- Shorter customer and trainee lines use conversational phrasing while retaining accurate prices and commitments.
- Samantha is the current default, rendered locally at 165 words per minute as 24 kHz, 16-bit PCM WAV.
- Sales Practice includes the same opening line in three usable local voices: Samantha (US), Karen (Australia), and Daniel (UK). These are comparison samples; playing one does not change an attempt's voice.
- All 10 customer clips and three previews rendered successfully. Tests verify nonempty PCM audio, durations, and manifest hashes. Browser playback is checked separately.
- The Mac voice catalog also listed an enhanced Siri voice. The public speech API returned no available voice for that identifier during a local render test. No audio was produced from it and nothing was downloaded. It was not selected.

This is still system-generated prerecorded speech. It is not live two-way AI, cannot hear the trainee, and may still sound synthetic. The changes improve the script and provide choices; perceived voice quality requires Andrew's listening review. No accent or voice preference is scored.

Original audio files remain unchanged. Older attempts keep their original recordings and script. New attempts snapshot the current customer lines, trainee lines, and audio version. Subsequent script changes cannot silently rewrite their conversation. Usage records use the correct audio version and actual clip duration; charges remain zero.

Rebuild only missing current-version files with:

```
.venv/bin/python manage.py build_audio
```

The builder refuses changed scripts within an existing version. Add a new version for a future recording set rather than overwriting attempt history. No new software, voice model, account, cloning service, or paid API was installed or used.

## Current version: Samantha v3

New calls now use `training/static/training/audio/samantha-v3/`. The manifest records original conversational phrases, per-phrase rates (171–180 words per minute), explicit pauses (120–240 ms between selected phrases), durations and hashes. Rendering separate phrases gives the caller room to hesitate or ask a question. Ten clips were generated with the installed Samantha voice; no voice/model download or paid service was used. Prior legacy/v2 clips and three comparison previews are preserved byte-for-byte.

This is a concrete script/pacing change, not a claim of human-equivalent voice quality. Browser tests confirm decoding, playback and advancing playback time. They do not assess perceived naturalness. Enhanced Siri availability was not established through the supported local speech API. A better voice/live conversation needs an approved, tested provider; no account or paid request was made.

Optional trainee recording is now implemented separately: explicit microphone start, two-minute mono WAV capture, preview/discard/save, private authenticated replay, up to ten clips per active attempt. QA used Chrome's synthetic microphone only. There is no speech-to-text, pronunciation/accent/cadence score, or AI judgment of the recorded answer.
