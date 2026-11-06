"""Run the actual quality launcher against generated input/fake transport in /tmp."""
import hashlib
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT));os.environ['DJANGO_SETTINGS_MODULE']='config.browser_qa_settings'
import django
django.setup()
from django.conf import settings
from django.core.management import call_command
from training.live_credentials import ServerSecret
from serve_live_mock import FakeTransport, fake_coaching


class QualityFakeTransport(FakeTransport):
    def open(self,config):
        (settings.QA_DIR/'observed-configuration.json').write_text(json.dumps({
            'sha256':hashlib.sha256(json.dumps(config,sort_keys=True).encode()).hexdigest(),
            'model':config['model'],'voice':config['audio']['output']['voice'],
            'store':config['store'],'delegation':config['delegation'], 'provider_requests':0},indent=2)+'\n')
        super().open(config)


if __name__=='__main__':
    call_command('migrate',verbosity=0);call_command('seed_demo',verbosity=0)
    settings.LIVE_MOCK=True;settings.LIVE_RECORDING_DIR=settings.QA_DIR/'live-recordings'
    call_command('serve_voice_quality_test',prepare=True)
    with patch('training.management.commands.serve_voice_quality_test.read_project_key',return_value=ServerSecret('sk-fictional-mock-never-sent')),patch('training.live_runtime.OpenAILiveTransport',QualityFakeTransport),patch('training.live_runtime.request_coaching',fake_coaching):
        call_command('serve_voice_quality_test',allow_keychain_prompt=False)
