"""Conservative local writing checks, not semantic AI grading or competence approval.

Known factual contradictions can block a response. Required concepts provide
revision guidance. Plausible open-ended prose is ALWAYS pending human review.
No amount of matching words confers a correct writing grade or readiness.
"""
import hashlib
import re
import unicodedata

VERSION = 'sales-writing-local-v2'
from .policies import POLICY
POLICY_VERSION = POLICY['version']
SUPPORTED_POLICIES = {'ll-fictional-2026-10-06-v5', POLICY_VERSION}


def normalized(text):
    return unicodedata.normalize('NFKC', text).lower().replace('’', "'").replace('—', ' ').replace('&', ' and ')


def has(text, pattern):
    return bool(re.search(pattern, text, re.I))


def affirmative(text, pattern):
    """Never count an immediately negated concept as affirmative evidence."""
    for match in re.finditer(pattern, text, re.I):
        before = text[max(0, match.start()-65):match.start()]
        matched = match.group()
        if has(before, r"\b(?:not|never|without|isn't|aren't|don't|doesn't|won't|cannot|can't)\s+(?:(?:a|an|the|ever|really|actually|offer|offering|provide|providing|ask|asking|record|recording|say|saying)\s+){0,2}$"):
            continue
        if has(matched, r"\b(?:not|never|without|isn't|aren't|don't|doesn't|won't|cannot|can't)\b"):
            continue
        return True
    return False


BRAND = r'\b(?:lemon\s+(?:and\s+)?lavender|l\s*and\s*l)\b'
HOME = r'\b(?:clean(?:ing)?\s+(?:for\s+)?(?:your\s+|our\s+)?(?:homes?|houses?|residen\w+)|(?:home|house|residential)\s+clean(?:ing)?|clean\s+people.s\s+homes)\b'
SERVICE = r'\b(?:deep\s+clean(?:ing)?|move(?:\s+in|\s+out)?\s+clean(?:ing)?|regular\s+(?:home\s+)?clean(?:ing)?|recurring\s+(?:home\s+)?clean(?:ing)?|weekly|biweekly|monthly|every\s+(?:two|2|other)\s+weeks?)\b'
QUESTION = r'\b(?:what|which|how|why|are\s+you|is\s+it|do\s+you|could\s+you|can\s+you|would\s+you)\b[^.!?\n]{3,100}(?:\?|tell\s+me|share)|\b(?:tell|let)\s+(?:me|us)\s+(?:about|know)\b'
LEAD = r'\b(?:cleaning\s+(?:request|inquiry|enquiry)|request(?:ed)?\s+(?:for\s+)?(?:a\s+)?clean(?:ing)?|asked\s+(?:us\s+)?about\s+(?:home\s+)?cleaning)\b'
REPLY = r'\b(?:please\s+(?:call|reply|respond|reach\s+out)|(?:can|could|would)\s+you\s+(?:call|reply|respond)|let\s+(?:me|us)\s+know|is\s+(?:now|there)\b[^.!?]{0,50}(?:time|talk))\b'

# These are review prompts, not an approved numerical rubric.
REQUIREMENTS = {
 ('welcome', 2): [
  ('company', 'Name Lemon and Lavender so the caller knows whom they reached.', BRAND),
  ('homes', 'Explain that the company cleans homes.', HOME),
  ('service', 'Briefly mention a relevant approved cleaning option.', SERVICE),
  ('discovery', 'Invite the caller to describe the help they need.', QUESTION)],
 ('conversation', 2): [
  ('size', 'Record Taylor’s 2,000 sq ft home size.', r'\b2[ ,]?000\s*(?:sq(?:uare)?\.?\s*(?:ft|feet)|square[- ]foot)\b'),
  ('kitchen', 'Record the kitchen buildup or kitchen priority.', r'\bkitchen\b'),
  ('bathrooms', 'Record the bathroom priority.', r'\bbathrooms?\b'),
  ('deep', 'Identify the required initial deep cleaning.', r'\b(?:required|mandatory)\s+(?:initial\s+)?(?:deluxe\s+)?deep|\b(?:initial\s+)?(?:deluxe\s+)?deep\s+(?:clean(?:ing)?\s+)?(?:is\s+)?(?:required|mandatory)'),
  ('initial_price', 'State $570 as the initial/deep price.', r'\b(?:initial|first|deep)\b[^.!?;\n$]{0,45}\$?570\b|\$570\s+(?:for\s+)?(?:the\s+)?(?:required\s+)?(?:initial|first|deep)\b'),
  ('recurring_price', 'State $220 for the biweekly visits.', r'\$?220\b[^.!?;\n]{0,45}\b(?:biweekly|every\s+(?:two|2|other)\s+weeks?)\b|\b(?:biweekly|every\s+(?:two|2|other)\s+weeks?)\b[^.!?;\n$]{0,35}\$?220\b'),
  ('response', 'Record what Taylor actually agreed to: a service request, not a booking.', r'\btaylor\s+(?:said|agreed|asked|wants|accepted)\b[^.!?;\n]{0,110}\brequest\b|\bcustomer\s+(?:said|agreed|asked|wants|accepted)\b[^.!?;\n]{0,110}\brequest\b'),
  ('timing', 'Record requested timing or explicitly say it still needs clarification.', r'\b(?:requests?|requested|hopes?|prefers?|wants?)\b[^.!?;\n]{0,50}\b(?:week|day|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday)|\b(?:timing|date)\s+(?:still\s+)?(?:needs?|requires?)\s+(?:clarification|confirmation)'),
  ('availability', 'Keep availability unconfirmed and name the team’s next action.', r'\b(?:team|manager)\b[^.!?;\n]{0,65}\b(?:check|confirm|clarify)\b[^.!?;\n]{0,30}\b(?:availability|date|timing)\b'),
  ('payment', 'Record payment questions as unresolved and needing manager confirmation.', r'\b(?:payment|deposit)\b[^.!?;\n]{0,70}\b(?:unknown|unconfirmed|unresolved|clarif\w+|confirm\w+|manager)\b|\bmanager\b[^.!?;\n]{0,55}\b(?:payment|deposit)\b')],
 ('objections', 0): [
  ('acknowledge', 'Acknowledge the price or partner concern without arguing.', r"\b(?:i\s+understand|that(?:'s|\s+is)\s+(?:fair|understandable)|of\s+course|makes\s+sense|take\s+your\s+time|thanks?\s+for\s+(?:sharing|letting\s+me\s+know)|i\s+hear\s+you)\b"),
  ('clarify', 'Ask one question to clarify price, scope, or the decision still needed.', QUESTION)],
 ('followup', 1): [
  ('company', 'Name Lemon and Lavender in the message.', BRAND),
  ('request', 'Refer to the customer’s cleaning request.', LEAD),
  ('reply', 'Invite the customer to respond without pressure.', REPLY),
  ('record', 'Say what you will record after no answer: attempt/channel, outcome, and next approved step.', r'\b(?:record|log|note|document)\b[^.!?;\n]{0,160}\b(?:no\s+(?:answer|response)|unanswered|attempt|voicemail|outcome)\b'),
  ('next', 'Record the next approved follow-up, respecting preferences and stop rules.', r'\bnext\s+(?:approved\s+|permitted\s+)?(?:follow[- ]?up|step|contact|attempt)|\bapproved\s+(?:sequence|schedule|cadence)\b')],
}


def policy_issues(text):
    issues=[]
    # Sentence/contrast boundaries prevent a safe statement from excusing a
    # contradictory promise in the next clause. Reported customer questions
    # and explicit "do not say ..." examples are not trainee commitments.
    clauses=re.split(r'(?<=[.!?;])\s+|\n|\b(?:but|however|instead|then)\b|,?\s+and\s+(?=(?:we|i)\s+(?:can|will|may|could)\b)', text)
    for clause in clauses:
        if has(clause, r"\b(?:do\s+not|don't|never)\s+(?:say|promise|claim)\b") or has(clause,r'\b(?:customer|taylor)\s+(?:asks?|asked|requested|says?|said)\b'):
            continue
        findings=[
         (r"\b(?:we|i|you)\s+(?:can|will|may|could)\s+(?:just\s+)?(?:waive|skip|drop|omit)\b[^.!?;]{0,35}\bdeep\b|\b(?:initial\s+)?deep(?:\s+clean(?:ing)?)?\s+(?:is\s+)?(?:optional|not\s+required)|\b(?:no|without)\s+(?:initial\s+)?deep\s+(?:clean(?:ing)?\s+)?(?:is\s+)?(?:needed|required)|\b(?:do\s+not|don't)\s+(?:need|require)\s+(?:an?\s+)?(?:initial\s+)?deep", 'The initial deep is mandatory for recurring service; do not waive it or describe it as optional.'),
         (r"\b(?:we|i)\s+(?:can\s+|will\s+)?(?:give|offer|apply)\b[^.!?;]{0,35}\b(?:discount|\d+\s*%\s*off)|\b(?:we|i)\s+(?:can|will)\s+(?:take|knock)\b[^.!?;]{0,25}\boff\b", 'Discount authority is unapproved. Ask a manager rather than offering a discount.'),
         (r'\b(?:you\s+are|you.re|we\s+are|we.re|it\s+is|it.s|appointment\s+is|booking\s+is|status\s*:)\s+(?:now\s+)?(?:booked|confirmed)\b|\b(?:deposit|payment)\s+(?:is|was|has\s+been)\s+paid\b|\b(?:we|i)\s+(?:have\s+)?(?:booked|confirmed)\s+(?:you|your\s+(?:visit|appointment|booking))', 'A service request is not a confirmed booking or payment. Record the actual commitment and confirmation still needed.'),
         (r'\b(?:we|i)\s+(?:offer|provide|do)\s+(?:\w+\s+){0,3}(?:commercial|quarterly)\b', 'L&L currently offers residential cleaning and weekly, biweekly or monthly recurring service, not commercial or quarterly plans.'),
         (r'\b(?:we|i)\s+(?:can\s+|will\s+)?guarantee\b', 'Do not invent a service guarantee. Keep the promise within approved policy.'),
         (r'\b(?:we\s+require|you\s+must\s+pay|payment\s+is\s+due|no\s+deposit\s+is\s+required)\b|\b(?:pay|payment|deposit)\b[^.!?;]{0,30}\b(?:before|after)\s+(?:the\s+)?(?:visit|clean|service)', 'Payment and deposit terms need manager confirmation; do not invent an amount, exemption or due date.'),
        ]
        for pattern,message in findings:
            for match in re.finditer(pattern,clause):
                before=clause[max(0,match.start()-20):match.start()]
                if has(before,r'\b(?:not|no)\s*$'): continue
                issues.append(message)
        # Explicit labeled prices only; unknown wording goes to the manager.
        for label,expected in [(r'(?:initial|first|deep)',570),(r'biweekly',220)]:
            for match in re.finditer(r'\b'+label+r'(?:\s+(?:deluxe|deep|clean|cleaning|visit|visits|price|quote)){0,3}\s*(?:is|are|costs|at|:)\s*\$(\d+)\b',clause):
                if int(match.group(1))!=expected and not has(match.group(),r'\b(?:not|question|ask|confirm)\b'):
                    issues.append(f'The fictional 2,000 sq ft example uses ${expected} for the '+('initial deep.' if expected==570 else 'biweekly visits.'))
        if has(clause,r'\b(?:initial|first|deep)\b[^.!?;]{0,30}\bnot\s+\$?570\b|\bbiweekly\b[^.!?;]{0,30}\bnot\s+\$?220\b'):
            issues.append('The approved example is $570 for the required initial deep, then $220 biweekly; do not negate those amounts.')
    return list(dict.fromkeys(issues))


def evaluate_writing(key,index,page,text,*,policy_version=POLICY_VERSION,supported=True):
    raw=text if isinstance(text,str) else ''
    text=normalized(raw)
    report={'version':VERSION,'policy_version':policy_version,'status':'unassessed','label':'Pending manager review',
            'issues':[],'missing':[],'detected':[],'can_continue':True,'writing_correct':None,
            'note':'Local checks cannot judge the meaning or quality of this open-ended response. Your trainer must review it.'}
    if not supported or (key,index) not in REQUIREMENTS or policy_version not in SUPPORTED_POLICIES:
        report['note']='This saved question is outside the supported local checks. Its writing has not been assessed; a manager must review it.'
        return report
    report['issues']=policy_issues(text)
    if not text.strip(): report['issues'].append('Write your response before checking it.')
    elif len(raw)>1000: report['issues'].append('Keep the response within 1,000 characters; it has not been saved.')
    elif any(text.strip(' .').startswith(normalized(page.get(field,'')).strip(' .')) for field in ('reflection','question') if page.get(field)):
        report['issues'].append('This repeats the question. Write what you would say or record in the scenario.')
    elif has(text,r'\b(?:ignore\s+(?:all\s+|the\s+)?(?:previous|prior|system|instructions|rules)|mark\s+(?:this|me|it|my\s+answer)\s+(?:as\s+)?(?:correct|passed)|give\s+me\s+(?:a\s+pass|full\s+credit)|system\s*:)'):
        report['issues'].append('Instructions to the checker are not an answer. Respond to the fictional customer task.')
    else:
        # A list of rubric words is not a sales reply. Notes may be concise,
        # but still need a specific action or relationship, not bare labels.
        relational=has(text,r"\b(?:is|are|was|were|has|have|we|i|you|your|please|thanks|thank|can|could|would|will|wants|needs|requested|agreed|said|record|log|note|document|requires|required|to|for)\b")
        if not relational or len(set(re.findall(r'[a-z]+',text)))<4:
            report['issues'].append('Use a meaningful reply or specific handoff notes, not a list of keywords or repeated text.')
    for ident,guidance,pattern in REQUIREMENTS[(key,index)]:
        present=affirmative(text,pattern)
        if ident in {'discovery','clarify'}:
            topics=(r'\b(?:help|need|clean|cleaning|home|areas?|priorit\w+)\b' if ident=='discovery'
                    else r'\b(?:cost|price|scope|included|concern|budget|compar\w+|first|visits?|partner|unclear|estimate)\b')
            questions=re.findall(r'[^.!?\n]*\?',text)
            directives=[sentence for sentence in re.split(r'[.!?\n]',text) if has(sentence,r'\b(?:tell|let)\s+(?:me|us)\s+(?:about|know)\b')]
            present=any(affirmative(sentence,pattern) and has(sentence,topics) for sentence in questions+directives)
        if present: report['detected'].append(ident)
        else: report['missing'].append(guidance)
    if report['issues']:
        report.update(status='incorrect',label='Revise this response',can_continue=False)
        if text.strip() and not report['detected'] and all(issue.startswith('Use a meaningful') for issue in report['issues']):
            report['label']='Response does not address this task'
            report['issues']=['Connect your response to this customer scenario. Use the task-specific guidance below.']
    elif not report['detected']:
        report.update(status='incorrect',label='Response does not address this task',can_continue=False)
        report['issues'].append('Connect your response to this customer scenario. Use the task-specific guidance below.')
    elif report['missing']:
        report.update(status='partial',label='More detail needed',can_continue=False)
        report['note']='Some expected details could not be verified locally. Revise them in context; a trainer can review wording the local checks do not recognize.'
    return report


def assess_saved(key,index,content,answer):
    from .curriculum import LESSON_BY_KEY
    page=content['pages'][index]
    if not page.get('reflection'): return None
    current=LESSON_BY_KEY.get(key)
    reference=current['pages'][index] if current and index<len(current['pages']) else None
    supported=bool(reference and page.get('reflection')==reference.get('reflection') and page.get('title')==reference.get('title'))
    result=evaluate_writing(key,index,page,answer.get('reflection',''),policy_version=content.get('policy_version',''),supported=supported)
    result['legacy_unassessed']=bool(answer and not answer.get('writing_evaluation'))
    if answer.get('writing_evaluation',{}).get('review_requested') and not result['issues']:
        result.update(status='unassessed',label='Pending manager review',can_continue=True,review_requested=True,
            note='You requested trainer review. The local checks did not verify every detail; continuing does not approve your writing.')
    return result
