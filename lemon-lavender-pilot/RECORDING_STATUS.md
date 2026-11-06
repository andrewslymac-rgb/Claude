> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

# Recording status: precise before / after

## Before the guided redesign

The checkout supported **prerecorded customer playback**, not trainee recording. There were 23 existing static WAV files: ten original customer clips, ten Samantha-v2 customer clips, and three installed-voice comparison previews. These were generated demo assets, not trainee microphone captures or uploads.

There was no trainee recording model/table, upload endpoint, recording UI, or private recording directory. Permissions-Policy explicitly blocked microphone access. The saved transcript described selected written trainee responses and scripted customer replies; it was not speech-to-text. No previous real trainee recording functionality can be substantiated from this checkout. Any statement that the earlier version already saved trainee recordings should be corrected.

## Added by the guided redesign

- Explicit Record response → browser permission → Stop → preview → Save locally / Discard.
- Up to 120 seconds per canonical mono 16-bit PCM WAV, ten clips per active attempt. The server validates type, structure, size and duration; it ignores client duration claims. Duplicate content is acknowledged without duplicating a record. New audio is rejected after expiry/submission or at the clip cap.
- Private local files (0600) under `.data/recordings/` (0700), random IDs, authenticated owner/trainer/admin playback, and saved recording labels/timestamps on the attempt page. No static serving or external upload.
- Failed save preserves the browser preview for retry. Stop releases tracks. Leaving the page releases tracks and discards unsaved data; a browser navigation warning protects unsaved recording work where supported.
- Existing customer playback, scripts and evidence remain separate. Recording is optional and does not feed the customer actor or grader.

## Verification actually performed

148 automated tests passed after the further curriculum/reliability pass. Recording tests cover private replay, cross-learner/staff write denial, anonymous read denial, deduplication, malformed data, duration boundary, upload size, expiry/submitted freeze, ten-clip cap and scoped microphone policy.

Installed Chrome's **synthetic microphone** exercised the real browser capture/PCM encoding, preview, save endpoint, reload, learner replay, and trainer replay. Playback time advanced without media errors. The browser also exercised denied microphone permission, explicit track stopping, a simulated failed-save response followed by successful retry, and discarding a second preview without adding a recording.

**Physical microphone capture has not been tested.** No real person's voice was recorded in QA. Transcription, audio content/cadence scoring, live two-way AI, interruption handling and perceived human voice quality are not verified or implemented. Browser QA used a separate disposable database and recordings directory, leaving Andrew's saved training evidence unchanged.

## Further reliability pass

The recorder now requires JSON confirmation with a recording ID before discarding its preview. Chrome verified an actual expired sign-in, re-login in another tab and successful retry with the refreshed CSRF cookie. Timed-out saves, simulated storage errors and a lost acknowledgment preserve the preview; retry after a lost acknowledgment leaves one saved clip. Starting another recording cannot silently erase a preview. Private access checks were extended for revoked, missing-profile and admin cases, and storage/database write failures roll back without exposing private error details. No access grant or physical-microphone test was added.
