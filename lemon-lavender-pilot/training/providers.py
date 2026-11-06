"""Provider seams. This module has no network clients, microphones, or mail transport."""
from typing import Protocol
from django.conf import settings


class VoiceProvider(Protocol):
    def audio_url(self, clip: str, version: str = 'legacy') -> str | None: ...


class EmailProvider(Protocol):
    def deliver_link(self, recipient: str, token: str) -> dict: ...


class ProviderDisabled(RuntimeError):
    pass


class LocalVoice:
    def audio_path(self, clip, version='legacy'):
        from pathlib import Path
        from .actor import CLIPS
        if clip not in CLIPS or version not in {'legacy','samantha-v2','samantha-v3'}:
            raise ProviderDisabled('Unknown local recording.')
        folder = settings.BASE_DIR / 'training' / 'static' / 'training' / 'audio'
        return folder / (clip + '.wav') if version == 'legacy' else folder / version / (clip + '.wav')

    def audio_url(self, clip, version='legacy'):
        if settings.VOICE_PROVIDER != 'local-scripted' or settings.PROVIDER_SPEND_LIMIT_CENTS != 0:
            raise ProviderDisabled('Only zero-cost local fixtures are implemented.')
        path = self.audio_path(clip, version)
        prefix = '/static/training/audio/' + (version + '/' if version != 'legacy' else '')
        return prefix + clip + '.wav' if path.is_file() else None


class PreviewEmail:
    def deliver_link(self, recipient, token):
        if settings.EMAIL_PROVIDER != 'local-preview' or settings.PROVIDER_SPEND_LIMIT_CENTS != 0:
            raise ProviderDisabled('Email provider is off.')
        if not recipient.endswith('@example.invalid'):
            raise ProviderDisabled('Only reserved fictional recipients are permitted.')
        return {'recipient': recipient, 'url': '/magic/#' + token,
                'label': 'Local email preview — no message was sent.'}
