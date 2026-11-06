"""Independent outcome validation and draft evidence feedback for local rehearsal."""
from copy import deepcopy
from .sales_actor import replay, trainee_line, VIOLATIONS
from .sales_scenarios import estimate

DRAFT_RUBRIC = {
 'version':'ll-sales-rubric-draft-v2', 'status':'Draft weights only — owner approval and manager review required',
 'weights_approved':False, 'pass_threshold':None, 'automatic_pass':None,
 'primary_goal':'Earn a paid deposit without pressure or unsupported promises. Requests and proposals are useful steps, not wins.',
 'readiness_requires':'Manager-confirmed objection handling with specific learner evidence; no automatic pass.',
 'categories':[
  {'id':'greeting','title':'Greeting and professionalism','proposed_weight':5,'codes':['greet'],
   'coaching':'Name L&L and invite the caller to explain their need. Vocal tone requires listening evidence.'},
  {'id':'discovery','title':'Structured discovery','proposed_weight':18,'codes':['discover','priorities','timing'],
   'coaching':'Ask about property, size, rooms, condition, pets, frequency, extras, timing and location before price.'},
  {'id':'listening','title':'Listening and relevant value','proposed_weight':10,'codes':['value','acknowledge'],
   'coaching':'Be kind, calm and patient; reflect the need, listen and explain clearly without pressure. Tone requires audio evidence; a selected script does not prove spontaneous empathy.'},
  {'id':'objections','title':'Objection handling','proposed_weight':15,'codes':['probe','respond','check'],
   'coaching':'Acknowledge, clarify, answer the actual concern using confirmed facts, then check understanding.'},
  {'id':'closing','title':'Closing and accurate handoff','proposed_weight':30,'codes':['close','choice_close','trial','followup','escalate'],
   'coaching':'Ask for the appropriate explicit next step, verify the customer’s actual agreement and save accurate notes.'},
  {'id':'pricing','title':'Scope and pricing accuracy','proposed_weight':10,'codes':['explain'],
   'coaching':'Separate the required initial deep and recurring estimate. Do not invent a discount or final booking.'},
  {'id':'control','title':'Call structure and control','proposed_weight':7,'codes':['discover','explain','check'],
   'coaching':'Use a relevant question, one concern at a time, and a clear transition. Network waits are not learner delay.'},
  {'id':'clarity','title':'Spoken clarity and pacing','proposed_weight':5,'codes':[],
   'coaching':'Manager listening required. Coach a specific intelligibility moment with a timestamp and confidence; never score accent identity, health or personality.'},
 ],
 'nonnegotiables':['No invented discount','No false policy assurance','No waived mandatory initial deep',
                 'No claim that a request is a booking or payment','No automated employment decision'],
}


def validated_actions(attempt):
    """Do not credit forged/missing transcript pointers or actor assertions."""
    turns={t['id']:t for t in attempt.transcript}
    valid=[]
    for event in attempt.actions:
        if event['code']=='saved_quote':continue
        turn=turns.get(event.get('evidence'),{})
        try:expected=trainee_line(event['code'],attempt.scenario,valid)
        except KeyError:continue
        if turn.get('speaker')=='Trainee (scripted)' and turn.get('text')==expected:
            valid.append(event)
    return valid


def validate_sales_outcome(attempt):
    actions=validated_actions(attempt);state=replay(attempt.scenario,actions)
    pricing=estimate(attempt.policy,attempt.scenario['profile']);crm=attempt.crm
    if pricing['manual']:
        correct_quote=crm.get('initial_quote') is None and crm.get('recurring_quote') is None
    else:
        correct_quote=(crm.get('initial_quote')==pricing.get('initial_deep',pricing['total']) and
                       crm.get('recurring_quote')==(pricing['total'] if 'initial_deep' in pricing else None))
    complete=(all(crm.get(k) for k in ['needs','follow_up','disposition']) and
              all(crm.get(k)==attempt.scenario[k] for k in ['customer','sqft','service']))
    nonrequest_quote_valid=correct_quote or (crm.get('initial_quote') is None and crm.get('recurring_quote') is None)
    commitment=None
    # A customer line must immediately follow the accepted close action; its
    # server result is necessary but insufficient without independent replay/CRM.
    for index,turn in enumerate(attempt.transcript[:-1]):
        following=attempt.transcript[index+1]
        if turn['id']==state['commitment'] and following.get('speaker')=='Customer' and following.get('result')=='request_agreed':
            commitment=following['id']
    violations=[VIOLATIONS[c] for c in sorted(set(state['violations']))]
    result='incomplete'
    drill=attempt.scenario['drill']
    if violations:result='policy_correction_required'
    elif drill=='discovery' and {'greet','discover','priorities','timing'} <= state['met']:result='drill_completed'
    elif drill=='objections' and 'objections_resolved' in state['met']:result='drill_completed'
    elif commitment and correct_quote and complete and crm.get('disposition')=='request':result='qualified_request'
    elif 'escalate' in state['met'] and complete and nonrequest_quote_valid and crm.get('disposition') in {'escalation','nonfit'} and crm.get('reason'):
        result='escalation_for_review'
    elif 'followup' in state['met'] and complete and nonrequest_quote_valid and crm.get('disposition')=='followup':result='followup_agreed'
    return {'code':result,'commitment_evidence':commitment,'quote_correct':correct_quote,'violations':violations,
        'booking_confirmed':False,'deposit_paid':False,'quote_approved':False,
        'simulated_sale':False, 'won':False,
        'win_definition':attempt.policy.get('owner_decisions',{}).get('won_requires','historical request-only practice'),
        'note':'Local scripted practice only. A request, proposal, quote approval or verbal yes is not a win. A trainer must separately record an explicit simulated paid deposit; no real transaction occurs.'}


def sales_feedback(attempt):
    actions=validated_actions(attempt);state=replay(attempt.scenario,actions);outcome=validate_sales_outcome(attempt)
    turns={t['id']:t for t in attempt.transcript};rows=[]
    for category in attempt.rubric['categories']:
        codes=category['codes']; relevant=[r for r in state['responses'] if r['code'] in codes]
        successful={'greet','discover','priorities','timing','value','raise_concern','manual','acknowledge','probe',
                    'respond','concerns_checked','next_concern','request_agreed','followup_agreed','escalation_agreed','interest_only'}
        accepted=[r for r in relevant if r['result'] in successful]
        evidence=[{'id':r['evidence'],'quote':turns[r['evidence']]['text']} for r in relevant if r['evidence'] in turns][-3:]
        status='Selected actions observed — manager review'
        if not codes:status='Unassessed — audio listening required'
        elif not relevant:status='Supplied context — not assessed' if set(codes) <= state['given'] else 'Not yet evidenced'
        elif not accepted:status='Needs practice'
        elif category['id']=='discovery' and not {'discover','priorities','timing'} <= set(state['evidence']):status='Partial discovery evidence'
        elif category['id']=='objections' and 'objections_resolved' not in state['met']:status='Concern still open'
        elif category['id']=='closing':status='Appropriate next step evidenced' if outcome['code'] in {'qualified_request','followup_agreed','escalation_for_review'} else 'Commitment or handoff incomplete'
        elif category['id']=='pricing' and outcome['violations']:status='Policy correction required'
        # A specific selected utterance and a usable improved line, without pretending speech was assessed.
        bad=next((r for r in reversed(relevant) if r['result'] not in successful),None)
        example_code='discover' if bad and bad['result']=='needs_discovery' else (codes[0] if codes else None)
        if category['id']=='objections':example_code='probe'
        if category['id']=='closing' and (attempt.scenario['profile']['ending']!='request' or state['followup_only'] or state['confirmation']):
            example_code='followup' if state['followup_only'] or attempt.scenario['profile']['ending']=='followup' else 'escalate'
        better=trainee_line(example_code,attempt.scenario,actions) if example_code else 'Identify one audible word or phrase, replay it together, and agree on a clearer retry. Record the timestamp and your confidence.'
        rows.append({**category,'status':status,'evidence_quotes':evidence,'evidence_ids':[e['id'] for e in evidence],
                     'better_response':better,'coaching':category['coaching'],'primary':category['id']=='closing'})
    return {'outcome':outcome,'observations':rows,'automatic_pass':None,'numeric_score':None,
        'weights':None,'draft_weights':{c['id']:c['proposed_weight'] for c in attempt.rubric['categories']},
        'manager_required':True,'confidence':'Exact quotes refer to selected rehearsal scripts, not proof of unscripted speech. Notes and any recordings need trainer review.',
        'notes_assessment':'Only structured values and field presence were checked; the meaning and adequacy of written notes remain for trainer review.',
        'cadence':'Unassessed. No timing, pronunciation, accent, personality, health or employment score is inferred from text.',
        'next_practice':'Choose one observable behavior from the evidence, then retry with your trainer’s coaching.'}
