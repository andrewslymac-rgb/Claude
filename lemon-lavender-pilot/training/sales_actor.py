"""Deterministic customer rehearsal. Branches depend on saved practice actions.

This actor produces customer replies only. It does not grade free speech, trust
client success flags, or perform operational actions. State is replayable.
"""
from .sales_scenarios import quote_words, SERVICES

VIOLATIONS = {'discount':'Invented discount', 'waive':'Waived mandatory initial deep',
              'falsebook':'False booking / payment claim', 'assurance':'Unverified screening, insurance or guarantee promise'}
LABELS = {'greet':'Greet and identify L&L', 'discover':'Ask about the property', 'priorities':'Explore priorities and scope',
    'timing':'Clarify timing and location', 'value':'Connect service to the priorities', 'explain':'Explain the estimate',
    'acknowledge':'Acknowledge the current concern', 'probe':'Clarify the concern', 'respond':'Give a relevant response',
    'check':'Check whether the concern is addressed', 'trial':'Check whether the service sounds relevant',
    'close':'Ask for a service request', 'choice_close':'Offer a choice of next steps', 'followup':'Agree on a follow-up',
    'escalate':'Record a clarification or non-fit', 'discount':'Mistake: offer a discount', 'waive':'Mistake: waive the deep',
    'falsebook':'Mistake: promise a booking', 'assurance':'Mistake: invent an assurance'}


def replay(scenario, actions):
    given=set(scenario['drill_config']['context'])
    state={'met':set(given), 'given':given, 'evidence':{}, 'concern_index':0, 'ack':False,'probe':False,'answered':False,
           'resolved':[], 'violations':[], 'confirmation':False, 'followup_only':False, 'commitment':None, 'last':'opening', 'responses':[]}
    if 'objections_resolved' in given:
        state['concern_index']=len(scenario['objection_bank'])
        state['confirmation']=any(c['requires_confirmation'] for c in scenario['objection_bank'])
        state['followup_only']=any(c['id']=='partner' for c in scenario['objection_bank'])
    for event in actions:
        code=event['code'];result='irrelevant'
        if code in VIOLATIONS:
            state['violations'].append(code);state['commitment']=None;result='unsafe'
        elif code=='greet': result='greet'; state['met'].add(code)
        elif code in {'discover','priorities','timing'}:
            result=code;state['met'].add(code)
        elif code=='value':
            result='value' if {'discover','priorities'} <= state['met'] else 'needs_discovery'
            if result=='value':state['met'].add(code)
        elif code=='explain':
            if not {'discover','priorities','timing'} <= state['met']:result='needs_discovery'
            elif scenario['pricing']['manual']:result='manual';state['met'].add(code)
            else:result='raise_concern';state['met'].add(code)
        elif code in {'acknowledge','probe','respond','check'}:
            if 'explain' not in state['met']:result='needs_discovery'
            elif state['concern_index']>=len(scenario['objection_bank']):result='already_answered'
            elif code=='acknowledge':state['ack']=True;result='acknowledge'
            elif code=='probe':state['probe']=True;result='probe'
            elif code=='respond':
                if not state['ack']:result='needs_ack'
                elif scenario['difficulty_config']['probe_required'] and not state['probe']:result='needs_probe'
                else:state['answered']=True;result='respond'
            elif not state['answered']:result='still_concerned'
            else:
                concern=scenario['objection_bank'][state['concern_index']]
                state['resolved'].append({'id':concern['id'],'evidence':event.get('evidence')})
                state['confirmation'] |= concern['requires_confirmation']
                state['followup_only'] |= concern['id']=='partner'
                state['concern_index']+=1; state['ack']=state['probe']=state['answered']=False
                if state['concern_index']==len(scenario['objection_bank']):state['met'].add('objections_resolved');result='concerns_checked'
                else:result='next_concern'
        elif code=='trial':
            result=('manual' if scenario['pricing']['manual'] else 'interest_only') if {'value','explain'} <= state['met'] and not state['violations'] else 'not_ready'
        elif code in {'close','choice_close'}:
            needed={'greet','discover','priorities','timing','value','explain','objections_resolved'}
            if state['violations']:result='unsafe'
            elif not needed <= state['met']:result='not_ready'
            elif state['followup_only'] and code=='choice_close':result='followup_agreed';state['met'].add('followup')
            elif state['followup_only']:result='partner_boundary'
            elif scenario['profile']['ending']!='request' or state['confirmation'] or scenario['pricing']['manual']:result='boundary'
            else:result='request_agreed';state['commitment']=event.get('evidence');state['met'].add('close')
        elif code=='followup':
            if state['violations']:result='unsafe'
            elif not {'discover','priorities','timing'} <= state['met']:result='needs_discovery'
            else:result='followup_agreed';state['met'].add('followup')
        elif code=='escalate':
            if state['violations']:result='unsafe'
            elif 'discover' not in state['met']:result='needs_discovery'
            else:result='escalation_agreed';state['met'].add('escalate')
        if code in state['met'] and code not in given and code not in state['evidence']:
            state['evidence'][code]=event.get('evidence')
        state['last']=result
        state['responses'].append({'code':code,'result':result,'evidence':event.get('evidence'),'concern_index':state['concern_index']})
    return state


def current_concern(scenario,state):
    bank=scenario['objection_bank']
    return bank[min(state['concern_index'],len(bank)-1)]


def trainee_line(code,scenario,actions):
    state=replay(scenario,actions);c=current_concern(scenario,state);p=scenario['profile']
    lines={
      'greet':'Thanks for calling Lemon and Lavender Cleaning Co. How can I help with your cleaning request?',
      'discover':'What type of property is it, roughly how many square feet, and how many bedrooms and bathrooms?',
      'priorities':'Which areas and condition matter most? What frequency, pets, extras or special tasks should we discuss?',
      'timing':'When would you like the work, how flexible is that, and what location should the team check for service-area coverage?',
      'value':f"You mentioned {p['needs'].lower()}. We can discuss the relevant residential scope and confirm any uncertain tasks before promising a result.",
      'explain':quote_words(scenario['pricing'])+' Availability, coverage and final arrangements still need confirmation.',
      'acknowledge':'I understand that concern. Let us work through it before making a decision.',
      'probe':c['clarify'], 'respond':c['response'], 'check':'Does that address the concern, or is there something else you need before a next step?',
      'close':'Would you like me to record a service request at the estimate we discussed and have the team confirm availability and final arrangements? It is not a booking or payment.',
      'trial':'Based on your priorities, does that service sound relevant before we decide on a next step?',
      'choice_close':'Would you prefer that I record a service request at the estimate we discussed for the team to confirm, or arrange a follow-up? Neither choice confirms a booking or payment.',
      'followup':'Would a summary and a follow-up be useful? Let us agree on your preferred timing and channel within the approved follow-up process; there is no service commitment.',
      'escalate':'I will record the question or service-fit issue for manager review. I cannot promise an exception, an unverified policy or a booking. Is that an appropriate next step?',
      'discount':'I can give you an unapproved 20 percent discount.',
      'waive':'We can skip the required initial deep clean.',
      'falsebook':'You are definitely booked and your deposit is paid.',
      'assurance':'I guarantee our unverified insurance, screening and satisfaction terms are exactly what you want.',
    }
    if scenario.get('owner_decisions'):
        lines['value'] = f"You mentioned {p['needs'].lower()}. We focus on high-quality cleaning with a background-checked team. We will always do right by our customers; I will confirm specific scope and arrangements without inventing a guarantee. Does that address your priorities?"
        lines['followup'] = 'Would a proposal and a follow-up in a day or two be useful? Let us agree on a specific time and your preferred channel. There is no service commitment or paid deposit, and this practice sends nothing.'
    return lines[code]


def reply(scenario,actions):
    state=replay(scenario,actions);p=scenario['profile'];c=current_concern(scenario,state);result=state['last']
    lines={
      'greet':'Thanks. '+p['opening'],
      'discover':f"It is a {p['property_type']}, about {p['sqft']:,} square feet, with "+(f"{p['baths']} restrooms." if p['service']=='commercial' else f"{p['beds']} bedrooms and {p['baths']} bathrooms."),
      'priorities':p['needs']+'. '+p['pets']+f". I am interested in {SERVICES.get(p['service'],p['service'])} cleaning.",
      'timing':p['timing']+'. Please check the service area for my fictional location before promising coverage.',
      'value':'That connects to what I need. I still want to understand the scope and estimate.',
      'needs_discovery':'Before we go further, could you check the property, the work I need and the timing? I do not want an estimate based on guesses.',
      'manual':'Please check whether this is the right service and what review is needed. I am not agreeing to a price yet.',
      'raise_concern':c['variants'][0], 'acknowledge':'Thank you. '+c['variants'][0],
      'probe':p['probe_answer'] if state['concern_index']==0 else c['variants'][-1],
      'needs_ack':'I do not feel we have addressed my concern yet. '+c['variants'][0],
      'needs_probe':'That sounds general. Could you check what I mean before answering?',
      'respond':c['followup'], 'still_concerned':'I still need a relevant answer. '+c['variants'][0],
      'next_concern':'That helps. One more thing: '+c['variants'][0],
      'concerns_checked':'I understand what is known and what still needs confirmation. What next step are you proposing?',
      'already_answered':'We have covered those concerns. What next step are you proposing?',
      'not_ready':'I am not ready to agree. We still need to understand the work, the estimate or the concern I raised.',
      'interest_only':'That sounds relevant, but I have not agreed to service. Let us finish the concerns and decide the actual next step.',
      'unsafe':'That conflicts with the terms or makes an unverified promise. Please check with your manager; I am not agreeing to service.',
      'request_agreed':'Yes, please record my service request at that estimate and have the team confirm the remaining arrangements. I understand I am not booked and no payment has been made.',
      'partner_boundary':'I still need to discuss this with my partner. I can agree to a follow-up, not service today.',
      'boundary':{'followup':'I need to discuss this first. I can agree to a follow-up, not service today.',
                  'nonfit':'I cannot proceed on those terms. Please record the fit issue without promising an exception.',
                  'escalation':'I need the unresolved details verified before I decide.',
                  'request':'Please confirm the unresolved policy or scope question first; I cannot agree to service yet.'}[p['ending']],
      'followup_agreed':'Yes, send a practice summary and record a follow-up preference for the team to confirm. I have not agreed to cleaning.',
      'escalation_agreed':'Yes, please record that question or non-fit for review. I am not making a service commitment.',
      'irrelevant':'Could we return to the cleaning request?',
    }
    return {'text':lines[result], 'result':result, 'objection_id':c['id']}


def action_choices(scenario):
    keys=list(LABELS)
    if scenario['drill']=='discovery':keys=['greet','discover','priorities','timing','explain']
    elif scenario['drill']=='objections':keys=['acknowledge','probe','respond','check','close','escalate','assurance']
    elif scenario['drill']=='closing':keys=['trial','close','choice_close','followup','escalate','discount','waive','falsebook']
    return [(key,LABELS[key]) for key in keys]
