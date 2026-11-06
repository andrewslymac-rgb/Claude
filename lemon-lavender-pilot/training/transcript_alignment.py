"""Human-confirmed replay anchors. Never derive output timing from captions."""
from decimal import Decimal
from django import forms
from django.db import transaction
from django.http import HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_POST
from .models import Attempt, LiveCall, TranscriptAnchor
from .views import permitted, get_attempt
from .combined_audio import combined_status
from .live_runtime import audio_directory


class AlignmentForm(forms.Form):
    turn_id = forms.ChoiceField(label='Spoken transcript entry')
    start_seconds = forms.DecimalField(min_value=0,max_value=300,decimal_places=3,label='Audio start (seconds)')
    end_seconds = forms.DecimalField(min_value=0,max_value=300,decimal_places=3,label='Audio end (seconds)')
    confidence = forms.ChoiceField(choices=TranscriptAnchor._meta.get_field('confidence').choices)
    recording_sha256 = forms.CharField(widget=forms.HiddenInput, min_length=64,max_length=64)
    listened = forms.BooleanField(label='I listened to this interval and checked it against the selected transcript entry.')

    def __init__(self,*args,attempt,combined,**kwargs):
        super().__init__(*args,**kwargs)
        self.combined=combined
        self.fields['turn_id'].choices=[(t['id'],f"{t['id']} · {t['speaker']} · {t['text'][:65]}")
                                      for t in attempt.transcript if t.get('speaker') in {'Learner','Customer'}]
        self.fields['recording_sha256'].initial=combined['sha256']

    def clean(self):
        value=super().clean()
        start,end=value.get('start_seconds'),value.get('end_seconds')
        if start is not None and end is not None:
            if start>=end or end>Decimal(str(self.combined['seconds'])):
                raise forms.ValidationError('Choose a nonempty interval within the rendered recording.')
            value['start_frame']=round(start*24000); value['end_frame']=round(end*24000)
        if value.get('recording_sha256')!=self.combined['sha256']:
            raise forms.ValidationError('The recording changed. Reload and listen again.')
        return value


def review_context(attempt,combined):
    if not combined or combined['quality']!='browser_render':
        return {'aligned_turns':attempt.transcript}
    anchors={a.turn_id:a for a in attempt.transcript_anchors.filter(recording_sha256=combined['sha256']).order_by('pk')}
    return {'aligned_turns':[{**t,'anchor':anchors.get(t['id'])} for t in attempt.transcript],
            'alignment_form':AlignmentForm(attempt=attempt,combined=combined)}


@require_POST
@permitted('trainer','admin')
def save(request,pk):
    attempt=get_attempt(request,pk)
    call=get_object_or_404(LiveCall,pk=pk,state__in=['closed','failed'])
    combined=combined_status(audio_directory(pk),call.evidence)
    if not combined or combined['quality']!='browser_render':
        return HttpResponseBadRequest('This call has no complete rendered timeline. Original tracks remain separate.')
    form=AlignmentForm(request.POST,attempt=attempt,combined=combined)
    if not form.is_valid():
        from .live_views import render_detail
        return render_detail(request,pk,status=400,alignment_form=form)
    clean=form.cleaned_data
    values={k:clean[k] for k in ['turn_id','start_frame','end_frame','recording_sha256','confidence']}
    with transaction.atomic():
        Attempt.objects.select_for_update().get(pk=pk)
        previous=attempt.transcript_anchors.filter(turn_id=clean['turn_id']).order_by('-revision').first()
        if not previous or any(getattr(previous,k)!=v for k,v in values.items()):
            if attempt.transcript_anchors.count()>=500:
                return HttpResponseBadRequest('Alignment history limit reached.')
            TranscriptAnchor.objects.create(attempt=attempt,reviewer=request.user,
                revision=previous.revision+1 if previous else 1,**values)
    return redirect('live_detail',pk=pk)
