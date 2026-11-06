"""Check that manager references point to saved learner evidence, not its meaning."""
import re


def learner_reference(attempt, text):
    if not isinstance(text,str) or len(text.strip())<10:return False
    def contains(ident):
        return bool(re.search(r'(?<![\w-])'+re.escape(str(ident))+r'(?![\w-])',text))
    if any(contains(t['id']) for t in attempt.transcript if t.get('speaker') in {'Learner','Trainee (scripted)'}):
        return True
    times=[int(m)*60+float(s) for m,s in re.findall(r'(?<!\d)(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)(?!\d)',text)]
    return any(contains(record.pk) and any(0<=second<record.frames/record.sample_rate for second in times)
               for record in attempt.recordings.all())
