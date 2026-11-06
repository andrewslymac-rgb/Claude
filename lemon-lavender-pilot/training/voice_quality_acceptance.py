"""Separately approved, user-started quality acceptance. Historical grants stay closed."""
import hashlib
import json
from datetime import datetime, timezone
from django.contrib.auth import get_user_model
from django.db import transaction
from .live_budget import MicrophoneBudget, BudgetDenied
from .models import Assignment, Course
from .policies import POLICY
from .sales_scenarios import scenario_snapshot
from .live_provider import conversation_config

COURSE_SLUG = 'voice-quality-acceptance-2026-10-08'
PERSONA = 'busy_parent'
DIFFICULTY = 'intermediate'
CHOICES = ((PERSONA, DIFFICULTY),)
PORT = 8769


def fingerprint(policy=None, scenario=None):
    policy = policy or POLICY
    scenario = scenario or scenario_snapshot(PERSONA,DIFFICULTY,policy=policy)
    return hashlib.sha256(json.dumps(conversation_config(policy,scenario),sort_keys=True).encode()).hexdigest()


@transaction.atomic
def ensure_assignment():
    learner=get_user_model().objects.get(email='learner@example.invalid',is_active=True,
                                        profile__role='learner',profile__invited=True)
    course,_=Course.objects.get_or_create(slug=COURSE_SLUG,defaults={
        'title':'Voice quality acceptance — fictional customer','version':'voice-quality-2026-10-08-v1'})
    assignment,_=Assignment.objects.get_or_create(learner=learner,course=course)
    return assignment


class VoiceQualityBudget(MicrophoneBudget):
    approval = 'andrew-voice-quality-2026-10-08T01:28Z'
    storage_name = 'voice-quality-2026-10-08-authorization'

    def prepare(self, assignment_id):
        if type(assignment_id) is not int or assignment_id < 1:
            raise BudgetDenied('A dedicated quality-test assignment is required.')
        with self.locked(create=True) as data:
            if 'authorization' in data:
                self._validate(data)
                if data['authorization']['assignment_id']!=assignment_id:
                    raise BudgetDenied('The approved assignment cannot be changed.')
                return
            if data['calls'] or data['closed']:
                raise BudgetDenied('This allowance cannot be replaced or reopened.')
            predecessors={}
            for name in ('live-test-authorization.json','microphone-acceptance-authorization.json'):
                path=self.directory/name
                if path.is_file():
                    predecessors[name]=hashlib.sha256(path.read_bytes()).hexdigest()
            data['authorization']={
                'source_thread':'01a1039f-5f7c-728a-bec8-1a9b5bc11008',
                'proposal_reference':'Sentinel_66e57d21a4888191a91a6d526b42c00c',
                'approval_reference':'Sentinel_f7fcc94edbf881919639bf2da17cb618',
                'approved_at':'2026-10-08T01:28:00Z',
                'owner_response':'Yes',
                'approved_scope':'One new user-operated fictional microphone quality test, up to five minutes and $1 additional total OpenAI voice/backend/coaching. Audio and transcript go to OpenAI; recording stays on this Mac.',
                'max_cents':100,'max_seconds':300,'max_starts':1,'active_seconds':240,
                'assignment_id':assignment_id,'persona_id':PERSONA,'difficulty':DIFFICULTY,'drill':'full',
                'configuration_sha256':fingerprint(),'in_session_paid_backend':False,
                'coaching_requests':1,'coaching_max_input_bytes':48000,'coaching_max_output_tokens':2400,
                'prior_authorization_sha256':predecessors,
                'activation':'Human launcher; no API connection before deliberate browser Start.',
            }
            data['history']=[{'event':'new_separate_owner_authorization_prepared',
                'at':datetime.now(timezone.utc).isoformat(),'starts_consumed':0,
                'previous_authorizations_reopened':False}]

    def _validate(self,data):
        scope=data.get('authorization',{})
        current_fingerprint=fingerprint()
        from .quality_configuration_review import reviewed_prompt_refresh
        configuration_matches=(scope.get('configuration_sha256')==current_fingerprint or
                               reviewed_prompt_refresh(data,current_fingerprint))
        expected={'max_cents':100,'max_seconds':300,'max_starts':1,'active_seconds':240,
                  'persona_id':PERSONA,'difficulty':DIFFICULTY,'drill':'full',
                  'in_session_paid_backend':False,
                  'coaching_requests':1,'coaching_max_input_bytes':48000,'coaching_max_output_tokens':2400}
        if not configuration_matches or any(scope.get(k)!=v for k,v in expected.items()) or type(scope.get('assignment_id')) is not int:
            raise BudgetDenied('The prepared quality-test scope or configuration changed. Review is required before launch.')
        return current_fingerprint

    def check_prepared(self,assignment_id,scenario_choices):
        """Read-only preflight: no ledger rewrite, lock-file creation or arming."""
        from .combined_audio import private_read
        try:
            data=json.loads(private_read(self.directory/(self.storage_name+'.json'),128000))
            if (data.get('approval')!=self.approval or data.get('closed') is not False or data.get('calls')!={}):
                raise ValueError
        except (OSError,ValueError,TypeError,AttributeError):
            raise BudgetDenied('The unused quality-test authorization cannot be verified.') from None
        effective=self._validate(data)
        if assignment_id!=data['authorization']['assignment_id'] or tuple(scenario_choices)!=CHOICES:
            raise BudgetDenied('This process does not match the approved quality-test assignment and caller.')
        return {'starts_used':0,'configuration_sha256':effective,
                'original_configuration_sha256':data['authorization']['configuration_sha256']}

    def arm(self):
        # No implicit creation: setup records the reviewed scope before Keychain access.
        with self.locked() as data:
            self._validate(data)
            if data.get('closed') or data['calls']:
                raise BudgetDenied('This one-start quality allowance is closed or already used. No automatic retry.')

    def validate_binding(self,assignment_id,scenario_choices):
        with self.locked() as data:
            self._validate(data)
            if assignment_id!=data['authorization']['assignment_id'] or tuple(scenario_choices)!=CHOICES:
                raise BudgetDenied('This process does not match the approved quality-test assignment and caller.')

    def validate_call(self,call):
        scenario=call.attempt.scenario
        with self.locked() as data:
            effective_fingerprint=self._validate(data)
            if (call.attempt.assignment_id!=data['authorization']['assignment_id'] or
                    scenario.get('persona_id')!=PERSONA or scenario.get('difficulty')!=DIFFICULTY or
                    scenario.get('input_mode')!='microphone' or scenario.get('drill')!='full' or
                    fingerprint(call.attempt.policy,scenario)!=effective_fingerprint):
                raise BudgetDenied('The requested call is outside this quality-test allowance.')
