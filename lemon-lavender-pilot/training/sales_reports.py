"""Read-only reports and exports from actual saved evidence, never simulated data seeds."""
from collections import Counter, defaultdict
from datetime import timedelta
import json
from django.http import HttpResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET
from .views import permitted, own_assignment, get_attempt
from .learning import journey
from .models import Review


def summary(assignment):
    attempts=list(assignment.attempts.prefetch_related('recordings','usage','review').order_by('started_at'))
    completed=[a for a in attempts if a.status in {'submitted','reviewed'}]
    full=[a for a in completed if a.scenario.get('mode')=='scenario_rehearsal' and a.scenario.get('drill')=='full']
    eligible=[a for a in full if a.policy.get('owner_decisions',{}).get('won_requires')=='paid_deposit']
    def won(item):
        review=getattr(item,'review',None)
        return bool(review and review.simulated_deposit_reference and review.criteria_version)
    groups=defaultdict(lambda:{'attempts':0,'requests':0,'wins':0,'escalations':0,'followups':0})
    objection_groups=defaultdict(lambda:{'attempts':0,'requests':0,'wins':0})
    weak=Counter();days=set();recorded_seconds=0;provider_seconds=0
    for item in attempts:
        for event in item.actions:
            stamp=event.get('at')
            if stamp:
                try:days.add(timezone.datetime.fromisoformat(stamp).date())
                except (ValueError,TypeError):pass
        for recording in item.recordings.all():
            recorded_seconds+=recording.frames/recording.sample_rate;days.add(recording.created_at.date())
        for usage in item.usage.all():
            if not usage.synthetic:provider_seconds+=float(usage.voice_seconds)
    for item in eligible:
        result=item.feedback.get('outcome',{}).get('code')
        row=groups[item.scenario['title']];row['attempts']+=1;row['requests']+=result=='qualified_request';row['wins']+=won(item)
        row['escalations']+=result=='escalation_for_review';row['followups']+=result=='followup_agreed'
        encountered={t.get('objection_id') for t in item.transcript if t.get('result') in
                     {'raise_concern','acknowledge','probe','respond','needs_ack','needs_probe','still_concerned','next_concern'}}-{None}
        labels={c['id']:c['title'] for c in item.scenario['objection_bank']}
        for concern in encountered:
            row=objection_groups[labels.get(concern,concern)];row['attempts']+=1;row['requests']+=result=='qualified_request';row['wins']+=won(item)
    for item in completed:
        for row in item.feedback.get('observations',[]):
            if row.get('status') in {'Needs practice','Partial discovery evidence','Concern still open','Commitment or handoff incomplete','Policy correction required'}:
                weak[row['title']]+=1
    today=timezone.localdate();cursor=today if today in days else today-timedelta(days=1);streak=0
    while cursor in days:streak+=1;cursor-=timedelta(days=1)
    def rows(data):
        return [{'title':title,**row,'rate':round(100*row['wins']/row['attempts'])} for title,row in sorted(data.items())]
    def period(items,label):
        wins=sum(won(a) for a in items)
        requests=sum(a.feedback.get('outcome',{}).get('code')=='qualified_request' for a in items)
        return {'label':label,'count':len(items),'requests':requests,'wins':wins,'rate':round(100*wins/len(items)) if items else None}
    return {'attempts':attempts[::-1],'completed':len(completed),'full_calls':len(eligible),'legacy_full_calls':len(full)-len(eligible),
        'by_persona':rows(groups),'by_objection':rows(objection_groups),'weak_skills':[{'title':k,'count':v} for k,v in weak.most_common()],
        'periods':[period(eligible[-10:],'Most recent 10 full rehearsals'),period(eligible[-20:-10],'Previous 10 full rehearsals')],
        'streak':streak,'active_days':len(days),'recorded_seconds':round(recorded_seconds,1),'provider_seconds':round(provider_seconds,1),
        'reviewed':sum(a.status=='reviewed' for a in attempts)}


def progression(assignment):
    path=journey(assignment);done={r['key'] for r in path['journey_rows'] if r['complete']}
    from .dashboard import SECTIONS
    definitions=[(section['title'],section['keys'],section['purpose']) for section in SECTIONS]
    return [{'title':title,'evidence':f'{sum(k in done for k in keys)} of {len(keys)} linked lessons worked through' if keys else 'Trainer-led practice recommendation',
             'goal':goal,'links':[r for r in path['journey_rows'] if r['key'] in keys]} for title,keys,goal in definitions]


@require_GET
@permitted('learner','trainer','admin')
def report(request,pk):
    assignment=own_assignment(request,pk)
    return render(request,'training/sales_report.html',{'assignment':assignment,'report':summary(assignment),'stages':progression(assignment)})


@require_GET
@permitted('learner','trainer','admin')
def export(request,pk):
    attempt=get_attempt(request,pk)
    if attempt.status=='active':return HttpResponse('End or submit the attempt before exporting its evidence.',status=409)
    review=Review.objects.filter(attempt=attempt).first()
    payload={'format':'ll-practice-evidence-v1','attempt_id':str(attempt.pk),'status':attempt.status,
        'started_at':attempt.started_at.isoformat(),'submitted_at':attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        'policy_version':attempt.policy.get('version'),'scenario':attempt.scenario,'rubric':attempt.rubric,
        'transcript':attempt.transcript,'notes':attempt.crm,'actions':attempt.actions,'feedback':attempt.feedback,
        'review':{key:getattr(review,key) for key in ['decision','coaching','keep_doing','retry_task','observation','evidence','override_reason','criteria_version','objection_evidence','simulated_deposit_reference','policy_flag_assessment']} if review else None,
        'recordings':[{'id':str(r.pk),'label':r.label,'seconds':r.seconds,
                      'download_path':reverse('recording_download',args=[r.pk])} for r in attempt.recordings.all()],
        'limits':'Fictional practice; no actual sale, booking, payment or automated employment decision.'}
    if hasattr(attempt,'live_call'):
        payload['live_recordings']={track:reverse('live_audio_download',args=[attempt.pk,track]) for track in ['learner','customer']}
        payload['input_kind']='prerecorded synthetic trainee' if attempt.live_call.synthetic_test else 'human microphone, fictional practice'
        payload['transcript_alignment_history']=[{k:getattr(a,k) for k in
            ['turn_id','revision','start_frame','end_frame','recording_sha256','confidence','source']}
            for a in attempt.transcript_anchors.all()]
    response=HttpResponse(json.dumps(payload,ensure_ascii=False,indent=2),content_type='application/json')
    response['Content-Disposition']=f'attachment; filename="ll-practice-{attempt.pk}.json"'
    response['Cache-Control']='private, no-store'
    return response


@require_GET
@permitted('learner','trainer','admin')
def recording_download(request,pk):
    from .recordings import play
    response=play(request,pk)
    if response.status_code in {200,206}:response['Content-Disposition']=f'attachment; filename="ll-recording-{pk}.wav"'
    return response


@require_GET
@permitted('learner','trainer','admin')
def live_audio_download(request,pk,track):
    from .live_views import audio
    response=audio(request,pk,track)
    if response.status_code in {200,206}:response['Content-Disposition']=f'attachment; filename="ll-call-{pk}-{track}.wav"'
    return response
