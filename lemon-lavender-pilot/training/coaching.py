"""Manager-authored observations. No automatic readiness or employment decisions."""
from django import forms
from django.contrib import messages
from django.db import transaction
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from .models import Assignment, CoachingFocus, ReadinessReview
from .curriculum import RETIRED_LESSONS
from .written_checks import assess_saved
from .views import own_assignment, permitted

AREAS = [('knowledge','Company knowledge'), ('conversation','Conversation skills'),
         ('application','Practical application'), ('followthrough','Setup and follow-through'),
         ('ownership','Performance ownership'), ('objections','Objection handling — owner-required readiness evidence')]
STATES = [('not_assessed','Not assessed'), ('practice','Needs practice'), ('demonstrated','Demonstrated')]

class FocusForm(forms.Form):
    behavior = forms.CharField(min_length=10,max_length=500,label='One observable behavior for the next ten attempts',
        widget=forms.Textarea(attrs={'rows':2,'placeholder':'Example: ask what matters most before explaining the price.'}))

class ReadinessForm(forms.Form):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        for key,label in AREAS:
            self.fields[key]=forms.ChoiceField(label=label,choices=STATES)
            self.fields[key+'_evidence']=forms.CharField(required=False,max_length=1000,label=label+' — evidence',
                widget=forms.Textarea(attrs={'rows':2,'placeholder':'Identify a lesson check, call and turn, recording timestamp, or specific trainer observation.'}))
    def clean(self):
        data=super().clean()
        for key,label in AREAS:
            if data.get(key) in {'practice','demonstrated'} and not data.get(key+'_evidence','').strip():
                self.add_error(key+'_evidence','Add the evidence for this judgment.')
        return data

@permitted('learner','trainer','admin')
@require_http_methods(['GET','POST'])
def coaching(request,pk):
    assignment=own_assignment(request,pk)
    if request.method=='POST' and request.user.profile.role=='learner':
        from django.core.exceptions import PermissionDenied
        raise PermissionDenied
    latest=assignment.readiness_reviews.order_by('-created_at').first()
    initial={}
    if latest:
        for key,value in latest.areas.items():initial.update({key:value['state'],key+'_evidence':value['evidence']})
    focus_form=FocusForm(request.POST if request.POST.get('action')=='focus' else None)
    readiness_form=ReadinessForm(request.POST if request.POST.get('action')=='readiness' else None,initial=initial)
    if request.method=='POST':
        action=request.POST.get('action')
        if action=='focus' and focus_form.is_valid():
            with transaction.atomic():
                Assignment.objects.select_for_update().get(pk=pk)
                active=assignment.coaching_focuses.filter(active=True).first()
                behavior=focus_form.cleaned_data['behavior']
                if not active or active.behavior!=behavior:
                    assignment.coaching_focuses.filter(active=True).update(active=False)
                    CoachingFocus.objects.create(assignment=assignment,behavior=behavior,created_by=request.user)
            messages.success(request,'Coaching focus saved for new attempts. Earlier attempts keep their original focus.')
            return redirect('coaching',pk=pk)
        elif action=='readiness' and readiness_form.is_valid():
            areas={key:{'state':readiness_form.cleaned_data[key],'evidence':readiness_form.cleaned_data[key+'_evidence']} for key,_ in AREAS}
            if not latest or areas!=latest.areas:
                ReadinessReview.objects.create(assignment=assignment,reviewer=request.user,areas=areas)
            messages.success(request,'Readiness observations saved. Live-call access is not enabled by this checklist.')
            return redirect('coaching',pk=pk)
        elif action not in {'focus','readiness'}:
            from django.http import HttpResponseBadRequest
            return HttpResponseBadRequest('Unknown coaching action.')
    focus=assignment.coaching_focuses.filter(active=True).first()
    rows=[{'label':label,'state':dict(STATES).get((latest.areas.get(key,{}) if latest else {}).get('state'),'Not assessed'),
           'evidence':(latest.areas.get(key,{}) if latest else {}).get('evidence','')} for key,label in AREAS]
    tracked=list(focus.attempts.select_related('review').order_by('started_at')[:10]) if focus else []
    labels={'qualified_request':'Qualified service request','incomplete':'More practice evidence needed','policy_correction_required':'Policy correction required','escalation_for_review':'Manager escalation / non-fit'}
    for item in tracked:item.coaching_outcome_label=labels.get(item.feedback.get('outcome',{}).get('code'),'Outcome not yet evaluated')
    lesson_responses=[]
    for progress in assignment.guided_lessons.order_by('updated_at'):
        for index,answer in progress.answers.items():
            if answer.get('reflection'):
                lesson_responses.append({'title':progress.content['pages'][int(index)]['title'],'text':answer['reflection'],
                    'complete':int(index) in progress.completed_pages,'retired':progress.lesson_key in RETIRED_LESSONS,
                    'writing_feedback':assess_saved(progress.lesson_key,int(index),progress.content,answer), 'url':reverse('guided_lesson',args=[pk,progress.lesson_key,int(index)+1])})
    from .dashboard import dashboard_context
    return render(request,'training/coaching.html',{'next_training_step':dashboard_context(assignment)['primary_step'],'assignment':assignment,'focus':focus,'focus_form':focus_form,
        'readiness_form':readiness_form,'areas':rows,'latest':latest,'lesson_responses':lesson_responses,
        'tracked':tracked,
        'tracked_count':focus.attempts.count() if focus else 0,
        'older_focuses':assignment.coaching_focuses.filter(active=False).prefetch_related('attempts').order_by('-created_at')})
