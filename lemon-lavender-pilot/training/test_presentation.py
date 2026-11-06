"""Behavior checks for course navigation and saved-call discovery; no visual snapshots."""
from django.urls import reverse
from .tests import PilotCase
from .models import Course, Assignment, LiveCall, Attempt, Profile
from .microphone_acceptance import ensure_assignment


class NavigationTests(PilotCase):
    def test_technical_mic_assignment_does_not_replace_primary_training(self):
        mic = ensure_assignment()
        self.sign_as()
        self.assertRedirects(self.client.get('/'), reverse('course', args=[self.assignment.pk]))
        response = self.client.get(reverse('practice_library', args=[self.assignment.pk]))
        self.assertContains(response, reverse('live_prepare', args=[mic.pk]))
        self.assertContains(response, 'New live calls are currently disabled.')

    def test_multiple_courses_and_empty_state_remain_learner_views(self):
        self.sign_as()
        course = Course.objects.create(slug='extra', title='Extra assigned lesson', version='v1')
        Assignment.objects.create(learner=self.learner, course=course)
        response = self.client.get('/')
        self.assertContains(response, 'Extra assigned lesson'); self.assertNotContains(response, 'Save assignment')
        Assignment.objects.all().delete()
        response = self.client.get('/')
        self.assertContains(response, 'Your training starts here.'); self.assertNotContains(response, 'Coaching desk')

    def test_voice_history_includes_own_mic_call_without_other_learner_leak(self):
        from django.contrib.auth import get_user_model
        mic = ensure_assignment()
        mine = Attempt.objects.create(assignment=mic, policy={}, scenario={}, rubric={}, limits={})
        LiveCall.objects.create(attempt=mine, state='closed')
        other = get_user_model().objects.create_user('other',email='other@example.invalid')
        Profile.objects.create(user=other, role='learner', invited=True)
        theirs = Assignment.objects.create(learner=other, course=self.assignment.course)
        foreign = Attempt.objects.create(assignment=theirs, policy={}, scenario={}, rubric={}, limits={})
        LiveCall.objects.create(attempt=foreign, state='closed')
        self.sign_as()
        response = self.client.get(reverse('practice_library', args=[self.assignment.pk]))
        self.assertContains(response, str(mine.pk)); self.assertNotContains(response, str(foreign.pk))
        self.sign_as(self.trainer)
        self.assertContains(self.client.get(reverse('practice_library', args=[self.assignment.pk])), str(mine.pk))
