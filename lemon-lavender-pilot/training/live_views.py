"""Authenticated loopback-only live-test views. No key ever enters a response."""
import base64
import json
import math
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse, FileResponse, Http404
from django.shortcuts import get_object_or_404, render, redirect
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST, require_safe
from .forms import CRMForm, ReviewForm
from .models import Assignment, Attempt, LiveCall, Review
from .policies import snapshots
from .usage import attempts_today, limits
from .views import permitted, own_assignment, get_attempt, add_event, add_turn, is_expired
from .live_budget import APPROVAL, MAX_ACTIVE_SECONDS, BudgetDenied
from .live_runtime import controller, audio_directory
from .microphone_acceptance import COURSE_SLUG, TECHNICAL_COURSE_SLUGS
from .voice_quality_acceptance import COURSE_SLUG as QUALITY_COURSE, PERSONA as QUALITY_PERSONA, DIFFICULTY as QUALITY_DIFFICULTY
from django.urls import reverse
from .combined_audio import combined_status
from .audio_response import audio_response
from .live_preparation import LivePreparationForm, selected_scenario, selection_allowed, notes_form, live_rubric


def input_mode(assignment):
    return 'microphone' if assignment.course.slug in TECHNICAL_COURSE_SLUGS else 'synthetic'


def enabled_for(assignment):
    return bool(controller.armed and controller.input_mode == input_mode(assignment) and
                (controller.assignment_id is None or controller.assignment_id == assignment.pk))


@require_GET
@permitted('learner', 'trainer', 'admin')
def microphone_test(request):
    assignment = get_object_or_404(Assignment, course__slug=COURSE_SLUG,
                                  learner__email='learner@example.invalid')
    own_assignment(request, assignment.pk)
    return redirect('live_prepare', pk=assignment.pk)


@require_GET
@permitted('learner','trainer','admin')
def voice_quality_test(request):
    assignment=get_object_or_404(Assignment,course__slug=QUALITY_COURSE,learner__email='learner@example.invalid')
    own_assignment(request,assignment.pk)
    previous=assignment.attempts.filter(live_call__isnull=False).order_by('-started_at').first()
    if previous:
        return redirect('live_detail',pk=previous.pk)
    return redirect('live_prepare',pk=assignment.pk)


def problem(message, status=409):
    return JsonResponse({'ok': False, 'message': message}, status=status)


def body(request, limit=32000):
    if len(request.body) > limit:
        raise ValueError
    value = json.loads(request.body)
    if not isinstance(value, dict):
        raise ValueError
    return value


def session_for(request, pk, edit=True):
    attempt = get_attempt(request, pk, edit=edit)
    get_object_or_404(LiveCall, pk=pk)
    return attempt, controller.sessions.get(str(pk))


@require_GET
@permitted('learner', 'trainer', 'admin')
def prepare(request, pk):
    assignment = own_assignment(request, pk)
    policy, _, _ = snapshots()
    quality_test = assignment.course.slug == QUALITY_COURSE
    selection = {'persona_id':QUALITY_PERSONA,'difficulty':QUALITY_DIFFICULTY} if quality_test else request.GET
    try:
        scenario = selected_scenario(selection, policy)
    except ValueError as exc:
        return problem(str(exc), 400)
    enabled = enabled_for(assignment) and selection_allowed(controller, scenario)
    request.live_microphone_allowed = input_mode(assignment) == 'microphone' and enabled
    return render(request, 'training/live_call.html', {'assignment': assignment,
        'live_page': True, 'offline_rehearsal': getattr(settings, 'LIVE_MOCK', False), 'live_enabled': enabled, 'input_mode': input_mode(assignment),
        'quality_test':quality_test,
        'selection_form':None if quality_test else LivePreparationForm(initial={'persona_id':request.GET.get('persona_id',''),'difficulty':request.GET.get('difficulty','beginner')}),
        'selected':scenario, 'crm_form': notes_form(scenario), 'max_seconds': MAX_ACTIVE_SECONDS})


@require_GET
@permitted('learner', 'trainer', 'admin')
def detail(request, pk):
    return render_detail(request, pk)


def render_detail(request, pk, review_form=None, status=200, alignment_form=None):
    attempt = get_attempt(request, pk)
    call = get_object_or_404(LiveCall, pk=pk)
    combined = combined_status(audio_directory(pk),call.evidence) if call.state in {'closed','failed'} else None
    from .transcript_alignment import review_context
    alignment = review_context(attempt,combined)
    if alignment_form is not None:
        alignment['alignment_form'] = alignment_form
    from .navigation import review_navigation
    return render(request, 'training/live_call.html', {**review_navigation(attempt), 'assignment': attempt.assignment,
        'attempt': attempt, 'call': call, 'live_page': True, 'offline_rehearsal': getattr(settings, 'LIVE_MOCK', False),
        'quality_test':attempt.assignment.course.slug == QUALITY_COURSE,
        'live_enabled': enabled_for(attempt.assignment), 'input_mode': input_mode(attempt.assignment),
        'selected':attempt.scenario, 'crm_form': notes_form(attempt.scenario, initial=attempt.crm), 'max_seconds': MAX_ACTIVE_SECONDS,
        'review_form': review_form if review_form is not None else ReviewForm(),
        'review': Review.objects.filter(attempt=attempt).first(),
        'combined': combined, **alignment}, status=status)


@require_POST
@permitted('learner')
def start(request, pk):
    assignment = own_assignment(request, pk, edit=True)
    if not enabled_for(assignment):
        return problem('Paid calling is disabled. This page cannot enable or renew the approved test.')
    try:
        data = body(request)
    except (ValueError, TypeError):
        return problem('Invalid call request.', 400)
    mode = input_mode(assignment)
    policy, historical, rubric = snapshots()
    try:
        selected = selected_scenario(data, policy)
    except ValueError as exc:
        return problem(str(exc), 400)
    if not selection_allowed(controller, selected):
        return problem('This caller and difficulty are not included in the current test authorization.')
    if assignment.course.slug == QUALITY_COURSE and (not selected or selected.get('persona_id')!=QUALITY_PERSONA or selected.get('difficulty')!=QUALITY_DIFFICULTY):
        return problem('This quality test uses its fixed fictional caller and intermediate difficulty.')
    if data.get('consent') is not True or data.get('input_mode') != mode:
        return problem('Confirm the specifically authorized input mode and recording/data notice.', 400)
    if mode == 'microphone' and data.get('mic_check_passed') is not True:
        return problem('Complete the local microphone check before starting the paid call.', 400)
    if mode != 'microphone' and (not assignment.welcome_completed_at or not assignment.lesson_completed_at):
        return problem('Complete welcome and conversation lessons first.')
    with transaction.atomic():
        get_user_model().objects.select_for_update().get(pk=request.user.pk)
        Assignment.objects.select_for_update().get(pk=pk)
        active = assignment.attempts.filter(status='active').first()
        if active and not is_expired(active):
            # Duplicate starts are not a second connection or charge.
            if hasattr(active, 'live_call'):
                return JsonResponse({'ok': True, 'attempt_id': str(active.pk), 'duplicate': True})
            return problem('Finish the current practice attempt first.')
        if active:
            active.status = 'expired'
            active.save(update_fields=['status'])
        if assignment.attempts.filter(status='submitted').exists():
            return problem('Manager review is required before another practice call.')
        if attempts_today(request.user) >= limits()['daily_attempts']:
            return problem('Daily practice limit reached.', 429)
        scenario = selected or historical
        if selected:
            rubric = live_rubric()
        from .sales_content import PROMPT_VERSION
        scenario.update(mode='live', version=scenario['version'] if selected else 'inbound-2000-live-v1', synthetic_test=mode == 'synthetic',
                        input_mode=mode, technical_acceptance=mode == 'microphone', prompt_version=PROMPT_VERSION)
        attempt = Attempt.objects.create(assignment=assignment, policy=policy, scenario=scenario,
            rubric=rubric, limits={**limits(), 'minutes': 5, 'live_seconds': MAX_ACTIVE_SECONDS},
            coaching_focus=assignment.coaching_focuses.filter(active=True).first())
        call = LiveCall.objects.create(attempt=attempt, approval=controller.budget.approval, synthetic_test=mode == 'synthetic')
    try:
        controller.start(call)
    except BudgetDenied as exc:
        Attempt.objects.filter(pk=attempt.pk).update(status='abandoned')
        LiveCall.objects.filter(pk=attempt.pk).update(state='blocked', error_code='budget_not_available')
        return problem(str(exc))
    except Exception:
        Attempt.objects.filter(pk=attempt.pk).update(status='abandoned')
        LiveCall.objects.filter(pk=attempt.pk).update(state='failed', error_code='local_start_failure')
        controller.armed = False
        return problem('Call startup failed. Paid mode is disabled pending review.', 503)
    return JsonResponse({'ok': True, 'attempt_id': str(attempt.pk), 'duplicate': False}, status=201)


@require_GET
@permitted('learner')
def events(request, pk):
    attempt, session = session_for(request, pk)
    if not session:
        return problem('The active connection is unavailable. Saved evidence remains; no reconnect was started.')
    try:
        after = int(request.GET.get('after', '0'))
        if after < 0:
            raise ValueError
        return JsonResponse({'ok': True, **session.poll(after)})
    except ValueError:
        return problem('Live delivery was interrupted. The call is closing; review saved evidence.')


@require_POST
@permitted('learner')
def input_audio(request, pk):
    attempt, session = session_for(request, pk)
    if not session:
        return problem('No active voice connection.')
    try:
        data = body(request)
        sequence = data.get('sequence')
        if not isinstance(sequence, int) or isinstance(sequence, bool):
            raise ValueError
        pcm = base64.b64decode(data.get('pcm', ''), validate=True)
        review_pcm = base64.b64decode(data['review_pcm'], validate=True) if 'review_pcm' in data else None
        session.accept_audio(pcm, sequence, data.get('start_frame'), review_pcm)
        return JsonResponse({'ok': True, 'sequence': sequence})
    except (ValueError, TypeError):
        return problem('Audio was not accepted. Stop the call and review the saved evidence.')


@require_POST
@permitted('learner')
def playback(request, pk):
    attempt, session = session_for(request, pk)
    if not session:
        return problem('No active voice connection.')
    try:
        data = body(request, 2000)
        if data.get('version') == 2:
            allowed = {'version','audio_event_id','epoch','phase','frames','played_frames','scheduled_frame'}
            numeric = set(data) - {'phase'}
            if (set(data)-allowed or not {'version','audio_event_id','epoch','phase','frames','played_frames'} <= set(data)
                    or data['phase'] not in {'scheduled','ended','cancelled','dropped'}
                    or any(type(data[k]) is not int or not 0 <= data[k] <= 7200000 for k in numeric)
                    or not 0 <= data['played_frames'] <= data['frames'] <= 48000
                    or (data['phase'] != 'dropped' and 'scheduled_frame' not in data)):
                raise ValueError
            session.note_playback(data)
            return JsonResponse({'ok':True})
        allowed = {'audio_event_id', 'scheduled_ms', 'duration_ms', 'scheduled_frame', 'frames', 'error'}
        clean = {k: v for k, v in data.items() if k in allowed and isinstance(v, (int, float, bool))}
        if len(clean) != len(data) or not clean or any(not math.isfinite(v) or not 0 <= v <= (7200000 if k in {'scheduled_frame', 'frames'} else 400000) for k, v in clean.items()):
            raise ValueError
        if 'scheduled_frame' in clean or 'frames' in clean:
            if any(type(clean.get(k)) is not int for k in ('scheduled_frame', 'frames', 'audio_event_id')):
                raise ValueError
        session.note_playback(clean)
        return JsonResponse({'ok': True})
    except (ValueError, TypeError):
        return problem('Invalid playback evidence.', 400)


@require_POST
@permitted('learner')
def control(request, pk):
    _, session = session_for(request, pk)
    if not session:
        return problem('No active voice connection.')
    try:
        data = body(request, 1000)
        if set(data) != {'action','sequence','frame'}:
            raise ValueError('Invalid playback control.')
        result = session.control_playback(data['action'],data['sequence'],data['frame'])
        return JsonResponse({'ok':True,**result})
    except (ValueError,TypeError) as exc:
        return problem(str(exc) if isinstance(exc,ValueError) else 'Invalid playback control.')


@require_POST
@permitted('learner')
def stop(request, pk):
    attempt, session = session_for(request, pk)
    if session:
        try:
            data = body(request)
            if 'end_frame' in data:
                session.note_end(data['end_frame'], data.get('capture_complete',False))
        except (ValueError, TypeError):
            session.stop()
            return problem('Invalid recording end time; call is closing.', 400)
        session.stop()
    # Idempotent; repeated stop never starts work or duplicates coaching.
    return JsonResponse({'ok': True, 'stopping': bool(session), 'saved_state': attempt.status})


@require_POST
@permitted('learner')
def notes(request, pk):
    attempt, session = session_for(request, pk)
    form = notes_form(attempt.scenario, request.POST)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'message': 'Check the handoff fields. Your draft stays on this page.',
                             'errors': form.errors.get_json_data()}, status=400)
    if not session or session.state != 'active' or session.stop_event.is_set():
        return problem('The call is closing or closed. This draft was not saved; retain it for manager review.')
    with transaction.atomic():
        attempt = Attempt.objects.select_for_update().get(pk=pk)
        try:
            revision = int(request.POST.get('revision', '-1'))
        except ValueError:
            return problem('Invalid notes revision.', 400)
        if attempt.status != 'active' or attempt.revision != revision:
            return problem('Another tab saved notes. Your draft is still here; reload after retaining it.')
        attempt.crm = form.cleaned_data
        evidence = add_turn(attempt, 'Practice CRM', 'Saved fictional handoff: ' + json.dumps(attempt.crm))
        add_event(attempt, 'saved_quote', evidence)
        if len(attempt.actions) > 24:
            return problem('Notes save limit reached.')
        attempt.revision += 1
        attempt.save(update_fields=['crm', 'transcript', 'actions', 'revision'])
    return JsonResponse({'ok': True, 'revision': attempt.revision})


@require_safe
@permitted('learner', 'trainer', 'admin')
def audio(request, pk, track):
    attempt = get_attempt(request, pk)
    call = get_object_or_404(LiveCall, pk=pk)
    if track not in {'learner', 'customer', 'combined'} or call.state not in {'closed', 'failed'}:
        raise Http404
    filename=track+'.wav'
    if track == 'combined':
        combined=combined_status(audio_directory(pk),call.evidence)
        if not combined: raise Http404
        filename=combined.get('filename','combined.wav')
    return audio_response(request, audio_directory(pk) / filename, track)



@require_GET
@permitted('learner')
def fixture(request):
    if not controller.armed:
        raise Http404
    path = Path(settings.BASE_DIR) / '.data' / 'live-test-fixture.wav'
    if not path.is_file():
        raise Http404
    return FileResponse(path.open('rb'), content_type='audio/wav')
