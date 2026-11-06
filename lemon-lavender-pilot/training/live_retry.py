"""A reviewed technical retry preserves evidence and never makes a readiness decision."""
from django.db import transaction
from django.utils import timezone
from .live_budget import BudgetDenied
from .models import Attempt, LiveCall, Review


def prepare_silent_fixture_retry(budget, attempt_id, authorization):
    resumed = False
    try:
        with transaction.atomic():
            attempt = Attempt.objects.select_for_update().get(pk=attempt_id)
            call = LiveCall.objects.select_for_update().get(pk=attempt_id)
            finding = call.evidence.get('post_test_verification', {})
            if (attempt.status != 'submitted' or not attempt.scenario.get('synthetic_test') or
                    finding.get('technical_issue') != 'silent_prerecorded_fixture' or
                    call.state != 'closed' or call.usage.get('final_confirmed') is not True or
                    call.usage.get('grading') is not None or
                    any(t.get('speaker') == 'Learner' for t in attempt.transcript) or
                    Review.objects.filter(attempt=attempt).exists()):
                raise BudgetDenied('This attempt is not the verified silent-fixture technical failure.')
            prior = budget.summary()
            record = prior['calls'].get(str(attempt.pk), {})
            if str(record.get('reported_seconds')) != str(call.usage.get('voice_seconds')):
                raise BudgetDenied('The saved provider duration and ledger do not agree.')
            budget.resume_finalized(authorization, str(attempt.pk))
            resumed = True
            finding['technical_retry'] = {
                'at': timezone.now().isoformat(), 'authorization': authorization,
                'prior_status': attempt.status, 'new_status': 'abandoned',
                'reason': 'Technical test ended without trainee speech; preserve all evidence and allow the remaining authorized start.',
                'manager_readiness_assessed': False,
            }
            call.evidence['post_test_verification'] = finding
            call.save(update_fields=['evidence'])
            attempt.status = 'abandoned'
            attempt.save(update_fields=['status'])
    except Exception:
        if resumed:
            budget.close()
        raise
