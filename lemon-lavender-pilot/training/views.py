from datetime import timedelta
from functools import wraps
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST, require_http_methods
from .actor import ACTIONS, CLIPS, LEGACY_ACTIONS, LEGACY_CLIPS, respond
from .authentication import DEMO_EMAILS, consume_link, digest, issue_link
from .evaluation import grade_observations, validate_outcome
from .forms import BudgetForm, CRMForm, OperatingCostForm, ReviewForm, SignInForm, WelcomeForm
from .models import Assignment, Attempt, Course, Profile, Review
from .policies import POLICY, quote, snapshots
from .providers import LocalVoice
from .usage import attempts_today, budget, limits, record_usage, summarize


def permitted(*roles):
    def decorate(view):
        @login_required
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            profile = Profile.objects.filter(user=request.user, invited=True).first()
            if not profile or not request.user.is_active or profile.role not in roles:
                raise PermissionDenied
            return view(request, *args, **kwargs)
        return wrapped
    return decorate


def own_assignment(request, pk, edit=False):
    assignment = get_object_or_404(Assignment.objects.select_related('course', 'learner'), pk=pk)
    if edit or request.user.profile.role == 'learner':
        if request.user.pk != assignment.learner_id or request.user.profile.role != 'learner':
            raise PermissionDenied
    return assignment


@require_http_methods(['GET', 'POST'])
def sign_in(request):
    if request.method == 'GET':
        from .navigation import login_destination
        destination = login_destination(request.GET.get('next', ''))
        if destination:
            request.session['post_login_path'] = destination
        else:
            request.session.pop('post_login_path', None)
    form = SignInForm(request.POST or None)
    preview = None
    if request.method == 'POST' and form.is_valid():
        email = form.cleaned_data['email'].lower()
        user = get_user_model().objects.filter(email=email).first() if email in DEMO_EMAILS else None
        if user:
            preview = issue_link(user)
            if preview:
                request.session['issued_digest'] = digest(preview['url'].split('#')[1])
        messages.info(request, 'If this demo email is available, your sign-in link appears below.')
    return render(request, 'training/sign_in.html', {'form': form, 'preview': preview, 'emails': DEMO_EMAILS})


@require_http_methods(['GET', 'POST'])
def magic(request):
    if request.method == 'POST':
        token = request.POST.get('token', '')
        if digest(token) != request.session.get('issued_digest'):
            return render(request, 'training/magic.html', {'error': 'Open the local preview in the browser that requested it.'}, status=400)
        user = consume_link(token)
        if not user:
            return render(request, 'training/magic.html', {'error': 'This link expired, was already used, or the invitation was revoked.'}, status=400)
        destination = request.session.pop('post_login_path', '')
        login(request, user)
        request.session.pop('issued_digest', None)
        from .navigation import login_destination
        if login_destination(destination):
            return redirect(destination)
        return redirect('home')
    # GET and link scanners do not authenticate or consume a token.
    return render(request, 'training/magic.html')


@require_POST
def sign_out(request):
    logout(request)
    return redirect('sign_in')


@permitted('learner', 'trainer', 'admin')
def home(request):
    from .microphone_acceptance import TECHNICAL_COURSE_SLUGS
    assignments = Assignment.objects.exclude(course__slug__in=TECHNICAL_COURSE_SLUGS).select_related('course', 'learner').order_by('pk')
    if request.user.profile.role == 'learner':
        assignments = assignments.filter(learner=request.user)
        if assignments.count() == 1:
            return redirect('course', pk=assignments.first().pk)
        return render(request, 'training/learner_home.html', {'assignments': assignments})
    pending = Attempt.objects.filter(status='submitted').select_related('assignment__learner').order_by('-submitted_at', '-started_at') if request.user.profile.role != 'learner' else []
    return render(request, 'training/home.html', {'assignments': assignments, 'pending': pending,
        'learners': get_user_model().objects.filter(profile__role='learner', profile__invited=True, is_active=True),
        'courses': Course.objects.exclude(slug__in=TECHNICAL_COURSE_SLUGS), 'practice_limits': limits()})


@require_POST
@permitted('admin', 'trainer')
def assign(request):
    learner = get_object_or_404(get_user_model(), pk=request.POST.get('learner'), profile__role='learner', profile__invited=True, is_active=True)
    course = get_object_or_404(Course, pk=request.POST.get('course'))
    Assignment.objects.get_or_create(learner=learner, course=course)
    messages.success(request, 'Course assignment saved. No email was sent.')
    return redirect('home')


@permitted('learner', 'trainer', 'admin')
@require_http_methods(['GET', 'POST'])
def welcome(request, pk):
    assignment = own_assignment(request, pk, edit=request.method == 'POST')
    form = WelcomeForm(request.POST or None, initial={'introduction': assignment.company_introduction})
    if request.method == 'POST' and form.is_valid():
        from .models import WrittenResponse
        from .curriculum import LESSON_BY_KEY
        import hashlib
        previous=assignment.company_introduction
        if previous:
            WrittenResponse.objects.get_or_create(event_key='welcome-prior:'+str(assignment.pk)+':'+hashlib.sha256(previous.encode()).hexdigest(),
                defaults={'assignment':assignment,'lesson_key':'welcome','page_number':3,'source':'legacy_welcome',
                    'answer':{'reflection':previous},'evaluation':{'label':'Unassessed earlier introduction'},'question':{}})
        new=form.cleaned_data['introduction']
        WrittenResponse.objects.get_or_create(event_key='welcome-submitted:'+str(assignment.pk)+':'+hashlib.sha256(new.encode()).hexdigest(),
            defaults={'assignment':assignment,'lesson_key':'welcome','page_number':3,'source':'legacy_welcome',
                'answer':{'reflection':new},'evaluation':form.writing_feedback,
                'question':{'page':LESSON_BY_KEY['welcome']['pages'][2]}})
        assignment.welcome_completed_at = assignment.welcome_completed_at or timezone.now()
        assignment.company_introduction = form.cleaned_data['introduction']
        assignment.save(update_fields=['welcome_completed_at', 'company_introduction'])
        messages.success(request, 'Knowledge checks complete. Your introduction is saved for trainer review.')
        return redirect('services', pk=pk)
    return render(request, 'training/welcome.html', {'assignment': assignment, 'form': form, 'writing_feedback':getattr(form,'writing_feedback',None)})


@permitted('learner', 'trainer', 'admin')
@require_http_methods(['GET', 'POST'])
def lesson(request, pk):
    assignment = own_assignment(request, pk, edit=request.method == 'POST')
    if not assignment.welcome_completed_at:
        return redirect('welcome', pk=pk)
    if request.method == 'POST':
        assignment.lesson_completed_at = timezone.now()
        assignment.save(update_fields=['lesson_completed_at'])
        return redirect('practice_library', pk=pk)
    return render(request, 'training/lesson.html', {'assignment': assignment})


@permitted('learner', 'trainer', 'admin')
def course(request, pk):
    assignment = own_assignment(request, pk)
    from .dashboard import dashboard_context
    return render(request, 'training/course.html', {'assignment': assignment, **dashboard_context(assignment),
        'attempts': assignment.attempts.order_by('-started_at')})


@permitted('learner', 'trainer', 'admin')
@require_http_methods(['GET', 'POST'])
def services(request, pk):
    assignment = own_assignment(request, pk, edit=request.method == 'POST')
    if request.method == 'POST':
        if not assignment.services_completed_at:
            assignment.services_completed_at = timezone.now()
            assignment.save(update_fields=['services_completed_at'])
        messages.success(request, 'Services and pricing marked as read. Try a sales exercise when you’re ready.')
        return redirect('practice_library', pk=pk)
    names = {'weekly':'Weekly', 'biweekly':'Every two weeks', 'monthly':'Monthly', 'deep':'Deluxe Deep', 'move':'Move In / Out'}
    prices = [{'name': names[key], 'amount': quote(key,2000)['total'], 'minimum': POLICY['services'][key]['minimum']}
              for key in ['weekly','biweekly','monthly','deep','move']]
    return render(request, 'training/services.html', {'assignment':assignment,'prices':prices,'policy':POLICY})


@permitted('learner', 'trainer', 'admin')
def practice_library(request, pk):
    assignment = own_assignment(request, pk)
    from .models import LiveCall
    from .live_views import enabled_for
    from .navigation import practice_next
    voice_assignment = Assignment.objects.filter(learner=assignment.learner,
        course__slug='microphone-acceptance-2026-10-07').first() or assignment
    return render(request, 'training/practice_library.html', {'assignment':assignment,
        'practice_next':practice_next(assignment), 'voice_assignment': voice_assignment, 'voice_enabled': enabled_for(voice_assignment),
        'voice_calls': LiveCall.objects.filter(attempt__assignment__learner=assignment.learner,
            state__in=['closed', 'failed']).select_related('attempt').order_by('-started_at')[:5],
        'attempts':assignment.attempts.order_by('-started_at'),
        'followups':assignment.followup_attempts.order_by('-started_at'),
        'focus':assignment.coaching_focuses.filter(active=True).first(),
        'latest_attempt':assignment.attempts.order_by('-started_at').first(),
        'latest_followup':assignment.followup_attempts.order_by('-started_at').first()})


def is_expired(attempt):
    return timezone.now() >= attempt.started_at + timedelta(minutes=attempt.limits.get('minutes', settings.MAX_ATTEMPT_MINUTES))


@require_POST
@permitted('learner')
def start(request, pk):
    assignment = own_assignment(request, pk, edit=True)
    from .navigation import practice_blocked
    selected = None
    if 'persona_id' in request.POST:
        from .sales_forms import ScenarioForm
        selected = ScenarioForm(request.POST)
        if not selected.is_valid():
            return HttpResponseBadRequest('Choose an available caller, difficulty and practice format.')
    if not assignment.welcome_completed_at or not assignment.lesson_completed_at:
        return practice_blocked(request,assignment,'Complete both assigned chapters before practice.',409)
    with transaction.atomic():
        get_user_model().objects.select_for_update().get(pk=request.user.pk)
        Assignment.objects.select_for_update().get(pk=pk)
        active = assignment.attempts.filter(status='active').first()
        if active and not is_expired(active):
            return redirect('attempt', pk=active.pk)
        if active:
            active.status = 'expired'
            active.save(update_fields=['status'])
        if assignment.attempts.filter(status='submitted').exists():
            return practice_blocked(request,assignment,'Manager review is required before retrying a submitted attempt.',409)
        session_limits = limits()
        if attempts_today(request.user) >= session_limits['daily_attempts']:
            return practice_blocked(request,assignment,'Daily practice limit reached. Return tomorrow.',429)
        policy, scenario, rubric = snapshots()
        if selected is not None:
            from copy import deepcopy
            from .sales_scenarios import scenario_snapshot
            from .sales_feedback import DRAFT_RUBRIC
            scenario = scenario_snapshot(**selected.cleaned_data, policy=policy)
            rubric = deepcopy(DRAFT_RUBRIC)
        opening = ({'id':'turn-1','speaker':'Customer','text':scenario['opening_text']}
                   if selected is not None else {'id': 'turn-1', 'speaker': 'Customer', 'text': scenario['customer_lines']['opening'], 'clip': 'opening'})
        attempt = Attempt.objects.create(assignment=assignment, policy=policy, scenario=scenario, rubric=rubric, limits=session_limits, coaching_focus=assignment.coaching_focuses.filter(active=True).first(),
            transcript=[opening])
        record_usage(attempt, 'scenario_opening' if selected is not None else 'opening_fixture', None if selected is not None else 'opening')
    return redirect('attempt', pk=attempt.pk)


def get_attempt(request, pk, edit=False):
    attempt = get_object_or_404(Attempt.objects.select_related('assignment__learner', 'assignment__course'), pk=pk)
    own_assignment(request, attempt.assignment_id, edit=edit)
    return attempt


@permitted('learner', 'trainer', 'admin')
def attempt_detail(request, pk, crm_form=None, review_form=None, status=200):
    attempt = get_attempt(request, pk)
    if attempt.scenario.get('mode') == 'scenario_rehearsal':
        from .sales_views import render_detail
        return render_detail(request,attempt,crm_form,review_form,status)
    if attempt.scenario.get('mode') == 'live':
        if review_form is not None:
            from .live_views import render_detail
            return render_detail(request, pk, review_form=review_form, status=status)
        return redirect('live_detail', pk=pk)
    outcome_labels = {'qualified_request': 'Qualified service request', 'policy_correction_required': 'Policy correction required',
                      'escalation_for_review': 'Escalation ready for manager review', 'incomplete': 'More practice evidence needed'}
    crm_labels = {'customer': 'Customer', 'sqft': 'Home size (sq ft)', 'service': 'Requested service', 'needs': 'Cleaning needs',
                  'initial_quote': 'Initial deep estimate ($)', 'recurring_quote': 'Biweekly estimate ($)',
                  'disposition': 'Next-step status', 'follow_up': 'Follow-up notes', 'reason': 'Escalation / non-fit reason'}
    transcript = [dict(t, audio=LocalVoice().audio_url(t['clip'], attempt.scenario.get('audio_version','legacy')) if t.get('clip') else None) for t in attempt.transcript]
    from .navigation import review_navigation
    return render(request, 'training/attempt.html', {**review_navigation(attempt), 'attempt': attempt,
        'transcript': transcript, 'actions': ACTIONS.items(), 'crm_form': crm_form if crm_form is not None else CRMForm(initial=attempt.crm),
        'can_edit': request.user.pk == attempt.assignment.learner_id and attempt.status == 'active' and not is_expired(attempt),
        'expired': is_expired(attempt) and attempt.status == 'active',
        'recordings': attempt.recordings.order_by('created_at'),
        'unsaved_crm': [(field.label,field.value()) for field in crm_form] if crm_form is not None and not (attempt.status=='active' and not is_expired(attempt)) else [],
        'review_form': review_form if review_form is not None else ReviewForm(), 'review': Review.objects.filter(attempt=attempt).first(),
        'outcome_label': outcome_labels.get(attempt.feedback.get('outcome', {}).get('code'), ''),
        'crm_rows': [(label, attempt.crm.get(key, '')) for key, label in crm_labels.items()] if attempt.crm else []}, status=status)


def add_event(attempt, code, evidence):
    attempt.actions.append({'code': code, 'evidence': evidence, 'order': len(attempt.actions),
                            'at': timezone.now().isoformat()})


def add_turn(attempt, speaker, text, clip=None):
    item = {'id': 'turn-' + str(len(attempt.transcript) + 1), 'speaker': speaker, 'text': text}
    if clip:
        item['clip'] = clip
    attempt.transcript.append(item)
    return item['id']


@require_POST
@permitted('learner')
def mutate_attempt(request, pk):
    existing = get_attempt(request, pk, edit=True)
    if existing.scenario.get('mode') == 'scenario_rehearsal':
        from .sales_views import mutate
        return mutate(request,pk)
    if existing.scenario.get('mode') == 'live':
        return HttpResponse('Use this live call’s own notes and end-call controls.', status=409)
    try:
        revision = int(request.POST.get('revision', ''))
    except ValueError:
        return HttpResponseBadRequest('Missing attempt revision.')
    with transaction.atomic():
        attempt = Attempt.objects.select_for_update().get(pk=pk)
        if attempt.status != 'active' or attempt.revision != revision:
            messages.info(request, 'That step was already saved or this tab is stale. The latest saved attempt is shown.')
            if request.POST.get('op')=='crm':
                messages.info(request, 'Your unsaved notes are retained below. Compare them with the latest conversation before saving again.')
                return attempt_detail(request, pk, crm_form=CRMForm(request.POST), status=409)
            return redirect('attempt', pk=pk)
        if is_expired(attempt):
            attempt.status = 'expired'
            attempt.save(update_fields=['status'])
            messages.info(request, 'The session time limit was reached. Your saved transcript remains available.')
            return redirect('attempt', pk=pk)
        op = request.POST.get('op')
        if op == 'turn':
            action = request.POST.get('action')
            if action not in ACTIONS:
                return HttpResponseBadRequest('Unknown scripted action.')
            if sum(e['code'] in ACTIONS for e in attempt.actions) >= attempt.limits.get('turns', settings.MAX_TURNS):
                return HttpResponse('Turn limit reached. Save notes and submit or end this attempt.', status=429)
            trainee_lines = attempt.scenario.get('trainee_lines', {key:value[1] for key,value in LEGACY_ACTIONS.items()})
            evidence = add_turn(attempt, 'Trainee (scripted)', trainee_lines[action])
            add_event(attempt, action, evidence)
            clip = respond(action, attempt)
            add_turn(attempt, 'Customer', attempt.scenario.get('customer_lines', LEGACY_CLIPS)[clip], clip)
        elif op == 'crm':
            form = CRMForm(request.POST)
            if not form.is_valid():
                messages.error(request, 'Please check the highlighted fields. Your notes have not been saved yet.')
                return attempt_detail(request, pk, crm_form=form)
            if not any(e['code'] == 'discover' for e in attempt.actions):
                return HttpResponse('Complete discovery before saving a quote.', status=409)
            attempt.crm = form.cleaned_data
            evidence = add_turn(attempt, 'Practice CRM', f'Saved fictional quote: initial ${attempt.crm["initial_quote"]}, biweekly ${attempt.crm["recurring_quote"]}. Disposition: {attempt.crm["disposition"]}. Needs: {attempt.crm["needs"]}. Next step: {attempt.crm["follow_up"]}. Reason: {attempt.crm["reason"]}')
            add_event(attempt, 'saved_quote', evidence)
        elif op == 'submit':
            attempt.feedback = grade_observations(attempt, validate_outcome(attempt))
            attempt.status = 'submitted'
            attempt.submitted_at = timezone.now()
        elif op == 'abandon':
            attempt.status = 'abandoned'
        else:
            return HttpResponseBadRequest('Unknown operation.')
        # Bounds include repeated form saves as well as scripted turns.
        if len(attempt.transcript) > 100:
            return HttpResponse('Evidence limit reached. Submit or end this attempt.', status=429)
        updated = Attempt.objects.filter(pk=pk, revision=revision, status='active').update(
            transcript=attempt.transcript, actions=attempt.actions, crm=attempt.crm,
            feedback=attempt.feedback, status=attempt.status, submitted_at=attempt.submitted_at, revision=revision + 1)
        if not updated:
            return HttpResponse('Another tab saved this attempt. Refresh to continue.', status=409)
        attempt.revision = revision + 1
        if op == 'turn':
            record_usage(attempt, 'customer_fixture', clip)
        elif op == 'submit':
            record_usage(attempt, 'grading')
    if op in {'submit','abandon'}:
        from django.urls import reverse
        return redirect(reverse('attempt',args=[pk])+'#practice-next')
    return redirect('attempt', pk=pk)


@permitted('admin')
@require_http_methods(['GET', 'POST'])
def costs(request):
    current = budget()
    current.pk = 1
    budget_form = BudgetForm(instance=current)
    cost_form = OperatingCostForm(initial={'month': timezone.localdate().replace(day=1)})
    if request.method == 'POST':
        if request.POST.get('op') == 'budget':
            budget_form = BudgetForm(request.POST, instance=current)
            if budget_form.is_valid():
                budget_form.save()
                messages.success(request, 'Budget target and practice limits saved. Paid providers remain disabled. Session limits apply to new attempts.')
                return redirect('costs')
        elif request.POST.get('op') == 'operating':
            cost_form = OperatingCostForm(request.POST)
            if cost_form.is_valid():
                cost = cost_form.save(commit=False)
                cost.entered_by = request.user
                cost.save()
                messages.success(request, 'Manual non-AI cost recorded. This did not purchase or pay for anything.')
                return redirect('costs')
        else:
            return HttpResponseBadRequest('Unknown cost operation.')
    return render(request, 'training/costs.html', {**summarize(), 'budget_form': budget_form, 'cost_form': cost_form})


@require_POST
@permitted('trainer', 'admin')
def review(request, pk):
    attempt = get_attempt(request, pk)
    form = ReviewForm(request.POST)
    if not form.is_valid():
        messages.error(request, 'Please check the highlighted feedback fields. Your draft is still here.')
        return attempt_detail(request, pk, review_form=form)
    data = form.cleaned_data
    with transaction.atomic():
        attempt = Attempt.objects.select_for_update().get(pk=pk)
        if attempt.status != 'submitted' or Review.objects.filter(attempt=attempt).exists():
            return HttpResponse('This attempt is not awaiting its first manager review.', status=409)
        outcome = attempt.feedback['outcome']
        if data['decision'] != 'retry' and not data['override_reason'].strip():
            form.add_error('override_reason', 'Explain the manager decision in the override field.')
            return attempt_detail(request, pk, review_form=form, status=400)
        if data['decision'] != 'retry' and outcome['violations']:
            return HttpResponse('Correct policy violations in a new practice attempt before readiness or accepted escalation.', status=409)
        if attempt.feedback.get('policy_flags') and data['decision']!='retry':
            if data.get('policy_flag_assessment')!='context_or_transcription' or len(data['override_reason'].strip())<10:
                form.add_error('policy_flag_assessment','Review the flagged recording. Confirmed unsupported promises need corrected practice. For a quotation or transcription error, record that assessment and explain the evidence; the AI flag alone is not a finding.')
                return attempt_detail(request,pk,review_form=form,status=400)
        from .review_evidence import learner_reference
        if data['decision'] == 'escalation' and outcome['code'] != 'escalation_for_review':
            live_escalation=(attempt.scenario.get('mode')=='live' and
                attempt.crm.get('disposition') in {'escalation','nonfit'} and attempt.crm.get('reason','').strip() and
                learner_reference(attempt,data.get('evidence','')))
            if not live_escalation:
                form.add_error('evidence','Record an explicit escalation and reason before accepting it. For live practice, cite saved learner evidence for the manager-verified next step.')
                return attempt_detail(request,pk,review_form=form,status=409)
        from .owner_decisions import VERSION as criteria_version
        objection = data.get('objection_evidence','').strip()
        if data['decision']=='ready' and not learner_reference(attempt,objection):
            form.add_error('objection_evidence','Cite an actual learner turn ID, or saved response-recording ID and in-range mm:ss timestamp, and describe the demonstrated objection handling. A customer line or lesson completion is insufficient.')
            return attempt_detail(request,pk,review_form=form,status=400)
        simulated_deposit = data.pop('simulated_deposit',False)
        if simulated_deposit:
            from .sales_feedback import validate_sales_outcome
            if (attempt.policy.get('owner_decisions',{}).get('won_requires')!='paid_deposit' or
                    attempt.scenario.get('mode')!='scenario_rehearsal' or attempt.scenario.get('drill')!='full' or
                    validate_sales_outcome(attempt)['code']!='qualified_request'):
                form.add_error('simulated_deposit','An explicit simulated deposit is available only after a validated full rehearsal request using the current owner policy. A proposal, verbal yes or follow-up alone is not a win.')
                return attempt_detail(request,pk,review_form=form,status=400)
            data['simulated_deposit_reference']='SIMULATED-DEPOSIT-'+str(attempt.pk)
        data['criteria_version']=criteria_version
        Review.objects.create(attempt=attempt, reviewer=request.user, **data)
        attempt.status = 'reviewed'
        attempt.save(update_fields=['status'])
    messages.success(request, 'Review saved. The learner can try again.')
    return redirect('attempt', pk=pk)
