from decimal import Decimal
import wave
from django.conf import settings
from django.db.models import Sum, Count
from django.utils import timezone
from .models import Attempt, BudgetSettings, FollowupAttempt, UsageEntry, OperatingCost


def budget():
    return BudgetSettings.objects.filter(pk=1).first() or BudgetSettings(
        max_attempts_per_day=settings.MAX_ATTEMPTS_PER_DAY, max_minutes=settings.MAX_ATTEMPT_MINUTES,
        max_turns=settings.MAX_TURNS)


def limits():
    config = budget()
    return {'minutes': config.max_minutes, 'turns': config.max_turns, 'daily_attempts': config.max_attempts_per_day}


def attempts_today(user):
    filters = {'assignment__learner': user, 'started_at__date': timezone.localdate()}
    return Attempt.objects.filter(**filters).count() + FollowupAttempt.objects.filter(**filters).count()


def record_usage(attempt, activity, clip=None):
    duration = Decimal(0)
    version = attempt.scenario.get('audio_version','legacy')
    if clip:
        from .providers import LocalVoice
        path = LocalVoice().audio_path(clip, version)
        if path.exists():
            with wave.open(str(path), 'rb') as stream:
                duration = Decimal(stream.getnframes()) / Decimal(stream.getframerate())
    UsageEntry.objects.get_or_create(event_key=f'{attempt.pk}:{attempt.revision}:{activity}', defaults={
        'attempt': attempt, 'user_id': attempt.assignment.learner_id, 'activity': activity,
        'voice_seconds': duration, 'reported_cents': 0,
        'model': 'll-branching-v1' if attempt.scenario.get('mode')=='scenario_rehearsal' else ('deterministic-observations-v1' if activity == 'grading' else ('macOS-Samantha-fixture' if version == 'legacy' else 'macOS-Samantha-prerecorded-'+version.rsplit('-',1)[-1]))})


def money(cents):
    return (Decimal(cents or 0) / 100).quantize(Decimal('.01'))


def summarize(now=None):
    now = now or timezone.now()
    month = now.date().replace(day=1)
    month_entries = UsageEntry.objects.filter(recorded_at__year=now.year, recorded_at__month=now.month)
    daily = month_entries.filter(recorded_at__date=now.date())
    live = month_entries.filter(synthetic=False)
    reported = live.aggregate(value=Sum('reported_cents'))['value'] or Decimal(0)
    estimated = live.aggregate(value=Sum('estimated_cents'))['value'] or Decimal(0)
    daily_live = daily.filter(synthetic=False)
    operating = OperatingCost.objects.filter(month=month).aggregate(value=Sum('cents'))['value'] or 0
    config = budget()
    basis = max(reported, estimated)
    alert = basis >= Decimal(config.monthly_target_cents) * Decimal(config.alert_percent) / 100
    breakdown = {'events': Count('pk'), 'voice_seconds': Sum('voice_seconds'),
                 'input_tokens': Sum('input_tokens'), 'output_tokens': Sum('output_tokens'),
                 'estimate': Sum('estimated_cents'), 'reported': Sum('reported_cents')}
    return {'month': month, 'budget': config, 'target_dollars': money(config.monthly_target_cents),
        'month_estimate': money(estimated), 'month_reported': money(reported),
        'day_estimate': money(daily_live.aggregate(value=Sum('estimated_cents'))['value']),
        'day_reported': money(daily_live.aggregate(value=Sum('reported_cents'))['value']),
        'unreported': live.filter(reported_cents__isnull=True).count(),
        'operating_dollars': money(operating), 'alert': alert,
        'fixture_minutes': ((month_entries.filter(synthetic=True).aggregate(value=Sum('voice_seconds'))['value'] or Decimal(0)) / 60).quantize(Decimal('.01')),
        'day_events': daily.count(), 'month_events': month_entries.count(),
        'entries': month_entries.select_related('user').order_by('-recorded_at')[:100],
        'by_employee': month_entries.values('user__first_name', 'synthetic').annotate(**breakdown).order_by('user__first_name'),
        'by_session': month_entries.values('attempt_id', 'user__first_name', 'synthetic').annotate(**breakdown).order_by('attempt_id'),
        'operating': OperatingCost.objects.filter(month=month).select_related('entered_by').order_by('-created_at')}
