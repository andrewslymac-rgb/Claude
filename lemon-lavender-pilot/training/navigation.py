"""Learner navigation only: no progress writes, provider activation or new gates."""
from urllib.parse import urlsplit, parse_qs, urlencode
from django.urls import resolve, Resolver404, reverse
from .usage import attempts_today, limits

SAFE_DESTINATIONS = {
    'course', 'learning_stage', 'guided_lesson', 'guided_lesson_done', 'orientation',
    'practice_library', 'scenario_library', 'services', 'coaching', 'sales_report',
    'attempt', 'followup_attempt', 'followup_setup', 'live_detail', 'live_prepare',
    'microphone_test', 'voice_quality_test',
}


def login_destination(value):
    """Allow only known read-only local pages; each view still checks ownership."""
    if not isinstance(value, str) or len(value) > 1000 or any(ord(c) < 32 for c in value):
        return ''
    if not value.startswith('/') or value.startswith('//') or '\\' in value or '%' in value:
        return ''
    parts = urlsplit(value)
    if parts.scheme or parts.netloc or parts.fragment:
        return ''
    try:
        match = resolve(parts.path)
    except Resolver404:
        return ''
    if match.url_name not in SAFE_DESTINATIONS:
        return ''
    if parts.query:
        if match.url_name != 'scenario_library':
            return ''
        values = parse_qs(parts.query, keep_blank_values=True)
        if set(values) != {'persona_id','difficulty','drill'} or any(len(v)!=1 for v in values.values()):
            return ''
        from .sales_forms import ScenarioForm
        form = ScenarioForm({key:items[0] for key,items in values.items()})
        if not form.is_valid(): return ''
        return parts.path+'?'+urlencode(form.cleaned_data)
    return parts.path


def attempt_url(attempt):
    return reverse('live_detail' if hasattr(attempt, 'live_call') else 'attempt', args=[attempt.pk])


def practice_next(assignment):
    """Choose one useful action from actual saved practice state."""
    from .views import is_expired
    active = assignment.attempts.filter(status='active').first()
    if active and not is_expired(active):
        return {'state':'active', 'title':'Continue your practice', 'detail':'Your conversation and saved notes are here. The original session time limit still applies.',
                'label':'Resume practice', 'url':attempt_url(active), 'attempt':active}
    pending = assignment.attempts.filter(status='submitted').order_by('-started_at').first()
    if pending:
        return {'state':'submitted', 'title':'Your practice is with your trainer', 'detail':'Review what you saved. Your trainer’s feedback comes before the next call attempt.',
                'label':'Review submitted practice', 'url':attempt_url(pending)+'#practice-next', 'attempt':pending}
    latest = assignment.attempts.order_by('-started_at').first()
    if latest and hasattr(latest, 'review'):
        return {'state':'reviewed', 'title':'Your trainer has feedback', 'detail':latest.review.coaching,
                'label':'Read feedback & try again' if latest.review.decision=='retry' else 'Read your trainer’s review', 'url':attempt_url(latest)+'#manager-feedback', 'attempt':latest}
    for key, field in [('welcome', 'welcome_completed_at'), ('conversation', 'lesson_completed_at')]:
        if not getattr(assignment, field):
            return {'state':'lesson', 'title':'Prepare for your first practice',
                    'detail':'The welcome and conversation lessons prepare you for this call. You can explore the other practice options below.',
                    'label':'Continue the '+('welcome' if key=='welcome' else 'conversation')+' lesson',
                    'url':reverse('guided_lesson', args=[assignment.pk,key,1])}
    if attempts_today(assignment.learner) >= limits()['daily_attempts']:
        return {'state':'limit', 'title':'Today’s practice limit is reached', 'detail':'Your work is saved. Review your feedback now and return for a new attempt tomorrow.',
                'label':'Review saved practice', 'url':reverse('practice_library', args=[assignment.pk])+'#history'}
    return {'state':'start', 'title':'A first call with Taylor' if not latest else 'Try a fresh practice call',
            'detail':'Taylor wants cleaning every two weeks. Discover the needs, explain the first visit, ask for a next step and save the handoff.',
            'label':'Start practice with Taylor', 'url':reverse('start', args=[assignment.pk]), 'post':True}


def review_navigation(attempt):
    """Small, consistent return/feedback/retry panel on saved local attempts."""
    assignment = attempt.assignment
    from .views import is_expired
    pending = assignment.attempts.filter(status='submitted').exists()
    within_limit = attempts_today(assignment.learner) < limits()['daily_attempts']
    from .microphone_acceptance import TECHNICAL_COURSE_SLUGS
    nav_assignment = assignment
    if assignment.course.slug in TECHNICAL_COURSE_SLUGS:
        from .models import Assignment
        nav_assignment = Assignment.objects.filter(learner=assignment.learner).exclude(course__slug__in=TECHNICAL_COURSE_SLUGS).first() or assignment
    ended = attempt.status in {'reviewed','expired','abandoned'} or (attempt.status=='active' and is_expired(attempt))
    return {'practice_navigation': {
        'can_retry': ended and not pending and within_limit and not hasattr(attempt, 'live_call'),
        'pending': pending, 'ended': ended, 'daily_limit': not within_limit,
        'scenario': attempt.scenario if attempt.scenario.get('persona_id') else None,
        'feedback_anchor':'coaching-feedback' if hasattr(attempt, 'live_call') else 'feedback',
        'home_url':reverse('course',args=[nav_assignment.pk]),
        'stage_url':reverse('learning_stage',args=[nav_assignment.pk,'role-playing']),
    }}


def practice_blocked(request, assignment, explanation, status):
    from django.shortcuts import render
    return render(request,'training/practice_blocked.html',{'assignment':assignment,
        'explanation':explanation,'next_step':practice_next(assignment)},status=status)
