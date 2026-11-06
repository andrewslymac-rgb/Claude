from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from training.models import Assignment, Course, Profile


class Command(BaseCommand):
    help = 'Seed reserved fictional pilot identities. Creates no owner, usable password, or real invitation.'

    def handle(self, *args, **options):
        course, _ = Course.objects.update_or_create(slug='inbound-foundations', defaults={
            'title': 'Lemon & Lavender Training Center', 'version': 'original-v5'})
        for role in ('learner', 'trainer', 'admin'):
            email = role + '@example.invalid'
            user, created = get_user_model().objects.get_or_create(username=email, defaults={
                'email': email, 'first_name': 'Demo ' + role.title()})
            if created:
                user.set_unusable_password()
                user.save()
            Profile.objects.get_or_create(user=user, defaults={'role': role, 'invited': True})
            if role == 'learner':
                Assignment.objects.get_or_create(learner=user, course=course)
        self.stdout.write('Fictional learner, trainer, and pilot admin ready. No real email sent; no owner credentials created.')
