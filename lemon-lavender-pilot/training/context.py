from .models import Assignment
from .microphone_acceptance import TECHNICAL_COURSE_SLUGS


def learner_navigation(request):
    from .owner_decisions import guidance, VERSION
    result={'current_owner_guidance':guidance(),'current_owner_version':VERSION}
    if request.user.is_authenticated:
        role=getattr(getattr(request.user,'profile',None),'role',None)
        if role=='learner':
            return {**result,'nav_assignment_id':Assignment.objects.filter(learner=request.user).exclude(course__slug__in=TECHNICAL_COURSE_SLUGS).values_list('pk',flat=True).first()}
    return result
