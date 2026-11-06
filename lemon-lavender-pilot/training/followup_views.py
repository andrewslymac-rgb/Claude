from copy import deepcopy
from datetime import timedelta
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods, require_POST
from .followup import ACTION_LABELS, FOLLOWUP_POLICY, STATUS_LABELS, WorkflowError, advance_state, after_hours_context, business_day_labels, business_hours_context, initial_state, pending_actions, prepare_scenario, stage_actions, stage_heading
from .followup_forms import CallbackForm, FollowupCheckForm, FollowupSetupForm, PreferenceForm
from .models import Assignment, FollowupAttempt
from .usage import attempts_today, limits
from .views import own_assignment, permitted


@permitted('learner', 'trainer', 'admin')
@require_http_methods(['GET', 'POST'])
def lesson(request, pk):
    assignment = own_assignment(request, pk, edit=request.method == 'POST')
    if not assignment.welcome_completed_at:
        return redirect('welcome', pk=pk)
    form = FollowupCheckForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        assignment.followup_lesson_completed_at = timezone.now()
        assignment.save(update_fields=['followup_lesson_completed_at'])
        messages.success(request, 'Follow-up knowledge checks complete. The synthetic workflow is unlocked.')
        return redirect('followup_setup', pk=pk)
    return render(request, 'training/followup_lesson.html', {'assignment': assignment, 'policy': FOLLOWUP_POLICY, 'form': form})


@permitted('learner', 'trainer', 'admin')
@require_http_methods(['GET', 'POST'])
def setup(request, pk):
    assignment = own_assignment(request, pk, edit=request.method == 'POST')
    form = FollowupSetupForm(request.POST or None)
    if request.method == 'POST':
        if not assignment.welcome_completed_at or not assignment.followup_lesson_completed_at:
            return HttpResponse('Complete the company welcome and follow-up lesson first.', status=409)
        if form.is_valid():
            with transaction.atomic():
                get_user_model().objects.select_for_update().get(pk=request.user.pk)
                Assignment.objects.select_for_update().get(pk=pk)
                active = assignment.followup_attempts.filter(status='active').first()
                if active and not expired(active):
                    messages.info(request, 'Resumed the existing active exercise. Finish or end it before choosing a different scenario.')
                    return redirect('followup_attempt', pk=active.pk)
                if active:
                    expire(active)
                session_limits = limits()
                if attempts_today(request.user) >= session_limits['daily_attempts']:
                    return HttpResponse('Daily practice limit reached. Return tomorrow.', status=429)
                scenario = prepare_scenario(form.cleaned_data, FOLLOWUP_POLICY)
                state = initial_state(scenario, FOLLOWUP_POLICY)
                attempt = FollowupAttempt.objects.create(assignment=assignment, policy=deepcopy(FOLLOWUP_POLICY),
                    scenario=scenario, limits=session_limits, state=state, status=state['status'])
            return redirect('followup_attempt', pk=attempt.pk)
    return render(request, 'training/followup_setup.html', {'assignment': assignment, 'form': form,
        'attempts': assignment.followup_attempts.order_by('-started_at'), 'ready': bool(assignment.welcome_completed_at and assignment.followup_lesson_completed_at)})


def expired(attempt):
    return timezone.now() >= attempt.started_at + timedelta(minutes=attempt.limits.get('minutes', 20))


def expire(attempt):
    attempt.status = 'expired'
    attempt.state = {**attempt.state, 'status': 'expired'}
    attempt.save(update_fields=['status', 'state'])


def allowed_attempt(request, pk, edit=False):
    attempt = get_object_or_404(FollowupAttempt.objects.select_related('assignment__learner'), pk=pk)
    own_assignment(request, attempt.assignment_id, edit=edit)
    return attempt


@permitted('learner', 'trainer', 'admin')
def detail(request, pk, callback_form=None, status=200):
    attempt = allowed_attempt(request, pk)
    pending = pending_actions(attempt.state, attempt.scenario, attempt.policy)
    is_live = attempt.scenario['arrival'] == 'live_call'
    stage = attempt.policy['stages'][attempt.state['stage']]
    expected = stage_actions(attempt.state, attempt.scenario, attempt.policy)
    skipped = [ACTION_LABELS[a] for a in stage['actions'] if a not in expected] if attempt.status == 'active' and not is_live else []
    return render(request, 'training/followup_attempt.html', {'attempt': attempt,
        'status_label': STATUS_LABELS[attempt.status], 'stage_label': 'Live inbound call · answer immediately' if is_live else stage_heading(attempt.state, attempt.scenario, attempt.policy),
        'business_days': business_day_labels(attempt.scenario['day_one_weekday'], attempt.policy) if 'day_one_weekday' in attempt.scenario and attempt.policy.get('business_weekdays') else [],
        'business_clock': business_hours_context(timezone.now(), attempt.policy),
        'after_hours': after_hours_context(attempt.scenario, attempt.policy),
        'next_action': pending[0] if pending else None, 'next_label': ACTION_LABELS[pending[0]] if pending else '',
        'skipped': skipped, 'can_advance': attempt.status == 'active' and not pending,
        'can_edit': request.user.pk == attempt.assignment.learner_id and not expired(attempt) and attempt.status not in {'expired', 'ended', 'opted_out'},
        'expired': expired(attempt), 'callback_form': callback_form if callback_form is not None else CallbackForm(initial=attempt.state.get('callback') or {}),
        'unsaved_callback': callback_form.data if callback_form is not None and attempt.status!='responded' else None,
        'preference_form': PreferenceForm(), 'is_live': is_live},status=status)


@require_POST
@permitted('learner')
def act(request, pk):
    allowed_attempt(request, pk, edit=True)
    try:
        revision = int(request.POST.get('revision', ''))
        elapsed = int(request.POST.get('elapsed_seconds', '0'))
    except ValueError:
        return HttpResponseBadRequest('Supply a valid revision and whole simulated seconds.')
    with transaction.atomic():
        attempt = FollowupAttempt.objects.select_for_update().get(pk=pk)
        if attempt.revision != revision:
            messages.info(request, 'This action was already saved or the tab is stale. The latest evidence is shown.')
            if request.POST.get('action')=='callback':
                messages.info(request, 'Your unsaved callback note is retained. Check the current customer status before saving again.')
                return detail(request,pk,callback_form=CallbackForm(request.POST),status=409)
            return redirect('followup_attempt', pk=pk)
        if expired(attempt):
            expire(attempt)
            return redirect('followup_attempt', pk=pk)
        if len(attempt.events) >= 100:
            return HttpResponse('Practice evidence limit reached. Start a new exercise after this session expires.', status=429)
        action = request.POST.get('action')
        data = {'elapsed_seconds': elapsed, 'answer_timing': request.POST.get('answer_timing', 'immediate')}
        if action == 'callback':
            form = CallbackForm(request.POST)
            if not form.is_valid():
                messages.error(request, 'Check the callback fields below. Your written note is retained.')
                return detail(request,pk,callback_form=form)
            data.update(form.cleaned_data)
        if action == 'preference':
            form = PreferenceForm(request.POST)
            if not form.is_valid():
                return HttpResponseBadRequest('Invalid channel preference.')
            data.update(form.cleaned_data)
        try:
            state, event = advance_state(attempt.state, attempt.scenario, attempt.policy, action, data)
        except WorkflowError as error:
            messages.error(request, str(error))
            return redirect('followup_attempt', pk=pk)
        event.update({'id': 'event-' + str(len(attempt.events) + 1), 'at': timezone.now().isoformat()})
        changed = FollowupAttempt.objects.filter(pk=pk, revision=revision).update(
            state=state, status=state['status'], events=[*attempt.events, event], revision=revision + 1)
        if not changed:
            return HttpResponse('Another tab updated this exercise. Refresh to continue.', status=409)
    return redirect('followup_attempt', pk=pk)
