from copy import deepcopy
from django import forms
from django.contrib import messages
from django.db import transaction
from django.http import Http404, HttpResponseBadRequest
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from .curriculum import LESSON_BY_KEY, LEGACY_CREDIT, RETIRED_LESSONS, lesson_snapshot
from .learning import journey
from .dashboard import dashboard_context, section_for
from .models import Assignment, LessonProgress
from .written_checks import assess_saved
from .written_history import archive_guided
from .providers import LocalVoice
from .views import own_assignment, permitted


class CheckForm(forms.Form):
    choice=forms.ChoiceField(label='Choose your response',widget=forms.RadioSelect)
    reflection=forms.CharField(required=False,max_length=1000,widget=forms.Textarea(attrs={'rows':3}))

    def __init__(self,page,*args,draft=False,**kwargs):
        super().__init__(*args,**kwargs)
        self.fields['choice'].choices=[(o['value'],o['label']) for o in page['choices']]
        self.fields['choice'].required=not draft
        if page.get('reflection'):
            self.fields['reflection'].label=page['reflection']
            self.fields['reflection'].required=not draft
            self.fields['reflection'].help_text='Use fictional details. Local checks flag missing facts and clear policy conflicts; your trainer judges the response.'
        else:
            self.fields.pop('reflection')

    def clean_reflection(self):
        value=self.cleaned_data.get('reflection','').strip()
        return value


def lesson_data(assignment,key):
    if key not in LESSON_BY_KEY:raise Http404
    progress=assignment.guided_lessons.filter(lesson_key=key).first()
    return progress,progress.content if progress else lesson_snapshot(key)


def finish_legacy_credit(assignment,progress):
    field=LEGACY_CREDIT.get(progress.lesson_key)
    fields=[]
    if field and not getattr(assignment,field):
        setattr(assignment,field,progress.completed_at);fields.append(field)
    if progress.lesson_key=='welcome' and not assignment.company_introduction:
        assignment.company_introduction=progress.answers.get('2',{}).get('reflection','')
        fields.append('company_introduction')
    if fields:assignment.save(update_fields=fields)


@permitted('learner','trainer','admin')
@require_http_methods(['GET','POST'])
def lesson(request,pk,lesson_key,page):
    assignment=own_assignment(request,pk,edit=request.method=='POST')
    if lesson_key in RETIRED_LESSONS:
        if request.method=='POST':
            return render(request,'training/retired_lesson.html',{'assignment':assignment,'retired':True},status=410)
        progress=assignment.guided_lessons.filter(lesson_key=lesson_key).first()
        return render(request,'training/retired_lesson.html',{'assignment':assignment,'retired':True,
            'retired_progress':progress,'retired_answers':list((progress.answers if progress else {}).values())})
    progress,content=lesson_data(assignment,lesson_key)
    index=page-1
    if index<0 or index>=len(content['pages']):raise Http404
    current=content['pages'][index]
    saved=(progress.answers.get(str(index),{}) if progress else {})
    form=CheckForm(current,initial=saved)
    if request.method=='POST':
        action=request.POST.get('action')
        if action not in {'check','continue','save','request_review'}:return HttpResponseBadRequest('Unknown lesson action.')
        try:revision=int(request.POST.get('revision',''))
        except ValueError:return HttpResponseBadRequest('Refresh this lesson and try again.')
        form=CheckForm(current,request.POST,draft=action=='save')
        if request.POST.get('content_version') != content['version']:
            return show_lesson(request,assignment,content,current,progress,index,form,conflict='The lesson version changed. Your draft is retained below. Read the current question before checking it again.')
        if action not in {'continue','request_review'} and not form.is_valid():
            return show_lesson(request,assignment,content,current,progress,index,form)
        with transaction.atomic():
            locked=Assignment.objects.select_for_update().get(pk=assignment.pk)
            progress,created=LessonProgress.objects.select_for_update().get_or_create(assignment=locked,lesson_key=lesson_key,
                defaults={'content':deepcopy(content)})
            if progress.revision!=revision:
                return show_lesson(request,assignment,content,current,progress,index,form,conflict='Another tab saved newer work. Your draft is retained below; the saved answer has not been overwritten. Compare them before checking this draft again.')
            if index in progress.completed_pages and not current.get('reflection'):
                return redirect('guided_lesson_done',pk=pk,lesson_key=lesson_key) if progress.completed_at else redirect('guided_lesson',pk=pk,lesson_key=lesson_key,page=progress.page_index+1)
            if action=='continue':
                answer=progress.answers.get(str(index),{})
                writing=assess_saved(lesson_key,index,content,answer)
                if answer.get('correct') is not True or (writing and not writing['can_continue']):
                    messages.info(request,'Review the separate choice and written-response feedback before continuing.')
                    return redirect('guided_lesson',pk=pk,lesson_key=lesson_key,page=page)
                progress.completed_pages=sorted(set(progress.completed_pages+[index]))
                remaining=[i for i in range(len(content['pages'])) if i not in progress.completed_pages]
                progress.page_index=next((i for i in remaining if i>index),remaining[0] if remaining else index)
                if len(progress.completed_pages)==len(content['pages']):
                    progress.completed_at=progress.completed_at or timezone.now()
                    finish_legacy_credit(locked,progress)
            else:
                previous=progress.answers.get(str(index),{})
                if action=='request_review':
                    evaluation=assess_saved(lesson_key,index,content,previous)
                    if not evaluation or evaluation['issues'] or not previous.get('reflection') or previous.get('correct') is not True:
                        messages.info(request,'Correct the flagged issues and check the choice before requesting trainer review.')
                        return redirect('guided_lesson',pk=pk,lesson_key=lesson_key,page=page)
                    answer=deepcopy(previous)
                    evaluation.update(status='unassessed',label='Pending manager review',can_continue=True,review_requested=True,
                        note='Trainer review requested. Continuing does not approve this writing.')
                    answer['writing_evaluation']=evaluation
                else:
                    answer={'choice':form.cleaned_data.get('choice',''),'reflection':form.cleaned_data.get('reflection',''),
                        'correct':form.cleaned_data.get('choice')==current['correct'] if action=='check' else None,
                        'checked_at':timezone.now().isoformat() if action=='check' else None}
                    evaluation=assess_saved(lesson_key,index,content,answer) if action=='check' else None
                    if evaluation: answer['writing_evaluation']=evaluation
                archive_guided(locked,progress,index,previous,assess_saved(lesson_key,index,content,previous),prior=True)
                # Revision belongs to the new snapshot, preserving all earlier submissions.
                progress.revision+=1
                submission=archive_guided(locked,progress,index,answer,evaluation)
                if submission: answer['submission_id']=submission
                progress.revision-=1
                progress.answers={**progress.answers,str(index):answer}
                progress.page_index=index
            progress.revision+=1
            progress.save()
        if action=='continue':
            if progress.completed_at:return redirect('guided_lesson_done',pk=pk,lesson_key=lesson_key)
            return redirect('guided_lesson',pk=pk,lesson_key=lesson_key,page=progress.page_index+1)
        if action=='save':
            messages.success(request,'Your place and draft are saved. Continue whenever you’re ready.')
            return redirect('course',pk=pk)
        return redirect(reverse('guided_lesson',args=[pk,lesson_key,page])+'#check')
    return show_lesson(request,assignment,content,current,progress,index,form)


def show_lesson(request,assignment,content,current,progress,index,form,conflict=None):
    saved=progress.answers.get(str(index),{}) if progress else {}
    complete=bool(progress and index in progress.completed_pages)
    writing=assess_saved(content['key'],index,content,saved) if saved and saved.get('checked_at') and not form.is_bound else None
    can_continue=not form.is_bound and saved.get('correct') is True and (not writing or writing['can_continue'])
    audio=LocalVoice().audio_url(current['audio'],'samantha-v2') if current.get('audio') else None
    context=journey(assignment)
    row=next(r for r in context['journey_rows'] if r['key']==content['key'])
    remaining=[i for i in range(len(content['pages'])) if not progress or i not in progress.completed_pages]
    next_index=next((i for i in remaining if i>index),remaining[0] if remaining else None)
    next_page_url=reverse('guided_lesson',args=[assignment.pk,content['key'],next_index+1]) if next_index is not None else reverse('guided_lesson_done',args=[assignment.pk,content['key']])
    if request.user.profile.role!='learner':
        next_page_url=reverse('guided_lesson',args=[assignment.pk,content['key'],index+2]) if index+1<len(content['pages']) else reverse('course',args=[assignment.pk])
    return render(request,'training/guided_lesson.html',{**context,'assignment':assignment,'lesson':content,'page':current,
        'page_number':index+1,'page_count':len(content['pages']),'lesson_number':row['number'],
        'learning_section':section_for(content['key']),
        'writing_feedback':writing,'can_continue':can_continue,
        'response_history':assignment.written_responses.filter(lesson_key=content['key'],page_number=index+1),
        'revision':progress.revision if progress else 0,'draft_pending':form.is_bound,'saved_answer':{} if form.is_bound else saved,'page_complete':complete,'form':form,
        'conflict':conflict,'latest_answer':saved,'draft_text':request.POST.get('reflection','') if conflict else '',
        'saved_choice_label':next((option['label'] for option in current['choices'] if option['value']==saved.get('choice')),'No answer saved'),
        'earlier_credit':row['earlier_credit'],'audio_url':audio,
        'previous_url':reverse('guided_lesson',args=[assignment.pk,content['key'],index]) if index else reverse('learning_stage',args=[assignment.pk,section_for(content['key'])['slug']]),
        'next_url':next_page_url},status=409 if conflict else 200)


@permitted('learner','trainer','admin')
def done(request,pk,lesson_key):
    assignment=own_assignment(request,pk)
    if lesson_key in RETIRED_LESSONS:
        return redirect('guided_lesson',pk=pk,lesson_key=lesson_key,page=1)
    progress,content=lesson_data(assignment,lesson_key)
    context=dashboard_context(assignment)
    if context['recommendation']:
        context['primary_step']={**context['recommendation'], 'detail':context['recommendation']['summary']}
    row=next(r for r in context['journey_rows'] if r['key']==lesson_key)
    if not row['complete']:return redirect('guided_lesson',pk=pk,lesson_key=lesson_key,page=(progress.page_index+1 if progress else 1))
    return render(request,'training/guided_done.html',{**context,'assignment':assignment,'lesson':content,'earlier_credit':row['earlier_credit']})
