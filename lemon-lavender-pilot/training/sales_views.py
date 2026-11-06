"""Existing Attempt storage/permissions, extended with bounded local scenarios."""
from datetime import timedelta
from django.contrib import messages
from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_GET
from .views import permitted, own_assignment, get_attempt, is_expired, add_event, add_turn
from .models import Attempt, Review
from .forms import ReviewForm
from .sales_forms import ScenarioForm, ScenarioCRMForm
from .sales_scenarios import scenario_snapshot, library_cards, render_caller_prompt
from .sales_content import OBJECTIONS
from .sales_actor import action_choices, trainee_line, reply, replay
from .sales_feedback import sales_feedback, DRAFT_RUBRIC
from .policies import POLICY
from .usage import record_usage
from .navigation import practice_next, review_navigation


@require_GET
@permitted('learner','trainer','admin')
def library(request,pk):
    assignment=own_assignment(request,pk)
    form=ScenarioForm(request.GET if request.GET else {'persona_id':'busy_parent','difficulty':'beginner','drill':'full'})
    selected=scenario_snapshot(**form.cleaned_data) if form.is_valid() else None
    return render(request,'training/scenario_library.html',{'assignment':assignment,'form':form,'selected':selected,
        'practice_next':practice_next(assignment),'callers':library_cards(),'objections':OBJECTIONS.values(),'draft_rubric':DRAFT_RUBRIC,
        'prompt_preview':render_caller_prompt(POLICY,selected)
                         if selected and request.user.profile.role!='learner' else None,
        'can_start':assignment.welcome_completed_at and assignment.lesson_completed_at and request.user.profile.role=='learner'},
        status=200 if selected else 400)


def render_detail(request,attempt,crm_form=None,review_form=None,status=200):
    state=replay(attempt.scenario,attempt.actions)
    can_edit=request.user.pk==attempt.assignment.learner_id and attempt.status=='active' and not is_expired(attempt)
    form=crm_form if crm_form is not None else ScenarioCRMForm(initial=attempt.crm,scenario=attempt.scenario)
    return render(request,'training/scenario_attempt.html',{**review_navigation(attempt),'attempt':attempt,'state':state,
        'actions':[{'key':key,'label':label,'words':trainee_line(key,attempt.scenario,attempt.actions),
                    'mistake':key in {'discount','waive','falsebook','assurance'}} for key,label in action_choices(attempt.scenario)],
        'can_edit':can_edit,'expired':is_expired(attempt) and attempt.status=='active','crm_form':form,
        'deadline':(attempt.started_at+timedelta(minutes=attempt.limits['minutes'])).isoformat(),
        'recordings':attempt.recordings.order_by('created_at'),'review':Review.objects.filter(attempt=attempt).first(),
        'review_form':review_form if review_form is not None else ReviewForm(),
        'unsaved_crm':crm_form is not None and not can_edit,
        'outcome_label':{'qualified_request':'Qualified practice request','incomplete':'More evidence needed',
            'escalation_for_review':'Clarification / non-fit for review','followup_agreed':'Follow-up agreed; no service commitment',
            'drill_completed':'Focused drill submitted; manager review needed','policy_correction_required':'Policy correction required'}.get(attempt.feedback.get('outcome',{}).get('code'),''),
    },status=status)


def mutate(request,pk):
    existing=get_attempt(request,pk,edit=True)
    try:revision=int(request.POST.get('revision',''))
    except ValueError:return HttpResponseBadRequest('Missing attempt revision.')
    with transaction.atomic():
        attempt=Attempt.objects.select_for_update().get(pk=pk)
        if attempt.status!='active' or attempt.revision!=revision:
            messages.info(request,'This tab is stale or the attempt is closed. Earlier evidence remains saved.')
            form=ScenarioCRMForm(request.POST,scenario=attempt.scenario) if request.POST.get('op')=='crm' else None
            return render_detail(request,attempt,crm_form=form,status=409)
        if is_expired(attempt):
            attempt.status='expired';attempt.save(update_fields=['status'])
            return redirect('attempt',pk=pk)
        op=request.POST.get('op')
        if op=='turn':
            action=request.POST.get('action')
            allowed=dict(action_choices(attempt.scenario))
            if action not in allowed:return HttpResponseBadRequest('Choose an available rehearsal action.')
            if sum(e['code'] in allowed for e in attempt.actions)>=attempt.limits['turns']:
                return HttpResponse('Response limit reached. Save your notes, submit or end this attempt.',status=429)
            evidence=add_turn(attempt,'Trainee (scripted)',trainee_line(action,attempt.scenario,attempt.actions))
            add_event(attempt,action,evidence)
            answer=reply(attempt.scenario,attempt.actions)
            add_turn(attempt,'Customer',answer['text'])
            attempt.transcript[-1].update(result=answer['result'],objection_id=answer['objection_id'])
        elif op=='crm':
            form=ScenarioCRMForm(request.POST,scenario=attempt.scenario)
            if not form.is_valid():return render_detail(request,attempt,crm_form=form)
            if 'discover' not in replay(attempt.scenario,attempt.actions)['met']:
                return HttpResponse('Discover the property before saving its notes.',status=409)
            attempt.crm=form.cleaned_data
            evidence=add_turn(attempt,'Practice CRM',f"Saved fictional notes. First estimate: {attempt.crm['initial_quote']}; ongoing: {attempt.crm['recurring_quote']}; disposition: {attempt.crm['disposition']}. Needs: {attempt.crm['needs']}. Next step: {attempt.crm['follow_up']}. Reason: {attempt.crm['reason']}")
            add_event(attempt,'saved_quote',evidence)
        elif op=='submit':
            attempt.feedback=sales_feedback(attempt);attempt.status='submitted';attempt.submitted_at=timezone.now()
        elif op=='abandon':attempt.status='abandoned'
        else:return HttpResponseBadRequest('Unknown operation.')
        if len(attempt.transcript)>100:return HttpResponse('Evidence limit reached. Submit or end the attempt.',status=429)
        changed=Attempt.objects.filter(pk=pk,revision=revision,status='active').update(transcript=attempt.transcript,
            actions=attempt.actions,crm=attempt.crm,feedback=attempt.feedback,status=attempt.status,
            submitted_at=attempt.submitted_at,revision=revision+1)
        if not changed:return HttpResponse('Another tab saved this attempt. Refresh to continue.',status=409)
        attempt.revision=revision+1
        if op in {'turn','submit'}:record_usage(attempt,'scenario_response' if op=='turn' else 'grading')
    if op in {'submit','abandon'}:
        from django.urls import reverse
        return redirect(reverse('attempt',args=[pk])+'#practice-next')
    return redirect('attempt',pk=pk)
