"""Authenticated callers only. Single byte ranges allow native audio seeking."""
import os
import hashlib
import re
import stat
from django.http import FileResponse, Http404, HttpResponse


class LimitedAudio:
    def __init__(self, stream, length):
        self.stream, self.remaining = stream, length

    def read(self, size):
        data = self.stream.read(min(size, self.remaining))
        self.remaining -= len(data)
        return data

    def close(self):
        self.stream.close()


def verified_audio(path, expected_sha256=None, expected_size=None):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        raise Http404 from None
    stream = os.fdopen(fd, 'rb')
    info = os.fstat(stream.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_size > 32_000_000:
        stream.close(); raise Http404
    if expected_size is not None and info.st_size != expected_size:
        stream.close(); raise Http404
    if expected_sha256 and hashlib.file_digest(stream, 'sha256').hexdigest() != expected_sha256:
        stream.close(); raise Http404
    stream.seek(0)
    return stream, info.st_size


def audio_response(request, path, name, *, expected_sha256=None, expected_size=None):
    stream, size = verified_audio(path, expected_sha256, expected_size)
    start, end, status = 0, size - 1, 200
    requested = request.headers.get('Range')
    if requested:
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
        try:
            if not match or not any(match.groups()):
                raise ValueError
            left, right = match.groups()
            if left:
                start = int(left)
                end = min(int(right), size - 1) if right else size - 1
            else:
                suffix = int(right)
                if suffix == 0:
                    raise ValueError
                start = max(0, size - suffix)
            if not 0 <= start <= end < size:
                raise ValueError
            status = 206
        except ValueError:
            stream.close()
            response = HttpResponse(status=416)
            response['Content-Range'] = f'bytes */{size}'
            response['Accept-Ranges'] = 'bytes'
            return response
    length = end - start + 1
    if request.method == 'HEAD':
        stream.close()
        response = HttpResponse(content_type='audio/wav', status=status)
    else:
        stream.seek(start)
        response = FileResponse(LimitedAudio(stream, length), content_type='audio/wav', status=status)
    response['Content-Length'] = str(length)
    response['Accept-Ranges'] = 'bytes'
    if status == 206:
        response['Content-Range'] = f'bytes {start}-{end}/{size}'
    response['Content-Disposition'] = f'inline; filename="{name}-practice.wav"'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
