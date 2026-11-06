"""Private, bounded local WAV storage. No speech recognition or scoring provider."""
import hashlib
import os
import struct
from pathlib import Path
from django.conf import settings
from django.db import DatabaseError, transaction
from django.http import FileResponse, Http404, HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_POST, require_safe
from .audio_response import audio_response, verified_audio
from .models import Attempt, PracticeRecording
from .views import get_attempt, is_expired, permitted

MAX_SECONDS=120
MAX_BYTES=44+48000*MAX_SECONDS*2
MAX_CLIPS=10

def recording_dir():
    path=Path(getattr(settings,'RECORDING_DIR',settings.DATA_DIR/'recordings'))
    path.mkdir(mode=0o700,parents=True,exist_ok=True)
    return path

def validate_wav(data):
    if len(data)<46 or len(data)>MAX_BYTES:raise ValueError('Record between a moment and two minutes.')
    riff,size,wave,fmt,fmt_size,encoding,channels,rate,byte_rate,align,bits,chunk,frames_bytes=struct.unpack('<4sI4s4sIHHIIHH4sI',data[:44])
    if (riff,wave,fmt,fmt_size,encoding,channels,bits,chunk)!=(b'RIFF',b'WAVE',b'fmt ',16,1,1,16,b'data'):
        raise ValueError('Use the local recorder to create a mono PCM WAV clip.')
    if rate not in {8000,16000,22050,24000,44100,48000} or byte_rate!=rate*2 or align!=2 or size!=len(data)-8 or frames_bytes!=len(data)-44 or frames_bytes%2:
        raise ValueError('Invalid WAV lengths or sample format.')
    frames=frames_bytes//2
    if not 0<frames<=rate*MAX_SECONDS:raise ValueError('Clips must be no longer than two minutes.')
    return frames,rate

@require_POST
@permitted('learner')
def save(request,pk):
    get_attempt(request,pk,edit=True)
    try:length=int(request.META.get('CONTENT_LENGTH','0'))
    except ValueError:return HttpResponseBadRequest('Invalid upload size.')
    if length>MAX_BYTES+32768:return HttpResponse('Clip exceeds the local recording limit.',status=413)
    upload=request.FILES.get('recording')
    if not upload or upload.size>MAX_BYTES:return HttpResponseBadRequest('Choose a valid recording from this page.')
    data=upload.read(MAX_BYTES+1)
    try:frames,rate=validate_wav(data)
    except (ValueError,struct.error) as exc:return HttpResponseBadRequest(str(exc))
    label=request.POST.get('label','Practice response').strip()
    if not label or len(label)>100:return HttpResponseBadRequest('Give this clip a short label (up to 100 characters).')
    checksum=hashlib.sha256(data).hexdigest()
    path=None
    owns_file=False
    try:
        with transaction.atomic():
            attempt=Attempt.objects.select_for_update().get(pk=pk)
            # Idempotent retry can acknowledge an already saved clip even after submission.
            existing=attempt.recordings.filter(sha256=checksum).first()
            if existing:
                try:
                    stream, _ = verified_audio(recording_dir()/(str(existing.pk)+'.wav'), existing.sha256, 44+2*existing.frames)
                    stream.close()
                except Http404:
                    return HttpResponse('The earlier recording file is unavailable. Keep your preview and ask your trainer to check local storage.',status=503)
                return JsonResponse({'saved':True,'recording_id':str(existing.pk),'duplicate':True})
            if attempt.status!='active' or is_expired(attempt):return HttpResponse('This attempt is closed. Its saved recordings are preserved.',status=409)
            if attempt.recordings.count()>=MAX_CLIPS:return HttpResponse('Ten clips are already saved for this attempt.',status=429)
            record=PracticeRecording(attempt=attempt,label=label,sha256=checksum,frames=frames,sample_rate=rate)
            path=recording_dir()/(str(record.pk)+'.wav')
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            owns_file=True
            with os.fdopen(fd,'wb') as output:output.write(data)
            record.save()
    except Exception as error:
        if owns_file and path:
            try:path.unlink(missing_ok=True)
            except OSError:pass
        if isinstance(error,(OSError,DatabaseError)):
            return HttpResponse('Local storage could not save this recording. Keep the preview and retry after the storage issue is resolved.',status=503)
        raise
    return JsonResponse({'saved':True,'recording_id':str(record.pk),'duplicate':False},status=201)

@require_safe
@permitted('learner','trainer','admin')
def play(request,pk):
    record=get_object_or_404(PracticeRecording,pk=pk)
    get_attempt(request,record.attempt_id)
    path=recording_dir()/(str(record.pk)+'.wav')
    return audio_response(request,path,'response',expected_sha256=record.sha256,expected_size=44+2*record.frames)
