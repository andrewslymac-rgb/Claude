from copy import deepcopy
from decimal import Decimal, ROUND_CEILING
from .owner_decisions import DECISIONS

POLICY = {
    'version': 'll-fictional-2026-10-08-v6', 'hourly': 85,
    'owner_decisions': deepcopy(DECISIONS),
    'services': {'monthly': {'rate': 650, 'minimum': 150},
                 'biweekly': {'rate': 775, 'minimum': 110},
                 'weekly': {'rate': 850, 'minimum': 110},
                 'deep': {'rate': 300, 'minimum': 325},
                 'move': {'rate': 275, 'minimum': 400}},
    'extras': {'oven': 45, 'fridge': 45, 'dishwasher': 35, 'cabinets': 65, 'windows': 8},
    'recurring_requires_initial_deep': True, 'manual_walkthrough_over': 4000,
    'online_booking': False,
    'residential_only': True, 'reset_deep_after_more_than_days': 30,
    'cancellation_notice_hours': 48,
    'lead_followup_version': 'owner-lead-followup-2026-10-06-v3',
    'unresolved': ['payment methods and timing', 'deposit amount and terms', 'explicit promotion-code eligibility',
                   'VA quoting, booking, deposit and availability authority', 'holiday exclusions', 'final-message channels',
                   'escalation contacts', 'window unit', 'freezer unit', 'recurring extras frequency',
                   'cancellation fee amount', 'waiver authority'],
}
SCENARIO = {
    'version': 'inbound-2000-v3', 'title': 'A busy household, a careful first step',
    'customer': 'Taylor Sample', 'sqft': 2000, 'service': 'biweekly',
    'needs': 'Kitchen buildup and bathrooms; wants a manageable routine.',
    'timing': 'Hopes to start next week; availability is not confirmed.',
    'objection': 'Why does the first visit cost more?',
    'requirements': ['discover', 'value', 'explain', 'objection', 'saved_quote', 'close'],
}
RUBRIC = {'version': 'observations-v3-unapproved', 'weights': None, 'pass_threshold': None,
          'readiness_requires': DECISIONS['readiness_requires'],
          'status': 'Provisional observations only; manager review required.',
          'categories': ['Discovery', 'Relevant value', 'Scope and pricing', 'Objection handling',
                         'Explicit close and next step', 'Handoff and notes'],
          'primary_goal': 'Earn a paid deposit through accurate, pressure-free selling. Only an explicit simulated deposit is a pilot win; a legitimate next step is still useful.'}


def snapshots():
    from .actor import ACTIONS, CLIPS, VOICE_VERSION
    scenario = {**deepcopy(SCENARIO), 'audio_version': VOICE_VERSION,
                'customer_lines': deepcopy(CLIPS), 'trainee_lines': {key:value[1] for key,value in ACTIONS.items()}}
    return deepcopy(POLICY), scenario, deepcopy(RUBRIC)


def requires_reset(days_since_clean, policy=None):
    if isinstance(days_since_clean, bool) or not isinstance(days_since_clean, int) or days_since_clean < 0:
        raise ValueError('Days since cleaning must be a nonnegative whole number.')
    return days_since_clean > (policy or POLICY)['reset_deep_after_more_than_days']


def quote(service, sqft, extras=(), policy=None):
    policy = policy or POLICY
    if service not in policy['services'] or isinstance(sqft, bool) or not isinstance(sqft, int) or sqft < 1:
        raise ValueError('Choose a valid service and positive whole square footage.')
    if sqft > policy['manual_walkthrough_over']:
        return {'manual': True, 'reason': 'Manual walkthrough required above 4,000 sq ft.'}
    if len(set(extras)) != len(extras) or any(e not in policy['extras'] for e in extras):
        raise ValueError('Invalid extra.')
    if 'windows' in extras:
        raise ValueError('Window unit is unresolved; manager clarification required.')
    if service in {'weekly', 'biweekly', 'monthly'} and extras:
        raise ValueError('Recurring extras frequency is unresolved; manager clarification required.')
    terms = policy['services'][service]
    base = max(terms['minimum'], 5 * int((Decimal(sqft) * 17 / terms['rate']).to_integral_value(rounding=ROUND_CEILING)))
    addon = 0 if service == 'move' else sum(policy['extras'][e] for e in extras)
    total = 5 * int((Decimal(base + addon) / 5).to_integral_value(rounding=ROUND_CEILING))
    result = {'manual': False, 'base': base, 'total': total, 'extras': list(extras), 'service': service, 'sqft': sqft}
    if service in {'weekly', 'biweekly', 'monthly'}:
        result['initial_deep'] = quote('deep', sqft, policy=policy)['total']
    return result
