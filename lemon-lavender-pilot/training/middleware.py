from django.http import HttpResponseForbidden


class LocalOnlyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.META.get('REMOTE_ADDR') not in {'127.0.0.1', '::1', None}:
            return HttpResponseForbidden('This synthetic pilot is loopback-only.')
        if request.method == 'POST' and request.path.startswith('/attempt/') and request.path.endswith('/record/'):
            try:
                if int(request.META.get('CONTENT_LENGTH', '0')) > 44 + 48000 * 120 * 2 + 32768:
                    from django.http import HttpResponse
                    return HttpResponse('Clip exceeds the local recording limit.', status=413)
            except ValueError:
                return HttpResponseForbidden('Invalid upload size.')
        response = self.get_response(request)
        response['Cache-Control'] = 'no-store'
        allow_mic = bool(getattr(request, 'resolver_match', None) and
            (request.resolver_match.url_name == 'attempt' or getattr(request, 'live_microphone_allowed', False)) and
            response.status_code == 200 and request.user.is_authenticated and
            getattr(getattr(request.user, 'profile', None), 'role', None) == 'learner')
        response['Permissions-Policy'] = 'camera=(), microphone=' + ('(self)' if allow_mic else '()') + ', display-capture=()'
        response['Content-Security-Policy'] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; "
            "frame-ancestors 'none'; form-action 'self'; base-uri 'none'")
        return response
