"""Regenerate reviewable local material from the same application configuration."""
import json
from django.conf import settings
from django.core.management.base import BaseCommand
from training.sales_content import PERSONAS, OBJECTIONS, DIFFICULTIES, DRILLS, VERSION, PROMPT_VERSION
from training.sales_scenarios import scenario_snapshot, render_caller_prompt, SCHEMA_VERSION
from training.sales_feedback import DRAFT_RUBRIC
from training.policies import POLICY


class Command(BaseCommand):
    help='Export original fictional sales content and draft configurations locally. No provider calls.'

    def handle(self,*args,**options):
        root=settings.BASE_DIR/'docs'/'sales-materials'/'2026-10-08-owner-v3';root.mkdir(parents=True,exist_ok=True)
        schema={'$schema':'https://json-schema.org/draft/2020-12/schema','title':SCHEMA_VERSION,
            'description':'Allowlisted input parameters. The server creates an immutable profile, pricing, policy and prompt snapshot; raw learner text is not configuration.',
            'type':'object','additionalProperties':False,'required':['persona_id','difficulty','drill'],
            'properties':{'persona_id':{'type':'string','enum':list(PERSONAS)},
                'difficulty':{'type':'string','enum':list(DIFFICULTIES)},'drill':{'type':'string','enum':list(DRILLS)}}}
        files={'caller-parameters.schema.json':schema,'caller-library-v2.json':{'version':VERSION,'personas':PERSONAS},
            'objection-bank-v2.json':{'version':VERSION,'objections':OBJECTIONS},
            'rubric-draft-v2.json':DRAFT_RUBRIC,
            'scenario-snapshots-v2.json':{key:scenario_snapshot(key,'advanced','full') for key in PERSONAS}}
        for name,data in files.items():(root/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        prompt_text='# Caller prompts '+PROMPT_VERSION+'\n\nGenerated from current local configuration. Preview only; no provider validation or activation.\n\n'
        for key,p in PERSONAS.items():
            prompt_text+='## '+p['title']+' · advanced\n\n```text\n'+render_caller_prompt(POLICY,scenario_snapshot(key,'advanced','full'))+'\n```\n\n'
        (root/'caller-prompts-v3.md').write_text(prompt_text)
        self.stdout.write('Exported six original sales-material files to '+str(root)+'. No provider request made.')
