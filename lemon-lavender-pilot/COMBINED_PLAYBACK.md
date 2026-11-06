> Historical project document. Read [TRANSFER_HANDOFF.md](TRANSFER_HANDOFF.md) first. Old approvals, paths and test results do not authorize live activity in this transferred copy.

## Current checkpoint — sales training repairs verified

The current app has **6 active sales lessons / 18 steps / 4 written rehearsals**. Written responses receive question-specific local revision guidance and remain pending human review; multiple-choice correctness no longer praises unassessed writing. Existing-customer complaint content is retired with saved history preserved. Older recordings have **separate speaker playback only** because their timing cannot support a reliable combined call. Future browser-rendered capture, including playback stops, is mock-tested; voice naturalness remains unresolved.

**287 automated tests pass**, along with targeted browser checks. Main data, original recordings and paid authorization histories are preserved. No new paid call was made for these repairs. Both local ports (8765 and 8767) run with paid calling disabled. The earlier corrected fictional OpenAI test and transcript coaching already succeeded within the original cap: 234 total voice seconds, approximately $0.20 estimated combined cost; its authorization is closed.

Current evidence, screenshots and limitations: [SALES_REPAIR_STATUS.md](SALES_REPAIR_STATUS.md). Further requested work: [SALES_ENHANCEMENT_BACKLOG.md](SALES_ENHANCEMENT_BACKLOG.md). Earlier sections below are historical and do not override this checkpoint.

---

# One playback for the full call

The main review player now combines the trainee and customer in one private WAV. Original recordings and immutable call evidence remain untouched and accessible in **Original speaker recordings**. Starting any player pauses the others. Authenticated learner ownership and trainer/admin access apply to all three files; GET/HEAD byte ranges support native seeking.

## Andrew's completed call

Call: `f05578e6-0f4f-48f6-8c3c-3ff813a46198`.

- The combined recording is available at the saved-call page, approximately 52.133 seconds long.
- **Alignment is approximate.** This call saved trainee capture order and customer receipt-time padding, not a complete shared-clock sample map. It cannot be exactly reconstructed from the available timestamps. The review mixes the original file origins without concatenating speakers, guessing offsets from the transcript, or removing pauses.
- The on-page notice states this limitation. Both original recordings remain available for comparison.
- Provider reported 53 voice seconds and a real transcript-coaching response (678 input / 411 output tokens). Estimated total: $0.0450954667, about 5¢; provider invoice unverified. The separately approved one-start microphone allowance is closed.
- The original synthetic authorization remains closed with both historical sessions and its original $2 / 600-second cap preserved. Its confirmed 234 voice seconds plus coaching estimate remains $0.1959664.

## Future capture

An AudioWorklet records input frame positions on the same 24 kHz AudioContext clock used to schedule customer output. Input segments retain their source positions and render-clock offsets; customer chunks retain source ranges, event IDs and scheduled playback frames. The derived mix places those segments on that shared clock, preserving recorded pauses and overlap and trimming queued output at the reported stop time. Unacknowledged customer chunks are omitted, with the result labeled partial. Missing or inconsistent timing fails visibly instead of guessing.

Browser scheduling is not proof of sound reaching the listener. Device input/output latency and microphone echo are not corrected. The final unsubmitted input block can omit up to 85 ms. This is review audio, never a learner cadence or health/personality assessment.

## Local implementation

- Mono 16-bit WAV, 24 kHz output. Two speakers are each mixed at half amplitude so overlap cannot digitally clip.
- Existing supported mono PCM tracks at other sample rates are resampled with linear interpolation. No dependency, remote media service or upload.
- Derived WAV and provenance manifest use private permissions, atomic replacement and a per-call file lock. Source hashes and timing hashes make repeated saves idempotent; originals are never overwritten.
- Missing tracks, corrupt files, invalid sample maps and symlinked source files are rejected. Recording duration and memory are bounded to the existing five-minute limit.
- New recordings persist the map in normal call evidence. Legacy evidence files are not edited to add invented timing.

## Verification

`training/test_combined_audio.py` covers unequal lengths, offsets, preserved gaps, overlap, clipping, sample-rate differences, stop trimming, missing tracks, invalid timing, duplicate acknowledgments, repeated generation, corrupt cache recovery, private permissions, foreign learner denial, manager access, HEAD and byte-range requests.

The disposable browser mock produced a `shared_clock` mix from generated input; no physical microphone or paid provider was used. Browser review of the real saved call verified play, seek, exclusive playback and trainer access on localhost. Chrome ran with audio muted: automated playback and decoded samples were checked; **no human auditory quality assessment was performed**.

Evidence: `artifacts/polish-browser-review.json`, `artifacts/combined-mock-timing.json`, `artifacts/combined-unit-tests.txt`, `artifacts/polish-test-results.txt`, `artifacts/polish-preservation.json`.
