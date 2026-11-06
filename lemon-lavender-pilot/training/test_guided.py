from copy import deepcopy
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from .curriculum import LESSONS, RETIRED_LESSONS
from .written_examples import EXAMPLES
from .models import LessonProgress, Profile
from .tests import PilotCase

class GuidedTests(PilotCase):
    def url(self,key='welcome',page=1):return reverse('guided_lesson',args=[self.assignment.pk,key,page])
    def post(self,key,page,action,**data):
        progress=LessonProgress.objects.filter(assignment=self.assignment,lesson_key=key).first()
        content=progress.content if progress else next(item for item in LESSONS if item['key']==key)
        return self.client.post(self.url(key,page),{'revision':progress.revision if progress else 0,'content_version':content['version'],'action':action,
            'reflection':EXAMPLES.get((key,page-1),[''])[0],**data})
    def test_single_continue_readonly_get_and_legacy_credit_preserved(self):
        self.sign_as()
        response=self.client.get(reverse('home'))
        self.assertRedirects(response,reverse('course',args=[self.assignment.pk]))
        response=self.client.get(reverse('course',args=[self.assignment.pk]))
        self.assertContains(response,'primary-continue',count=1)
        self.client.get(self.url());self.assertFalse(LessonProgress.objects.exists())
        stamp=timezone.now();self.assignment.welcome_completed_at=stamp;self.assignment.save()
        response=self.client.get(reverse('course',args=[self.assignment.pk]))
        self.assertContains(response,'1 of 6 lessons complete')
        self.assignment.refresh_from_db();self.assertEqual(self.assignment.welcome_completed_at,stamp)
    def test_draft_resume_wrong_answer_and_stale_tab_preserve_evidence(self):
        self.sign_as()
        self.post('welcome',3,'save',reflection='My own saved company introduction, using only the confirmed facts.')
        response=self.client.get(reverse('course',args=[self.assignment.pk]))
        self.assertContains(response,self.url('welcome',3))
        progress=LessonProgress.objects.get();before=deepcopy(progress.answers)
        self.client.post(self.url('welcome',3),{'revision':0,'action':'save','reflection':'A stale tab must not overwrite this draft.'})
        progress.refresh_from_db();self.assertEqual(progress.answers,before)
        response=self.client.get(self.url('welcome',3));self.assertContains(response,'My own saved company introduction')
        self.post('welcome',1,'check',choice='2')
        self.post('welcome',1,'continue');progress.refresh_from_db();self.assertEqual(progress.completed_pages,[])
    def test_all_18_steps_complete_repeat_and_back_do_not_duplicate(self):
        self.sign_as()
        for lesson in LESSONS:
            for i,page in enumerate(lesson['pages'],1):
                self.assertEqual(self.client.get(self.url(lesson['key'],i)).status_code,200)
                response=self.post(lesson['key'],i,'check',choice=page['correct'],reflection=EXAMPLES.get((lesson['key'],i-1),[''])[0])
                self.assertEqual(response.status_code,302)
                response=self.post(lesson['key'],i,'continue')
                self.assertEqual(response.status_code,302)
            progress=LessonProgress.objects.get(lesson_key=lesson['key']);stamp=progress.completed_at;answers=deepcopy(progress.answers)
            self.assertIsNotNone(stamp)
            self.post(lesson['key'],1,'check',choice='2',reflection='Changed text must not erase the evidence of a completed check.')
            progress.refresh_from_db();self.assertEqual(progress.completed_at,stamp)
            if lesson['pages'][0].get('reflection'):
                self.assertTrue(self.assignment.written_responses.filter(lesson_key=lesson['key'],answer__reflection=answers['0']['reflection']).exists())
            else:self.assertEqual(progress.answers,answers)
            self.assertEqual(self.client.get(reverse('guided_lesson_done',args=[self.assignment.pk,lesson['key']])).status_code,200)
        self.assertContains(self.client.get(reverse('course',args=[self.assignment.pk])),'6 of 6 lessons complete')
        self.assertEqual(LessonProgress.objects.count(),6)
    def test_snapshot_immutable_after_content_change(self):
        self.sign_as();self.post('welcome',1,'check',choice=LESSONS[0]['pages'][0]['correct'])
        p=LessonProgress.objects.get();snapshot=deepcopy(p.content)
        from unittest.mock import patch
        with patch.dict(LESSONS[0],{'title':'Future title'}):
            response=self.client.get(self.url());self.assertContains(response,snapshot['title'])
        p.refresh_from_db();self.assertEqual(p.content,snapshot)
    def test_other_learner_denied_and_staff_read_only(self):
        other=get_user_model().objects.create_user(username='other-guided');Profile.objects.create(user=other,role='learner')
        self.sign_as(other);self.assertEqual(self.client.get(self.url()).status_code,403)
        self.sign_as(self.trainer);self.assertEqual(self.client.get(self.url()).status_code,200)
        self.assertEqual(self.client.post(self.url(),{'action':'save','revision':0}).status_code,403)
        self.assertFalse(LessonProgress.objects.exists())
    def test_incomplete_cannot_claim_done_and_invalid_page_404(self):
        self.sign_as()
        self.assertRedirects(self.client.get(reverse('guided_lesson_done',args=[self.assignment.pk,'welcome'])),self.url())
        self.assertEqual(self.client.get(self.url(page=99)).status_code,404)
    def test_focused_exercise_out_of_order_returns_to_unfinished_steps(self):
        self.sign_as();lesson=LESSONS[4]
        for i in [2,3]:
            self.post(lesson['key'],i,'check',choice=lesson['pages'][i-1]['correct'])
            response=self.post(lesson['key'],i,'continue')
        self.assertRedirects(response,self.url(lesson['key'],1))
        p=LessonProgress.objects.get();self.assertIsNone(p.completed_at);self.assertEqual(p.page_index,0)
        response=self.client.get(self.url(lesson['key'],3));self.assertContains(response,self.url(lesson['key'],1))
        self.post(lesson['key'],1,'check',choice=lesson['pages'][0]['correct'])
        self.post(lesson['key'],1,'continue');p.refresh_from_db();self.assertIsNotNone(p.completed_at)
    def test_stale_tab_retains_draft_and_does_not_overwrite_saved_answer(self):
        self.sign_as();self.post('welcome',3,'save',reflection='The newer tab has a useful company introduction saved here.')
        p=LessonProgress.objects.get();saved=deepcopy(p.answers);revision=p.revision
        response=self.client.post(self.url('welcome',3),{'revision':0,'content_version':p.content['version'],'action':'save',
            'reflection':'My stale-tab introduction should still be available for me to recover.'})
        self.assertContains(response,'My stale-tab introduction',status_code=409)
        self.assertContains(response,'The newer tab has a useful company introduction',status_code=409)
        p.refresh_from_db();self.assertEqual(p.answers,saved);self.assertEqual(p.revision,revision)
        self.assertContains(response,'name="revision" value="'+str(revision)+'"',status_code=409)
    def test_old_unsaved_lesson_version_cannot_be_graded_as_new_content(self):
        self.sign_as()
        response=self.client.post(self.url('welcome',3),{'revision':0,'content_version':'guided-foundations-2026-10-07-v1',
            'action':'check','choice':'0','reflection':'This was written from a previous version in an already open tab.'})
        self.assertContains(response,'lesson version changed',status_code=409)
        self.assertContains(response,'already open tab',status_code=409)
        self.assertFalse(LessonProgress.objects.exists())
    def test_saved_older_snapshot_remains_usable_and_unmodified(self):
        self.sign_as();old=deepcopy(LESSONS[0]);old['version']='saved-older-version';old['pages'][2]['reflection']='Earlier company introduction task'
        p=LessonProgress.objects.create(assignment=self.assignment,lesson_key='welcome',content=old)
        response=self.post('welcome',3,'check',choice=old['pages'][2]['correct'])
        self.assertEqual(response.status_code,302);p.refresh_from_db();self.assertEqual(p.content,old)
        self.assertTrue(p.answers['2']['correct'])
    def test_trainer_can_review_retired_written_history_read_only(self):
        p=LessonProgress.objects.create(assignment=self.assignment,lesson_key='complaints',content=deepcopy(RETIRED_LESSONS['complaints']),
            answers={'0':{'reflection':'I would acknowledge the missed bathroom area and document the refund request for the manager.','choice':'1','correct':True}})
        self.sign_as(self.trainer)
        response=self.client.get(self.url('complaints',1))
        self.assertContains(response,'document the refund request for the manager')
        self.assertContains(response,'RETIRED CONTENT')
        response=self.client.get(reverse('coaching',args=[self.assignment.pk]))
        self.assertContains(response,'Retired content')
        self.assertContains(response,self.url('complaints',1))
        self.assertIsNone(LessonProgress.objects.get().completed_at)
