"""A separate technical acceptance assignment; no course credit or readiness."""
from django.contrib.auth import get_user_model
from django.db import transaction
from .models import Assignment, Course

COURSE_SLUG = 'microphone-acceptance-2026-10-07'
TECHNICAL_COURSE_SLUGS = (COURSE_SLUG, 'voice-quality-acceptance-2026-10-08')


@transaction.atomic
def ensure_assignment():
    learner = get_user_model().objects.get(email='learner@example.invalid', is_active=True,
                                         profile__role='learner', profile__invited=True)
    course, _ = Course.objects.get_or_create(slug=COURSE_SLUG, defaults={
        'title': 'Microphone acceptance — fictional customer', 'version': 'mic-acceptance-v1'})
    assignment, _ = Assignment.objects.get_or_create(learner=learner, course=course)
    return assignment
