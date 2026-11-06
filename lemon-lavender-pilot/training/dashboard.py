"""Four-section navigation over existing, immutable lesson records."""
from copy import deepcopy
from django.contrib import messages
from django.db import transaction
from django.http import HttpResponseBadRequest, Http404
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from .learning import journey
from .models import Assignment, LessonProgress
from .views import own_assignment, permitted
from .navigation import practice_next

GUIDE_KEY = 'portland_orientation'
GUIDE = {
    'key': GUIDE_KEY, 'version': 'portland-orientation-2026-10-08-v2',
    'title': 'Residential cleaning and Portland-area customers', 'minutes': 4,
    'summary': 'Understand the request, recognize local place names and ask about the individual home.',
    'sections': [
        {'title': 'Start with the reason for the call', 'paragraphs': [
            'A homeowner may want ongoing help, a one-time reset or cleaning around a move. Ask what prompted the request, which areas need attention, the approximate square footage and the desired timing. Use the answers to recommend an L&L service.',
            'L&L offers Deluxe Deep, recurring weekly / every two weeks / monthly, and Move In / Out. Every recurring plan starts with a required deep clean. Explain the initial visit and later visits separately; use the current Services & pricing reference for inclusions and practice estimates.',
            'An appropriate next step fits the customer’s needs and company policy. A won lead requires a paid deposit; a service request or proposal is not a win or confirmed booking. This pilot records only explicit simulated deposits. Availability, service-area eligibility and unverified promises need confirmation.'
        ]},
        {'title': 'Recognize names; confirm the location', 'paragraphs': [
            'Portland has named neighborhoods as well as neighboring cities. The City of Portland lists Ardenwald-Johnson Creek as spanning Portland and Milwaukie. A neighborhood name alone may not identify the city.',
            'Multnomah County lists Gresham, Fairview and Troutdale among its cities. These names help you follow a conversation; this guide is not an approved L&L coverage list.',
            'Read back the city, state, ZIP code and any directional street prefix when confirming a location. In this pilot, use fictional details only. Confirm service eligibility with the team before making a promise.'
        ], 'sources': [
            {'title': 'City of Portland neighborhood directory', 'url': 'https://www.portland.gov/neighborhoods'},
            {'title': 'Multnomah County: cities in the county', 'url': 'https://multco.us/info/about-multnomah-county'}
        ]},
        {'title': 'Ask about this customer’s priorities', 'paragraphs': [
            'Ask: “What would make this cleaning most helpful for you?” Then clarify rooms, buildup, timing and the result they want. Do not infer budget, home condition or preferences from a neighborhood, age, income or household type.',
            'Use square feet and US dollars clearly. “Every two weeks” is clearer than “twice a month.” Confirm the date and Pacific time for follow-up; Portland and Manila do not keep one fixed year-round time difference.',
            'Fictional example: “I’m moving from a home near Milwaukie.” A useful reply is: “Is this a move-out clean? What is the approximate square footage, which areas need attention, and when do you need it? I’ll also have the team confirm whether we serve the location and have availability.”'
        ]}
    ]
}

SECTIONS = (
    {'slug': 'meet', 'title': 'Start Here: Meet Lemon and Lavender',
     'purpose': 'Learn who we are and how to represent L&L with care and accurate promises.',
     'short_title': 'Meet L&L', 'keys': ('welcome',)},
    {'slug': 'industry', 'title': 'Learn the Industry and Our Portland-Area Customers',
     'purpose': 'Understand residential cleaning needs, discover the right service and explain the quote.',
     'short_title': 'Services & customers', 'keys': ('services', 'pricing')},
    {'slug': 'objections', 'title': 'Handle Sales Objections',
     'purpose': 'Clarify the concern, explain relevant value and move toward a qualified next step.',
     'short_title': 'Sales objections', 'keys': ('objections',)},
    {'slug': 'role-playing', 'title': 'Practice with Role-Playing',
     'purpose': 'Put discovery, closing and follow-up together. Practice, review feedback and try again.',
     'short_title': 'Role-playing', 'keys': ('conversation', 'followup')},
)


def section_for(key):
    return next(({**section, 'number': number} for number, section in enumerate(SECTIONS, 1)
                 if key in section['keys'] or (key == GUIDE_KEY and section['slug'] == 'industry')), None)


def dashboard_context(assignment):
    context = journey(assignment)
    rows = {row['key']: row for row in context['journey_rows']}
    guide = assignment.guided_lessons.filter(lesson_key=GUIDE_KEY).first()
    guide_content = guide.content if guide else GUIDE
    guide_row = {'key': GUIDE_KEY, 'title': guide_content['title'], 'summary': guide_content['summary'],
                 'minutes': guide_content['minutes'], 'url': reverse('orientation', args=[assignment.pk]),
                 'complete': bool(guide and guide.completed_at), 'progress': guide, 'is_guide': True}
    sections, recommendation = [], None
    for number, definition in enumerate(SECTIONS, 1):
        lessons = [rows[key] for key in definition['keys']]
        items = ([guide_row] if definition['slug'] == 'industry' else []) + lessons
        remaining = next((item for item in items if not item['complete']), None)
        section = {**definition, 'number': number, 'lessons': lessons, 'items': items,
                   'completed': sum(item['complete'] for item in lessons), 'total': len(lessons),
                   'remaining': remaining, 'landing_url': reverse('learning_stage',args=[assignment.pk,definition['slug']]),
                   'complete': remaining is None, 'guide_reviewed': guide_row['complete'],
                   'url': remaining['url'] if remaining else reverse('guided_lesson',args=[assignment.pk,lessons[0]['key'],1])}
        section['action'] = ('Continue' if any(item['progress'] or item['complete'] for item in items)
                             else 'Start') if remaining else 'Review'
        if remaining and recommendation is None:
            recommendation = {**remaining, 'section': section,
                              'action': 'Continue' if remaining['progress'] else 'Start learning'}
        sections.append(section)
    # A later-section draft remains one click away without displacing the learning order.
    drafts = [row for row in rows.values() if not row['complete'] and row['progress'] and row['progress'].answers]
    resume = max(drafts, key=lambda row: row['progress'].updated_at) if drafts else None
    if resume and recommendation and resume['url'] == recommendation['url']:
        resume = None
    primary = {**resume, 'section':section_for(resume['key']), 'action':'Continue where you left off'} if resume else recommendation
    if primary:
        primary = {**primary, 'label':primary['action'], 'detail':primary['summary'], 'state':'learning'}
    else:
        practice = practice_next(assignment)
        primary = {**practice, 'section':{**SECTIONS[3], 'number':4}}
        if primary.get('post'):
            primary.update(url=reverse('practice_library',args=[assignment.pk]), post=False, label='Start role-playing')
    active_practice = practice_next(assignment)
    if active_practice['state'] == 'active':
        primary = {**active_practice, 'section':{**SECTIONS[3], 'number':4}}
    calls = assignment.attempts.all()
    return {**context, 'learning_sections': sections, 'recommendation': recommendation,
            'resume_draft': resume, 'primary_step': primary, 'orientation_reviewed': guide_row['complete'],
            'practice_saved': calls.count(), 'practice_submitted': calls.filter(status='submitted').count(),
            'practice_reviewed': calls.filter(review__isnull=False).count(),
            'practice_active': calls.filter(status='active').count(),
            'followup_saved': assignment.followup_attempts.count()}


@permitted('learner', 'trainer', 'admin')
@require_http_methods(['GET', 'POST'])
def orientation(request, pk):
    assignment = own_assignment(request, pk, edit=request.method == 'POST')
    saved = assignment.guided_lessons.filter(lesson_key=GUIDE_KEY).first()
    content = saved.content if saved else GUIDE
    if request.method == 'POST':
        if request.POST.get('action') != 'reviewed':
            return HttpResponseBadRequest('Unknown guide action.')
        if request.POST.get('content_version') != content['version']:
            return HttpResponseBadRequest('Refresh the guide before marking it reviewed.')
        with transaction.atomic():
            locked = Assignment.objects.select_for_update().get(pk=assignment.pk)
            saved, _ = LessonProgress.objects.get_or_create(assignment=locked, lesson_key=GUIDE_KEY,
                defaults={'content': deepcopy(content)})
            if saved.content['version'] != request.POST['content_version']:
                return HttpResponseBadRequest('Refresh the guide before marking it reviewed.')
            if not saved.completed_at:
                saved.completed_at = timezone.now()
                saved.completed_pages = [0]
                saved.revision += 1
                saved.save()
        messages.success(request, 'Orientation reviewed. Next: choose the right service.')
        return redirect('guided_lesson', pk=pk, lesson_key='services', page=1)
    return render(request, 'training/orientation.html', {'assignment': assignment, 'guide': content,
        'reviewed': bool(saved and saved.completed_at), 'learning_section':section_for(GUIDE_KEY)})


@permitted('learner', 'trainer', 'admin')
@require_http_methods(['GET'])
def stage(request, pk, stage_slug):
    assignment = own_assignment(request, pk)
    context = dashboard_context(assignment)
    selected = next((section for section in context['learning_sections'] if section['slug']==stage_slug), None)
    if not selected: raise Http404
    current = selected['remaining']
    if current:
        action = {**current, 'label':'Continue' if current['progress'] else 'Start this stage', 'detail':current['summary']}
    elif stage_slug=='role-playing':
        action = {**practice_next(assignment)}
        if action.get('post'):
            action.update(url=reverse('practice_library',args=[pk]),post=False,label='Start role-playing')
    else:
        following = context['learning_sections'][selected['number']]
        action = {'title':'Continue to stage '+str(following['number']), 'detail':following['title'],
                  'url':following['url'], 'label':'Next stage'}
    return render(request,'training/learning_stage.html', {'assignment':assignment, **context,
        'stage':selected, 'stage_action':action})
