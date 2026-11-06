"""One explicitly reviewed prompt-only refresh; never auto-approve future changes.

Parent requested this review/refresh within Andrew's existing one-start $1/300s
authorization. Owner facts were approved in Sentinel_39d5310d2e48819199a2b46b9d7eb182,
Sentinel_6b0181cfaa448191b30be6fdbff22776 and Sentinel_0d61dfda3cbc8191aa5bfbcbba07c2a6.
The old config was reconstructed and matched exactly. Only instructions differ;
model, voice, caller, difficulty, data handling, transport and all caps stay fixed.
See artifacts/quality-configuration-review/comparison.json. This records a new
review without rewriting the original grant or treating it as a new allowance.
"""
import hashlib
import json

REVIEW = {
    'id':'quality-prompt-owner-policy-review-2026-10-08-v1',
    'approval':'andrew-voice-quality-2026-10-08T01:28Z',
    'assignment_id':3,
    'original_authorization_sha256':'ca5813ce98124bdee0c483dae167c7d76888b275d9632d3be8e42dab618a184a',
    'from_sha256':'3f6d8b448fd43c10b466ff4ec179d2b2733bca18b53b5c1897240cf4ab377361',
    'to_sha256':'6e719a9cf85518f325bde3c0c687eab09edea6a0ad0697853152713784a5f642',
}


def reviewed_prompt_refresh(data, current_fingerprint):
    scope=data.get('authorization',{})
    return (data.get('approval')==REVIEW['approval'] and
        scope.get('assignment_id')==REVIEW['assignment_id'] and
        scope.get('configuration_sha256')==REVIEW['from_sha256'] and
        current_fingerprint==REVIEW['to_sha256'] and
        hashlib.sha256(json.dumps(scope,sort_keys=True).encode()).hexdigest()==REVIEW['original_authorization_sha256'])
