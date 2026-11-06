"""Pure synthetic workflow. No provider, email, phone, network, or scheduler calls."""
from copy import deepcopy
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

FOLLOWUP_POLICY = {
    'version': 'owner-lead-followup-2026-10-06-v3',
    'business_weekdays': [0, 1, 2, 3, 4],
    'business_hours': {'timezone': 'America/Los_Angeles', 'opens': '08:00', 'closes': '17:00'},
    'first_outreach_seconds': 300,
    'after_hours_first_outreach': {'deadline': '08:05', 'basis': 'next_business_opening'},
    'stages': [
        {'name': 'First outreach · within five minutes', 'business_day': 1, 'actions': ['call', 'voicemail', 'text', 'email']},
        {'name': 'Business day 1 · end of day', 'business_day': 1, 'actions': ['call', 'text']},
        {'name': 'Business day 2 · morning', 'business_day': 2, 'actions': ['call', 'text', 'email']},
        {'name': 'Business day 2 · end of day', 'business_day': 2, 'actions': ['call', 'text', 'email']},
        {'name': 'Business day 3 · one more attempt', 'business_day': 3, 'actions': ['call', 'text', 'email']},
        {'name': 'After business day 3 · final message and archive', 'actions': ['final_message', 'archive']},
    ],
    'final_message': 'We have tried to reach you about your cleaning request. If you are still interested, please reach out. Otherwise, we will archive your request and stop follow-up.',
    'unresolved': ['Holiday exclusions', 'Final message delivery channel(s)'],
    'response_stops_sequence': True, 'opt_out_stops_outreach': True,
}
PREFERENCES = {
    'all': ['call', 'text', 'email'], 'call_text': ['call', 'text'], 'call_only': ['call'],
    'text_only': ['text'], 'email_only': ['email'],
}
ACTION_LABELS = {
    'answer': 'Answer the live inbound call immediately', 'call': 'Rehearse call · no answer',
    'voicemail': 'Rehearse leaving voicemail', 'text': 'Rehearse text', 'email': 'Rehearse email',
    'final_message': 'Rehearse final message · channels pending', 'archive': 'Archive fictional request & stop',
    'advance': 'Move to the next labeled contact window', 'response': 'Customer responds',
    'opt_out': 'Customer opts out', 'preference': 'Customer replies with a channel preference',
    'callback': 'Record the customer’s callback promise', 'end': 'End this practice & keep evidence',
}
STATUS_LABELS = {'active': 'No response yet · practice in progress', 'responded': 'Customer responded · sequence stopped',
    'opted_out': 'Opted out · all outreach stopped', 'archived': 'Archived · follow-up stopped',
    'policy_hold': 'Owner clarification needed', 'no_channel': 'No permitted valid channel · manager review',
    'expired': 'Practice time limit reached', 'ended': 'Practice ended'}
EMAIL_FIXTURES = {'valid': 'taylor@example.invalid', 'invalid': 'taylor@', 'missing': ''}
WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
AFTER_HOURS_FIXTURES = {
    'friday_evening': ('Friday evening · Oct 9, 2026, 5:30 PM PDT', '2026-10-09T17:30:00-07:00'),
    'saturday': ('Saturday · Oct 10, 2026, noon PDT', '2026-10-10T12:00:00-07:00'),
    'spring_dst': ('Friday before spring DST · Mar 6, 2026, 5:30 PM PST', '2026-03-06T17:30:00-08:00'),
    'fall_dst': ('Friday before fall DST · Oct 30, 2026, 5:30 PM PDT', '2026-10-30T17:30:00-07:00'),
    'before_open': ('Monday before opening · Oct 12, 2026, 7:30 AM PDT', '2026-10-12T07:30:00-07:00'),
}


class WorkflowError(ValueError):
    pass


def business_day_labels(day_one, policy):
    """Weekday-only training labels. No date, holiday, office-hour, or scheduler inference."""
    weekdays = policy.get('business_weekdays')
    if weekdays != [0, 1, 2, 3, 4]:
        raise WorkflowError('This policy snapshot does not define Monday–Friday business days.')
    if isinstance(day_one, bool) or not isinstance(day_one, int) or day_one not in weekdays:
        raise WorkflowError('Choose an already-established fictional day 1 from Monday through Friday. Weekend lead handling is not inferred.')
    days = []
    current = day_one
    for number in range(1, 4):
        days.append({'day': number, 'weekday': WEEKDAYS[current]})
        current = (current + 1) % 7
        while current not in weekdays:
            current = (current + 1) % 7
    return days


def business_hours_context(at, policy):
    """Convert an aware instant to regular Pacific hours; never schedule a response.

    The window is [08:00, 17:00). Holiday treatment is deliberately undetermined.
    Earlier snapshots without business hours return no inferred hours.
    """
    hours = policy.get('business_hours')
    if not hours:
        return None
    if at.tzinfo is None or at.utcoffset() is None:
        raise WorkflowError('Supply a timezone-aware instant; do not guess its time zone.')
    local = at.astimezone(ZoneInfo(hours['timezone']))
    regular = local.weekday() in policy['business_weekdays'] and time.fromisoformat(hours['opens']) <= local.time() < time.fromisoformat(hours['closes'])
    return {'local': local, 'display': local.strftime('%a, %b %d · %I:%M %p %Z (%z)'),
            'timezone': hours['timezone'], 'within_regular_hours': regular, 'holiday_policy': 'pending'}


def after_hours_window(arrived_at, policy):
    """Calculate fictional regular-weekday timing only; never schedule outreach.

    Before opening on a weekday, the next opening is that morning. After closing
    or on a weekend, advance to the next weekday. No holiday calendar is assumed.
    """
    rule = policy.get('after_hours_first_outreach')
    if not rule:
        raise WorkflowError('This saved policy has no approved after-hours deadline.')
    context = business_hours_context(arrived_at, policy)
    if not context or context['within_regular_hours']:
        raise WorkflowError('Choose an after-hours fictional arrival for this exercise.')
    local = context['local']
    opens = time.fromisoformat(policy['business_hours']['opens'])
    day = local.date()
    if local.weekday() in policy['business_weekdays'] and local.time() >= opens:
        day += timedelta(days=1)
    while day.weekday() not in policy['business_weekdays']:
        day += timedelta(days=1)
    zone = ZoneInfo(policy['business_hours']['timezone'])
    return {'arrived_at': local.isoformat(),
            'opens_at': datetime.combine(day, opens, zone).isoformat(),
            'deadline_at': datetime.combine(day, time.fromisoformat(rule['deadline']), zone).isoformat()}


def prepare_scenario(values, policy):
    scenario = {'version': 'synthetic-lead-workflow-v3', **deepcopy(values)}
    if scenario['context'] == 'after_hours' and scenario['arrival'] != 'live_call':
        fixture = scenario.get('after_hours_fixture') or 'friday_evening'
        if fixture not in AFTER_HOURS_FIXTURES:
            raise WorkflowError('Choose a supported fictional arrival.')
        scenario['after_hours_fixture'] = fixture
        window = after_hours_window(datetime.fromisoformat(AFTER_HOURS_FIXTURES[fixture][1]), policy)
        scenario['first_outreach_window'] = window
        scenario['day_one_weekday'] = datetime.fromisoformat(window['deadline_at']).weekday()
    return scenario


def after_hours_context(scenario, policy):
    window = scenario.get('first_outreach_window')
    if not window or not policy.get('after_hours_first_outreach'):
        return None
    zone = ZoneInfo(policy['business_hours']['timezone'])
    return {key: datetime.fromisoformat(value).astimezone(zone).strftime('%A, %b %d, %Y · %I:%M %p %Z (%z)')
            for key, value in window.items()}


def stage_heading(state, scenario, policy):
    stage = policy['stages'][state['stage']]
    context = after_hours_context(scenario, policy)
    if state['stage'] == 0 and context:
        return 'After-hours first outreach · by ' + context['deadline_at']
    if stage.get('business_day') and 'day_one_weekday' in scenario and policy.get('business_weekdays'):
        day = business_day_labels(scenario['day_one_weekday'], policy)[stage['business_day'] - 1]
        return stage['name'] + ' · ' + day['weekday']
    return stage['name']  # Preserve the meaning of earlier saved policy/scenario snapshots.


def valid_email(value):
    try:
        validate_email(value)
        return True
    except ValidationError:
        return False


def initial_state(scenario, policy=None):
    policy = FOLLOWUP_POLICY if policy is None else policy
    allowed = list(PREFERENCES[scenario['preference']])
    email_valid = valid_email(EMAIL_FIXTURES[scenario['email_case']])
    status = 'active'
    if scenario['context'] == 'after_hours' and scenario['arrival'] != 'live_call' and not (policy.get('after_hours_first_outreach') and scenario.get('first_outreach_window')):
        status = 'policy_hold'
    elif scenario['arrival'] != 'live_call' and not any(c != 'email' or email_valid for c in allowed):
        status = 'no_channel'
    return {'status': status, 'stage': 0, 'completed': [], 'allowed_channels': allowed,
            'email_valid': email_valid, 'elapsed_seconds': 0, 'timing_flags': [], 'callback': None,
            'final_rehearsed': False}


def stage_actions(state, scenario, policy):
    if state['status'] != 'active':
        return []
    if scenario['arrival'] == 'live_call':
        return ['answer']
    actions = policy['stages'][state['stage']]['actions']
    def permitted(action):
        if action in {'final_message', 'archive'}:
            return True  # Abstract rehearsal only; no final channel is selected or assumed.
        channel = 'call' if action == 'voicemail' else action
        return channel in state['allowed_channels'] and (channel != 'email' or state['email_valid'])
    return [a for a in actions if permitted(a)]


def pending_actions(state, scenario, policy):
    return [a for a in stage_actions(state, scenario, policy) if a not in state['completed']]


def advance_state(state, scenario, policy, action, data=None):
    """Return a copied state and a local evidence event; no external side effects."""
    data = data or {}
    new = deepcopy(state)
    status = state['status']
    if action not in ACTION_LABELS:
        raise WorkflowError('Unknown practice action.')
    if action == 'opt_out':
        if status in {'opted_out', 'expired', 'ended'}:
            raise WorkflowError('This practice has already stopped.')
        new['status'] = 'opted_out'
        new['callback'] = None
        detail = 'Customer opted out. All outreach and any callback promise stopped. No message sent.'
    elif action in {'response', 'preference'}:
        if status in {'opted_out', 'expired', 'ended'}:
            raise WorkflowError('This practice has stopped; do not restart outreach.')
        new['status'] = 'responded'
        if action == 'preference':
            preference = data.get('preference')
            if preference not in PREFERENCES:
                raise WorkflowError('Choose a supported channel preference.')
            new['allowed_channels'] = list(PREFERENCES[preference])
            new['callback'] = None
            detail = 'Customer replied with a channel preference. The no-response sequence stopped; permitted channels: ' + ', '.join(new['allowed_channels']) + '.'
        else:
            detail = 'Customer responded. The no-response sequence stopped. Clarify their needs and next step; do not blindly continue outreach.'
    elif action == 'callback':
        if status != 'responded':
            raise WorkflowError('Record a customer response before tracking their callback promise.')
        channel = data.get('channel')
        when = data.get('promised_when', '').strip()
        note = data.get('note', '').strip()
        if channel not in new['allowed_channels'] or (channel == 'email' and not new['email_valid']):
            raise WorkflowError('Honor the customer’s permitted channels and skip invalid email.')
        if not 8 <= len(when) <= 200 or not 8 <= len(note) <= 500:
            raise WorkflowError('Record the promised date/time with its time zone and a useful callback note.')
        new['callback'] = {'channel': channel, 'promised_when': when, 'note': note, 'scheduled': False}
        detail = f'Callback promise recorded for human handling: {when}; channel: {channel}. {note} No scheduler or outreach was started.'
    elif action == 'end':
        if status in {'ended', 'expired'}:
            raise WorkflowError('This practice is already ended.')
        new['status'] = 'ended'
        detail = 'Practice ended. Saved evidence remains available.'
    else:
        if status != 'active':
            raise WorkflowError('The no-response sequence has stopped. Further outreach is blocked.')
        pending = pending_actions(state, scenario, policy)
        if action == 'advance':
            if pending:
                raise WorkflowError('Complete the permitted actions in this window before advancing.')
            if new['stage'] >= len(policy['stages']) - 1:
                raise WorkflowError('There is no further outreach after the final step.')
            new['stage'] += 1
            new['completed'] = []
            detail = 'Moved to ' + stage_heading(new, scenario, policy) + '. This is a virtual training label, not a scheduled date.'
        else:
            if not pending or action != pending[0]:
                raise WorkflowError('Follow the current step in order and honor channel preferences. Invalid or unavailable email is skipped.')
            if new['stage'] == 0:
                seconds = data.get('elapsed_seconds', 0)
                if isinstance(seconds, bool) or not isinstance(seconds, int) or not new['elapsed_seconds'] <= seconds <= 3600:
                    raise WorkflowError('Use a nondecreasing simulated elapsed time from 0 to 3,600 seconds.')
                new['elapsed_seconds'] = seconds
                if scenario['arrival'] == 'live_call':
                    if data.get('answer_timing') != 'immediate':
                        new['timing_flags'].append('Inbound call was not answered immediately in the rehearsal.')
                elif scenario.get('first_outreach_window') and policy.get('after_hours_first_outreach'):
                    window = scenario['first_outreach_window']
                    performed_at = datetime.fromisoformat(window['opens_at']) + timedelta(seconds=seconds)
                    if performed_at > datetime.fromisoformat(window['deadline_at']):
                        new['timing_flags'].append(f'{ACTION_LABELS[action]} occurred after the approved 08:05 AM Pacific deadline ({seconds} simulated seconds after opening).')
                elif seconds > policy['first_outreach_seconds']:
                    new['timing_flags'].append(f'{ACTION_LABELS[action]} occurred after five minutes ({seconds} simulated seconds).')
            new['completed'].append(action)
            if action == 'answer':
                new['status'] = 'responded'
                detail = 'Answered the synthetic inbound call. Handle the conversation; the no-response sequence does not apply.'
            elif action == 'final_message':
                new['final_rehearsed'] = True
                detail = 'Final message rehearsed without selecting delivery channels (owner decision pending): ' + policy['final_message']
            elif action == 'archive':
                new['status'] = 'archived'
                detail = 'Fictional request archived after the final-message rehearsal. No further follow-up. Final delivery channels remain unapproved; no message was delivered.'
            else:
                detail = ACTION_LABELS[action] + ' completed locally. No customer communication; no call or message sent.'
                if new['stage'] == 0:
                    if scenario.get('first_outreach_window') and policy.get('after_hours_first_outreach'):
                        window = scenario['first_outreach_window']
                        performed_at = datetime.fromisoformat(window['opens_at']) + timedelta(seconds=new['elapsed_seconds'])
                        detail += f' Fictional action time: {performed_at.isoformat()}; saved deadline: {window["deadline_at"]}. Simulated seconds since 08:00 opening: {new["elapsed_seconds"]}.'
                    else:
                        detail += f' Simulated elapsed time: {new["elapsed_seconds"]} seconds.'
    return new, {'action': action, 'stage': state['stage'], 'label': ACTION_LABELS[action], 'detail': detail}
