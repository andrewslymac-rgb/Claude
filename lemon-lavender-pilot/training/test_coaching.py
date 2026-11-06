from django.urls import reverse
from .coaching import AREAS
from .models import CoachingFocus,ReadinessReview
from .tests import PilotCase

class CoachingTests(PilotCase):
    def url(self):return reverse('coaching',args=[self.assignment.pk])
    def test_manager_focus_idempotent_and_attempt_snapshot_preserved(self):
        self.sign_as(self.trainer)
        data={'action':'focus','behavior':'Ask the customer priority before explaining any price.'}
        self.client.post(self.url(),data);self.client.post(self.url(),data)
        self.assertEqual(CoachingFocus.objects.count(),1)
        attempt=self.prepare();focus=attempt.coaching_focus
        self.sign_as(self.trainer);self.client.post(self.url(),{'action':'focus','behavior':'Ask for a clear next step after resolving the concern.'})
        attempt.refresh_from_db();self.assertEqual(attempt.coaching_focus,focus)
        self.assertEqual(CoachingFocus.objects.filter(active=True).count(),1)
        self.assertContains(self.client.get(self.url()),focus.behavior)
    def test_readiness_requires_evidence_and_keeps_history(self):
        self.sign_as(self.trainer);data={'action':'readiness',**{key:'not_assessed' for key,_ in AREAS}}
        data['knowledge']='demonstrated'
        response=self.client.post(self.url(),data);self.assertContains(response,'Add the evidence');self.assertFalse(ReadinessReview.objects.exists())
        data['knowledge_evidence']='Observed the learner explain required deep and the 30-day reset in lesson 2.'
        self.client.post(self.url(),data);self.client.post(self.url(),data);self.assertEqual(ReadinessReview.objects.count(),1)
        data['knowledge']='practice';self.client.post(self.url(),data);self.assertEqual(ReadinessReview.objects.count(),2)
    def test_learner_can_read_but_not_write_manager_decisions(self):
        self.sign_as();self.assertEqual(self.client.get(self.url()).status_code,200)
        self.assertEqual(self.client.post(self.url(),{'action':'focus','behavior':'A behavior for the next ten calls'}).status_code,403)
        self.assertFalse(CoachingFocus.objects.exists())
    def test_invalid_review_preserves_trainer_writing_and_explains_actual_error(self):
        attempt=self.prepare();self.mutate(attempt,op='submit');self.sign_as(self.trainer)
        response=self.client.post(reverse('review',args=[attempt.pk]),{'decision':'retry','coaching':'Ask one question then wait for the answer.',
            'keep_doing':'The service requirement was clear.','retry_task':'Try the opening again.','observation':'observed','evidence':''})
        self.assertContains(response,'Ask one question then wait for the answer.')
        self.assertContains(response,'Identify the evidence for this observation.')
        self.assertContains(response,'The service requirement was clear.')
        self.assertFalse(hasattr(attempt,'review'))
    def test_readiness_errors_are_visible_without_opening_collapsed_form(self):
        self.sign_as(self.trainer)
        data={'action':'readiness',**{key:'demonstrated' for key,_ in AREAS}}
        response=self.client.post(self.url(),data)
        self.assertContains(response,'<details open><summary>Update readiness observations')
        self.assertFalse(ReadinessReview.objects.exists())
