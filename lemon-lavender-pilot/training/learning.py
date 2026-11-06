"""Read-only journey summaries; old completion credit is never rewritten."""
from django.urls import reverse
from .curriculum import LEGACY_CREDIT, LESSONS, RETIRED_LESSONS


def journey(assignment):
    saved={p.lesson_key:p for p in assignment.guided_lessons.all()}
    rows=[]
    for index,current in enumerate(LESSONS):
        progress=saved.get(current['key'])
        content=progress.content if progress else current
        credit=bool(getattr(assignment,LEGACY_CREDIT.get(current['key'],''),None))
        complete=bool(progress and progress.completed_at) or credit
        page=progress.page_index if progress else 0
        rows.append({'key':current['key'],'number':index+1,'title':content['title'],'summary':content['summary'],
            'minutes':content['minutes'],'complete':complete,'earlier_credit':credit and not (progress and progress.completed_at),
            'progress':progress,'pages_done':len(progress.completed_pages) if progress else 0,
            'pages_total':len(content['pages']),'url':reverse('guided_lesson',args=[assignment.pk,current['key'],page+1])})
    active=[r for r in rows if r['progress'] and not r['progress'].completed_at and r['progress'].answers]
    current=max(active,key=lambda r:r['progress'].updated_at) if active else next((r for r in rows if not r['complete']),None)
    count=sum(row['complete'] for row in rows)
    retired=[{'title':p.content.get('title', 'Retired lesson'), 'answers':len(p.answers),
              'url':reverse('guided_lesson',args=[assignment.pk,key,1])}
             for key,p in saved.items() if key in RETIRED_LESSONS]
    return {'retired_lessons':retired,'journey_rows':rows,'next_lesson':current,'completed_count':count,'lesson_count':len(rows),
            'progress_percent':round(count/len(rows)*100),'all_lessons_complete':current is None,
            'has_earlier_credit':any(r['earlier_credit'] for r in rows)}
