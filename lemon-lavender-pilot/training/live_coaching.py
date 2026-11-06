"""Validate text coaching evidence; keep operational outcome checks independent."""
import re
from copy import copy
from .evaluation import validate_outcome
from .live_provider import CATEGORIES


def transcript_turns(fragments):
    turns = []
    for fragment in fragments:
        speaker = 'Learner' if fragment['speaker'] == 'learner' else 'Customer'
        # Fragment times are approximate; grouping is display-only, never cadence.
        if turns and turns[-1]['speaker'] == speaker and fragment['start_ms'] - turns[-1]['end_ms'] < 1500:
            turns[-1]['text'] += fragment['text']
            turns[-1]['end_ms'] = fragment['end_ms']
        else:
            turns.append({'id': 'live-' + str(len(turns) + 1), 'speaker': speaker,
                'text': fragment['text'], 'start_ms': fragment['start_ms'], 'end_ms': fragment['end_ms']})
    return turns


def local_policy_flags(attempt):
    patterns = {
        'waive': r'\b(?:we|i)\s+(?:can|will|could)\s+(?:waive|skip|remove)\s+(?:the\s+)?(?:initial\s+)?deep',
        'discount': r'\b(?:give|offer|apply)\s+(?:you\s+)?(?:a\s+)?\d+\s*(?:%|percent)\s+(?:off|discount)',
        'falsebook': r"\b(?:you(?:'re| are)|your (?:appointment|booking) is)\s+(?:all\s+)?(?:booked|confirmed)\b",
    }
    found = []
    for turn in attempt.transcript:
        if turn.get('speaker') != 'Learner':
            continue
        for code, pattern in patterns.items():
            if re.search(pattern, turn['text'], re.IGNORECASE):
                found.append({'code': code, 'evidence': turn['id'], 'order': len(attempt.actions) + len(found),
                              'source': 'conservative-live-text-policy-check'})
    return found


def build_feedback(attempt, report=None):
    report = report if isinstance(report, dict) else {}
    by_id = {t['id']: t for t in attempt.transcript if t.get('speaker') in {'Learner','Customer'}}
    observations = []
    supplied = report.get('observations', [])
    supplied = supplied if isinstance(supplied, list) else []
    for category in CATEGORIES:
        row = next((r for r in supplied if isinstance(r, dict) and r.get('title') == category), {})
        evidence = row.get('evidence_ids', [])
        ids = [v for v in evidence if isinstance(v, str) and v in by_id][:4] if isinstance(evidence, list) else []
        grounded = any(by_id[v]['speaker']=='Learner' for v in ids) and row.get('status') == 'observed'
        observations.append({'title': category, 'status': 'Provisional observation — verify audio' if grounded else 'Needs manager review',
            'evidence': ids[0] if ids else None, 'evidence_ids': ids,
            'coaching': str(row.get('coaching', 'Review the saved audio and notes; AI coaching is unavailable.'))[:700],
            'primary': category == 'Explicit close and next step'})
    validated_attempt=copy(attempt)
    validated_attempt.actions=[e for e in attempt.actions if e.get('source')!='conservative-live-text-policy-check']
    if attempt.scenario.get('schema_version'):
        from .actor import VIOLATIONS
        expected=attempt.scenario['pricing']; crm=attempt.crm
        quote_correct = (crm.get('initial_quote') is None and crm.get('recurring_quote') is None if expected['manual'] else
            crm.get('initial_quote') == expected.get('initial_deep',expected['total']) and
            crm.get('recurring_quote') == (expected['total'] if 'initial_deep' in expected else None))
        violations=[VIOLATIONS[e['code']] for e in validated_attempt.actions if e.get('code') in VIOLATIONS]
        outcome={'code':'policy_correction_required' if violations else 'manager_verification_required',
                 'commitment_evidence':None,'quote_correct':quote_correct,'violations':violations,
                 'booking_confirmed':False,'deposit_paid':False,'quote_approved':False}
    else:
        outcome = validate_outcome(validated_attempt)
    # Never fabricate the scripted actor's close_ready clip from a model's yes.
    # The manager determines whether a live spoken service request was qualified.
    flags = report.get('policy_flags', [])
    flags = flags if isinstance(flags, list) else []
    supported_flags = []
    for event in attempt.actions:
        if event.get('source')!='conservative-live-text-policy-check':continue
        turn=by_id.get(event.get('evidence'))
        if turn and turn.get('speaker')=='Learner':
            supported_flags.append({'issue':'Possible '+event['code']+' claim; check quotation, negation and audio context.',
                'evidence_id':turn['id'],'exact_quote':turn['text'][:500]})
    for flag in flags[:8]:
        if not isinstance(flag, dict):
            continue
        turn = by_id.get(flag.get('evidence_id'))
        quote = flag.get('exact_quote')
        if turn and turn.get('speaker') == 'Learner' and isinstance(quote, str) and quote.strip() and quote in turn['text']:
            supported_flags.append({'issue': str(flag.get('issue', 'Possible policy issue'))[:300],
                                    'evidence_id': turn['id'], 'exact_quote': quote[:500]})
    # A quoted substring is not a proven violation. Keep AI/regex flags
    # separate; the manager must resolve them explicitly against the audio.
    if supported_flags and not outcome['violations']:
        outcome['code']='manager_policy_review_required'
    outcome['note'] = 'Live spoken commitment requires manager verification against audio and actual saved notes. No booking, payment or quote approval occurred.'
    return {'outcome': outcome, 'observations': observations, 'policy_flags': supported_flags,
        'automatic_pass': None, 'weights': None, 'manager_required': True,
        'confidence': 'Provisional transcript-based coaching. Speech recognition and model interpretation can be wrong. Customer captions may include interrupted or unplayed speech; verify evidence against rendered audio where available.',
        'cadence': 'Not measured. Transcript fragment timing and network/AI delays are not speaking-cadence evidence.',
        'next_practice': str(report.get('next_practice', 'Choose one observable behavior with your trainer.'))[:700]}
