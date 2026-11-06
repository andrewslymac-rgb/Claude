from copy import deepcopy
from .models import WrittenResponse


def archive_guided(assignment,progress,index,answer,evaluation,*,prior=False):
    if not answer.get('reflection'):
        return None
    if prior and answer.get('submission_id'):
        return answer['submission_id']
    record,_=WrittenResponse.objects.get_or_create(
        event_key=f'guided:{progress.pk}:{index}:{progress.revision}:{"prior" if prior else "submitted"}',
        defaults={'assignment':assignment,'lesson_key':progress.lesson_key,'page_number':index+1,
                  'answer':deepcopy(answer),'evaluation':deepcopy(evaluation or {}),
                  'question':{'page':deepcopy(progress.content['pages'][index]),
                              'lesson_version':progress.content.get('version'),
                              'policy_version':progress.content.get('policy_version'),
                              'previously_complete':index in progress.completed_pages}})
    return record.pk
