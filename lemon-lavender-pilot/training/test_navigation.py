from copy import deepcopy
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from .curriculum import LESSONS, lesson_snapshot
from .dashboard import GUIDE, GUIDE_KEY, dashboard_context
from .learning_views import finish_legacy_credit
from .models import Assignment, Attempt, LessonProgress, Profile, Review
from .navigation import login_destination, practice_next
from .tests import PilotCase

class NavigationTests(PilotCase):
    def home_url(self):return reverse('course',args=[self.assignment.pk])
    def all_learning(self):
        for lesson in LESSONS:
            p=LessonProgress.objects.create(assignment=self.assignment,lesson_key=lesson['key'],content=lesson_snapshot(lesson['key']),completed_pages=[0,1,2],completed_at=timezone.now())
            finish_legacy_credit(self.assignment,p)
        LessonProgress.objects.create(assignment=self.assignment,lesson_key=GUIDE_KEY,content=deepcopy(GUIDE),completed_at=timezone.now())
    def test_safe_deep_link_survives_scanner_get_and_login(self):
        target=reverse('guided_lesson',args=[self.assignment.pk,'pricing',2])
        self.client.get(target,follow=True)
        response=self.client.post(reverse('sign_in'),{'email':self.learner.email})
        token=response.context['preview']['url'].split('#')[1]
        self.client.get(reverse('magic'))
        self.assertNotIn('_auth_user_id',self.client.session)
        self.assertRedirects(self.client.post(reverse('magic'),{'token':token}),target)
        self.assertEqual(self.client.post(reverse('magic'),{'token':token}).status_code,400)
        self.assertFalse(LessonProgress.objects.exists())
    def test_redirect_allowlist_rejects_external_encoded_and_mutation_destinations(self):
        unsafe=['https://outside.invalid/','//outside.invalid/','/\\outside.invalid/','/%2foutside.invalid/',
                '/sign-out/','/course/1/start/','/course/1/?next=https://outside.invalid','/course/1/\n','/admin/']
        for target in unsafe:
            self.assertEqual(login_destination(target),'',target)
            self.client.get(reverse('sign_in'),{'next':target});self.assertNotIn('post_login_path',self.client.session)
        self.assertEqual(login_destination('/course/1/stage/industry/'),'/course/1/stage/industry/')
    def test_preserved_deep_link_still_checks_assignment_owner(self):
        other=get_user_model().objects.create_user(username='navigation-other');Profile.objects.create(user=other,role='learner')
        owned=Assignment.objects.create(learner=other,course=self.assignment.course)
        self.sign_as()
        for name,args in [('learning_stage',[owned.pk,'meet']),('guided_lesson',[owned.pk,'welcome',1]),('orientation',[owned.pk])]:
            self.assertEqual(self.client.get(reverse(name,args=args)).status_code,403)
    def test_all_stages_open_without_writing_progress_and_retain_exact_content(self):
        self.sign_as();snapshot=deepcopy(LESSONS)
        for slug in ('meet','industry','objections','role-playing'):
            response=self.client.get(reverse('learning_stage',args=[self.assignment.pk,slug]))
            self.assertContains(response,'primary-continue',count=1)
        self.assertEqual(self.client.get(reverse('learning_stage',args=[self.assignment.pk,'unknown'])).status_code,404)
        self.assertFalse(LessonProgress.objects.exists());self.assertEqual(LESSONS,snapshot)
    def test_home_primary_resumes_later_draft_while_path_order_stays_fixed(self):
        LessonProgress.objects.create(assignment=self.assignment,lesson_key='objections',content=lesson_snapshot('objections'),answers={'0':{'reflection':'My saved response'}},page_index=0)
        context=dashboard_context(self.assignment)
        self.assertEqual(context['primary_step']['key'],'objections')
        self.assertEqual(context['primary_step']['section']['number'],3)
        self.assertEqual([x['slug'] for x in context['learning_sections']],['meet','industry','objections','role-playing'])
    def test_active_call_resumes_before_lessons_without_extending_session(self):
        attempt=self.prepare();start=attempt.started_at
        LessonProgress.objects.create(assignment=self.assignment,lesson_key='pricing',content=lesson_snapshot('pricing'),answers={'0':{'choice':'0'}})
        self.assignment.refresh_from_db();context=dashboard_context(self.assignment)
        self.assertEqual(context['primary_step']['state'],'active')
        self.assertEqual(context['primary_step']['url'],reverse('attempt',args=[attempt.pk]))
        attempt.refresh_from_db();self.assertEqual(attempt.started_at,start)
        self.assertNotContains(self.client.get(reverse('attempt',args=[attempt.pk])),'id="practice-next"')
    def test_orientation_goes_directly_to_next_lesson_and_no_extra_credit(self):
        self.sign_as();url=reverse('orientation',args=[self.assignment.pk])
        data={'action':'reviewed','content_version':GUIDE['version']}
        self.assertRedirects(self.client.post(url,data),reverse('guided_lesson',args=[self.assignment.pk,'services',1]))
        stamp=LessonProgress.objects.get().completed_at;self.client.post(url,data)
        self.assertEqual(LessonProgress.objects.get().completed_at,stamp)
        self.assertEqual(dashboard_context(self.assignment)['completed_count'],0)
    def test_submitted_and_reviewed_practice_have_actionable_next_steps(self):
        self.all_learning();self.sign_as()
        attempt=self.prepare();attempt.status='submitted';attempt.save(update_fields=['status'])
        self.assignment.refresh_from_db()
        self.assertEqual(dashboard_context(self.assignment)['primary_step']['state'],'submitted')
        response=self.client.get(reverse('attempt',args=[attempt.pk]));self.assertContains(response,'Your call is submitted.')
        self.assertNotContains(response,'Try again with this feedback')
        response=self.client.post(reverse('start',args=[self.assignment.pk]))
        self.assertContains(response,'Review submitted practice',status_code=409)
        Review.objects.create(attempt=attempt,reviewer=self.trainer,decision='retry',coaching='Ask for an explicit next step.')
        attempt.status='reviewed';attempt.save(update_fields=['status'])
        self.assertEqual(dashboard_context(self.assignment)['primary_step']['state'],'reviewed')
        response=self.client.get(reverse('attempt',args=[attempt.pk]));self.assertContains(response,'Try again with this feedback')
        self.assertContains(response,'id="manager-feedback"')
        self.assertEqual(self.client.post(reverse('start',args=[self.assignment.pk])).status_code,302)
        self.assertEqual(Attempt.objects.count(),2)
        attempt.refresh_from_db();self.assertEqual(attempt.status,'reviewed')
    def test_expired_state_and_daily_limit_provide_safe_return_without_get_mutation(self):
        attempt=self.prepare();Attempt.objects.filter(pk=attempt.pk).update(started_at=timezone.now()-timedelta(days=1))
        response=self.client.get(reverse('attempt',args=[attempt.pk]))
        self.assertContains(response,'Start a fresh attempt')
        attempt.refresh_from_db();self.assertEqual(attempt.status,'active')
        attempt.status='expired';attempt.save(update_fields=['status'])
        for _ in range(10):Attempt.objects.create(assignment=self.assignment,status='abandoned')
        self.assignment.refresh_from_db();self.assertEqual(practice_next(self.assignment)['state'],'limit')
        response=self.client.post(reverse('start',args=[self.assignment.pk]))
        self.assertContains(response,'Review saved practice',status_code=429)
    def test_all_complete_moves_to_practice_without_automatic_readiness(self):
        self.all_learning();self.sign_as()
        context=dashboard_context(self.assignment)
        self.assertEqual(context['primary_step']['label'],'Start role-playing')
        self.assertEqual(context['primary_step']['url'],reverse('practice_library',args=[self.assignment.pk]))
        self.assertFalse(self.assignment.readiness_reviews.exists())
        self.assertContains(self.client.get(reverse('practice_library',args=[self.assignment.pk])),'Start practice with Taylor')
    def test_trainer_navigation_remains_read_only_and_separate(self):
        self.sign_as(self.trainer)
        self.assertTemplateUsed(self.client.get(reverse('home')),'training/home.html')
        self.assertContains(self.client.get(reverse('learning_stage',args=[self.assignment.pk,'meet'])),'Trainer view')
        self.assertEqual(self.client.post(reverse('orientation',args=[self.assignment.pk]),{'action':'reviewed','content_version':GUIDE['version']}).status_code,403)

    def test_completion_follows_order_even_when_later_draft_exists(self):
        self.sign_as()
        completed=LessonProgress.objects.create(assignment=self.assignment,lesson_key='welcome',content=lesson_snapshot('welcome'),completed_at=timezone.now())
        finish_legacy_credit(self.assignment,completed)
        LessonProgress.objects.create(assignment=self.assignment,lesson_key='objections',content=lesson_snapshot('objections'),answers={'0':{'reflection':'A later draft'}})
        response=self.client.get(reverse('guided_lesson_done',args=[self.assignment.pk,'welcome']))
        self.assertEqual(response.context['primary_step']['key'],GUIDE_KEY)
        self.assertEqual(dashboard_context(self.assignment)['primary_step']['key'],'objections')

    def test_caller_setup_deep_link_only_keeps_valid_choice_parameters(self):
        target='/course/1/scenarios/?persona_id=busy_parent&difficulty=beginner&drill=full'
        self.assertEqual(login_destination(target),target)
        for invalid in [target+'&next=https://outside.invalid',target+'&drill=closing',target.replace('beginner','unknown')]:
            self.assertEqual(login_destination(invalid),'')
        self.client.get(target,follow=True)
        response=self.client.post(reverse('sign_in'),{'email':self.learner.email})
        token=response.context['preview']['url'].split('#')[1]
        self.assertRedirects(self.client.post(reverse('magic'),{'token':token}),target)
