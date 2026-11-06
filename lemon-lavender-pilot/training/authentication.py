import hashlib
import secrets
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from .models import MagicLink
from .providers import PreviewEmail

DEMO_EMAILS = ('learner@example.invalid', 'trainer@example.invalid', 'admin@example.invalid')


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def issue_link(user):
    if not user.is_active or not user.profile.invited or user.email not in DEMO_EMAILS:
        return None
    now = timezone.now()
    with transaction.atomic():
        # Serialize issuance per user under Postgres; SQLite serializes writes.
        type(user).objects.select_for_update().get(pk=user.pk)
        if MagicLink.objects.filter(user=user, created_at__gt=now - timedelta(minutes=15)).count() >= 5:
            return None
        token = secrets.token_urlsafe(32)
        preview = PreviewEmail().deliver_link(user.email, token)
        MagicLink.objects.create(user=user, digest=digest(token), expires_at=now + timedelta(minutes=10))
        return preview


def consume_link(token):
    if not token or len(token) > 128:
        return None
    now = timezone.now()
    with transaction.atomic():
        link = MagicLink.objects.select_related('user__profile').filter(digest=digest(token),
            used_at__isnull=True, expires_at__gt=now, user__is_active=True, user__profile__invited=True).first()
        if not link:
            return None
        # Atomic compare-and-set prevents double consumption, even without a row lock.
        changed = MagicLink.objects.filter(pk=link.pk, used_at__isnull=True, expires_at__gt=now).update(used_at=now)
        return link.user if changed else None
