from datetime import datetime
from zoneinfo import ZoneInfo
from django.test import SimpleTestCase
from .curriculum import LESSON_BY_KEY, LESSONS
from .policies import quote

class CurriculumCoverageTests(SimpleTestCase):
    def test_worked_quotes_match_company_engine(self):
        self.assertEqual(quote('deep',2750,['oven'])['total'],825)
        self.assertEqual(quote('deep',500)['total'],325)
        text=LESSON_BY_KEY['pricing']['pages'][2]['example']
        for expected in ['2,750','$780','$825','$325']:self.assertIn(expected,text)
    def test_philippines_orientation_dates_match_zoneinfo(self):
        for month,hour in [(1,2),(7,1)]:
            local=datetime(2026,month,15,10,tzinfo=ZoneInfo('America/Los_Angeles')).astimezone(ZoneInfo('Asia/Manila'))
            self.assertEqual((local.day,local.hour),(16,hour))
    def test_every_skill_has_explanation_example_check_and_progression(self):
        self.assertEqual(len(LESSONS),6)
        for lesson in LESSONS:
            self.assertEqual(len(lesson['pages']),3)
            for page in lesson['pages']:
                for field in ['goal','why','example','mistake','exception','question','explanation']:self.assertTrue(page[field].strip(),(lesson['key'],page['title'],field))
                self.assertGreaterEqual(len(page['method']),3)
                self.assertIn(page['correct'],[choice['value'] for choice in page['choices']])
        for key,index in [('welcome',2),('conversation',2),('objections',0),('followup',1)]:
            self.assertTrue(LESSON_BY_KEY[key]['pages'][index]['reflection'])
