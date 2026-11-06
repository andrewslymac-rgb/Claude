from copy import deepcopy
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from .curriculum import LESSONS, lesson_snapshot
from .dashboard import GUIDE, GUIDE_KEY, SECTIONS, dashboard_context
from .models import Assignment, Attempt, LessonProgress, Profile, Review
from .tests import PilotCase


class DashboardTests(PilotCase):
    def url(self): return reverse('course', args=[self.assignment.pk])
    def guide_url(self): return reverse('orientation', args=[self.assignment.pk])
    def review_guide(self):
        return self.client.post(self.guide_url(), {'action': 'reviewed', 'content_version': GUIDE['version']})
    def complete(self, key):
        progress = LessonProgress.objects.create(assignment=self.assignment, lesson_key=key,
            content=lesson_snapshot(key), completed_pages=[0, 1, 2], completed_at=timezone.now())
        from .learning_views import finish_legacy_credit
        finish_legacy_credit(self.assignment, progress)
        return progress

    def test_mapping_exactly_six_existing_lessons_and_all_deep_links_accessible(self):
        self.sign_as()
        context = dashboard_context(self.assignment)
        mapped = [key for section in SECTIONS for key in section['keys']]
        self.assertEqual(len(mapped), len(set(mapped)))
        self.assertEqual(set(mapped), {lesson['key'] for lesson in LESSONS})
        self.assertEqual([section['total'] for section in context['learning_sections']], [1, 2, 1, 2])
        self.assertEqual(context['lesson_count'], 6)
        for section in context['learning_sections']:
            for item in section['items']:
                self.assertEqual(self.client.get(item['url']).status_code, 200)
        self.assertFalse(LessonProgress.objects.exists())
        self.assertContains(self.client.get(self.url()), 'primary-continue', count=1)

    def test_recommendation_follows_sections_with_separate_saved_draft_resume(self):
        draft = LessonProgress.objects.create(assignment=self.assignment, lesson_key='objections',
            content=lesson_snapshot('objections'), page_index=0, answers={'0': {'reflection': 'Saved fictional wording'}})
        self.sign_as()
        context = dashboard_context(self.assignment)
        self.assertEqual(context['recommendation']['key'], 'welcome')
        self.assertEqual(context['resume_draft']['key'], 'objections')
        self.complete('welcome')
        self.assertEqual(dashboard_context(self.assignment)['recommendation']['key'], GUIDE_KEY)
        self.review_guide()
        self.assertEqual(dashboard_context(self.assignment)['recommendation']['key'], 'services')
        self.complete('services'); self.complete('pricing')
        context = dashboard_context(self.assignment)
        self.assertEqual(context['recommendation']['key'], 'objections')
        self.assertIsNone(context['resume_draft'])
        self.assertEqual(context['recommendation']['url'], reverse('guided_lesson', args=[self.assignment.pk, 'objections', 1]))
        draft.refresh_from_db(); self.assertEqual(draft.answers, {'0': {'reflection': 'Saved fictional wording'}})

    def test_orientation_review_idempotent_separate_credit_and_snapshot(self):
        self.sign_as(); self.review_guide()
        saved = LessonProgress.objects.get(lesson_key=GUIDE_KEY)
        before = deepcopy(saved.__dict__)
        self.review_guide(); saved.refresh_from_db()
        self.assertEqual(saved.completed_at, before['completed_at'])
        self.assertEqual(saved.revision, before['revision'])
        self.assertEqual(saved.content, before['content'])
        context = dashboard_context(self.assignment)
        self.assertEqual(context['completed_count'], 0)
        self.assertEqual(context['lesson_count'], 6)
        self.assertTrue(context['orientation_reviewed'])
        with patch.dict(GUIDE, {'title': 'Future guide title', 'version': 'future'}):
            self.assertContains(self.client.get(self.guide_url()), before['content']['title'])
        self.assignment.refresh_from_db(); self.assertIsNone(self.assignment.services_completed_at)

    def test_guide_owner_permissions_csrf_and_version_guard(self):
        other = get_user_model().objects.create_user(username='dashboard-other')
        Profile.objects.create(user=other, role='learner')
        self.sign_as(other)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(self.client.get(self.guide_url()).status_code, 403)
        self.assertEqual(self.review_guide().status_code, 403)
        for user in (self.trainer, self.admin):
            self.sign_as(user)
            self.assertEqual(self.client.get(self.guide_url()).status_code, 200)
            self.assertEqual(self.review_guide().status_code, 403)
        self.sign_as()
        self.assertEqual(self.client.post(self.guide_url(), {'action': 'reviewed', 'content_version': 'old'}).status_code, 400)
        secure = Client(enforce_csrf_checks=True); secure.force_login(self.learner)
        self.assertEqual(secure.post(self.guide_url(), {'action': 'reviewed', 'content_version': GUIDE['version']}).status_code, 403)
        self.assertFalse(LessonProgress.objects.exists())

    def test_completed_lessons_keep_credit_and_recommend_guide_then_practice(self):
        self.sign_as()
        for lesson in LESSONS: self.complete(lesson['key'])
        context = dashboard_context(self.assignment)
        self.assertEqual(context['completed_count'], 6)
        self.assertEqual(context['recommendation']['key'], GUIDE_KEY)
        self.review_guide()
        context = dashboard_context(self.assignment)
        self.assertIsNone(context['recommendation'])
        response = self.client.get(self.url())
        self.assertContains(response, '6 of 6 lessons complete')
        self.assertContains(response, 'Start role-playing')
        self.assertContains(response, 'separate from your manager')
        self.assertFalse(self.assignment.readiness_reviews.exists())

    def test_lesson_completion_uses_new_order_and_breadcrumb_links_back(self):
        self.sign_as()
        for key in ('welcome', 'services', 'pricing'): self.complete(key)
        self.review_guide()
        response = self.client.get(reverse('guided_lesson_done', args=[self.assignment.pk, 'pricing']))
        self.assertEqual(response.context['recommendation']['key'], 'objections')
        response = self.client.get(reverse('guided_lesson', args=[self.assignment.pk, 'conversation', 2]))
        self.assertContains(response, reverse('learning_stage',args=[self.assignment.pk,'role-playing']))
        self.assertContains(response, 'Step 2 of 3')
        self.assertContains(self.client.get(reverse('services', args=[self.assignment.pk])), self.guide_url())

    def test_progress_counts_actual_reviews_and_does_not_include_other_courses(self):
        Attempt.objects.create(assignment=self.assignment, status='submitted')
        reviewed = Attempt.objects.create(assignment=self.assignment, status='reviewed')
        Review.objects.create(attempt=reviewed, reviewer=self.trainer, decision='retry', coaching='Ask a clear closing question.')
        context = dashboard_context(self.assignment)
        self.assertEqual((context['practice_saved'], context['practice_submitted'], context['practice_reviewed']), (2, 1, 1))
        self.sign_as(self.trainer)
        self.assertTemplateUsed(self.client.get(reverse('home')), 'training/home.html')

    def test_old_snapshots_and_legacy_completion_unchanged_by_navigation(self):
        old = lesson_snapshot('welcome'); old['version'] = 'old'; old['title'] = 'Preserved introduction'
        progress = LessonProgress.objects.create(assignment=self.assignment, lesson_key='welcome', content=old,
            answers={'2': {'reflection': 'Original answer'}}, page_index=2)
        stamp = timezone.now()
        Assignment.objects.filter(pk=self.assignment.pk).update(services_completed_at=stamp)
        self.sign_as()
        response = self.client.get(self.url())
        self.assertContains(response, 'Preserved introduction')
        self.assertContains(response, '1 of 6 lessons complete')
        self.client.get(self.guide_url())
        progress.refresh_from_db(); self.assignment.refresh_from_db()
        self.assertEqual(progress.content, old)
        self.assertEqual(progress.answers, {'2': {'reflection': 'Original answer'}})
        self.assertEqual(self.assignment.services_completed_at, stamp)
        self.assertEqual(LessonProgress.objects.count(), 1)
