"""Outcome validation and provisional observations are separate from the actor."""
from .actor import VIOLATIONS
from .policies import quote


def validate_outcome(attempt):
    codes = {e['code'] for e in attempt.actions}
    violations = sorted(codes & VIOLATIONS.keys())
    crm = attempt.crm
    expected = quote(attempt.scenario['service'], attempt.scenario['sqft'], policy=attempt.policy)
    correct_quote = crm.get('initial_quote') == expected.get('initial_deep') and crm.get('recurring_quote') == expected.get('total')
    commitment = next((t['id'] for t in attempt.transcript if t.get('clip') == 'close_ready'), None)
    complete = all(crm.get(f) for f in ['needs', 'follow_up', 'disposition'])
    if violations:
        result = 'policy_correction_required'
    elif commitment and correct_quote and complete and crm.get('disposition') == 'request':
        result = 'qualified_request'
    elif crm.get('disposition') in {'escalation', 'nonfit'} and crm.get('reason') and 'escalate' in codes:
        result = 'escalation_for_review'
    else:
        result = 'incomplete'
    return {'code': result, 'commitment_evidence': commitment, 'quote_correct': correct_quote,
            'violations': [VIOLATIONS[c] for c in violations],
            'booking_confirmed': False, 'deposit_paid': False, 'quote_approved': False,
            'note': 'The practice request does not confirm a booking, payment, or approved quote.'}


def grade_observations(attempt, outcome):
    checks = [
        ('Discovery', 'discover', 'Ask about size, needs, frequency, and timing before price.'),
        ('Relevant value', 'value', 'Connect the recommended service to the customer’s stated needs.'),
        ('Scope and pricing', 'explain', 'Explain the required initial deep and recurring estimate.'),
        ('Objection handling', 'objection', 'Address the reason for the higher first-visit price.'),
        ('Explicit close and next step', 'close', 'Ask for a clear next step and check that the customer agrees.'),
        ('Handoff and notes', 'saved_quote', 'Save accurate quote figures and a useful follow-up note.'),
    ]
    rows = []
    events = {e['code']: e for e in attempt.actions}
    for title, code, coaching in checks:
        event = events.get(code)
        observed = bool(event)
        if code == 'close':
            observed = outcome['code'] == 'qualified_request'
        if code == 'saved_quote':
            observed = bool(event) and outcome['quote_correct'] and bool(attempt.crm.get('follow_up'))
        if code == 'explain':
            discovery = events.get('discover')
            observed = bool(event and discovery and discovery['order'] < event['order']) and not outcome['violations']
        rows.append({'title': title, 'status': 'Shown in this practice' if observed else 'Needs more practice',
                     'evidence': event.get('evidence') if event else None, 'coaching': coaching,
                     'primary': code == 'close'})
    return {'outcome': outcome, 'observations': rows, 'automatic_pass': None,
            'weights': None, 'confidence': 'This feedback uses the responses and notes saved here. It does not assess unscripted speech or real customer calls.',
            'cadence': 'Speaking pace is not measured. Audio playback and app delays do not affect feedback.',
            'manager_required': True}
