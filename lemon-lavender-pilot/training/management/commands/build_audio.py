"""Render new, versioned demo recordings with already-installed Mac voices."""
import hashlib
import json
import subprocess
import tempfile
import wave
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from training.actor import CLIPS, VOICE_VERSION, VOICE_SEGMENTS


class Command(BaseCommand):
    help = 'Render the current prerecorded demo plus installed-voice samples. Never overwrite saved audio versions.'

    def handle(self, *args, **options):
        if not Path('/usr/bin/say').exists():
            raise CommandError('macOS speech is unavailable. The written conversation still works.')
        root = settings.BASE_DIR / 'training' / 'static' / 'training' / 'audio'
        target = root / VOICE_VERSION
        target.mkdir(parents=True, exist_ok=True)
        manifest_path = target / 'manifest.json'
        if manifest_path.exists():
            existing = json.loads(manifest_path.read_text())
            if existing.get('scripts') != CLIPS or existing.get('segments') != json.loads(json.dumps(VOICE_SEGMENTS)):
                raise CommandError('Saved scripts differ. Create a new audio version instead of replacing recordings.')
        elif any(target.glob('*.wav')):
            raise CommandError('Partial audio set exists. Inspect it before generating a new version.')
        installed = subprocess.run(['/usr/bin/say','-v','?'],capture_output=True,text=True,check=True).stdout
        recordings = {}
        for name, text in CLIPS.items():
            path = target / (name + '.wav')
            if not path.exists():
                self.render_segments(name, path, installed)
            recordings[name] = self.inspect(path)
        manifest_path.write_text(json.dumps({'version':VOICE_VERSION,'voice':'Samantha','segments':VOICE_SEGMENTS,
            'status':'prerecorded local speech; no live AI','scripts':CLIPS,'recordings':recordings},indent=2)+'\n')
        samples = root / 'previews-v2'
        samples.mkdir(exist_ok=True)
        for voice in ['Samantha','Karen','Daniel']:
            path=samples/(voice.lower()+'.wav')
            if not path.exists():
                self.render(voice,CLIPS['opening'],path,installed)
            self.inspect(path)
        self.stdout.write(f'Ready: {len(CLIPS)} new recordings and three local voice previews. Original recordings preserved.')

    def render_segments(self, name, path, installed):
        if 'Samantha' not in installed:
            raise CommandError('Samantha must already be installed. No download is allowed.')
        with tempfile.TemporaryDirectory(prefix='ll-voice-') as directory:
            pieces=[]
            for index,(text,rate,pause) in enumerate(VOICE_SEGMENTS[name]):
                segment=Path(directory)/f'{index}.wav'
                result=subprocess.run(['/usr/bin/say','-v','Samantha','-r',str(rate),'-o',str(segment),
                    '--file-format=WAVE','--data-format=LEI16@24000',text],capture_output=True,text=True,timeout=30)
                if result.returncode:raise CommandError('Installed voice rendering failed: '+result.stderr[:200])
                with wave.open(str(segment),'rb') as stream:
                    if stream.getnchannels()!=1 or stream.getsampwidth()!=2 or stream.getframerate()!=24000:
                        raise CommandError('Unexpected local audio format.')
                    pieces.append(stream.readframes(stream.getnframes()))
                pieces.append(b'\0\0'*(24000*pause//1000))
            with wave.open(str(path),'wb') as output:
                output.setparams((1,2,24000,0,'NONE','not compressed'))
                output.writeframes(b''.join(pieces))

    def render(self, voice, text, path, installed):
        if voice not in installed:
            raise CommandError(f'{voice} is not listed as installed. Nothing will be downloaded.')
        result=subprocess.run(['/usr/bin/say','-v',voice,'-r','165','-o',str(path),
            '--file-format=WAVE','--data-format=LEI16@24000',text],capture_output=True,text=True,timeout=30)
        if result.returncode:
            raise CommandError('Local speech generation failed: '+result.stderr[:300])

    def inspect(self,path):
        with wave.open(str(path),'rb') as stream:
            if not stream.getnframes() or stream.getsampwidth()!=2:
                raise CommandError('The Mac did not produce valid PCM audio.')
            seconds=stream.getnframes()/stream.getframerate()
        return {'seconds':round(seconds,3),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
