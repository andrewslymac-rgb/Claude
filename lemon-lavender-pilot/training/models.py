import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q


class Profile(models.Model):
    ROLES = [('admin', 'Pilot admin'), ('trainer', 'Trainer'), ('learner', 'Learner')]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=12, choices=ROLES, default='learner')
    invited = models.BooleanField(default=True)


class MagicLink(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    digest = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True)


class Course(models.Model):
    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=180)
    version = models.CharField(max_length=40)


class Assignment(models.Model):
    learner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.PROTECT)
    welcome_completed_at = models.DateTimeField(null=True)
    company_introduction = models.CharField(max_length=1000, blank=True)
    lesson_completed_at = models.DateTimeField(null=True)
    followup_lesson_completed_at = models.DateTimeField(null=True)
    services_completed_at = models.DateTimeField(null=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['learner', 'course'], name='one_assignment')]


class Attempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name='attempts')
    status = models.CharField(max_length=16, default='active', choices=[
        ('active', 'In progress'), ('submitted', 'Awaiting manager'), ('reviewed', 'Reviewed'),
        ('expired', 'Time limit reached'), ('abandoned', 'Ended early')])
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True)
    revision = models.PositiveIntegerField(default=0)
    policy = models.JSONField(default=dict)
    scenario = models.JSONField(default=dict)
    rubric = models.JSONField(default=dict)
    limits = models.JSONField(default=dict)
    coaching_focus = models.ForeignKey('CoachingFocus', on_delete=models.PROTECT, null=True, related_name='attempts')
    transcript = models.JSONField(default=list)
    actions = models.JSONField(default=list)
    crm = models.JSONField(default=dict)
    feedback = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['assignment'], condition=Q(status='active'), name='one_active_attempt')]


class LessonProgress(models.Model):
    """A learner's saved place and checks against a fixed lesson snapshot."""
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name='guided_lessons')
    lesson_key = models.SlugField()
    content = models.JSONField(default=dict)
    page_index = models.PositiveSmallIntegerField(default=0)
    answers = models.JSONField(default=dict)
    completed_pages = models.JSONField(default=list)
    revision = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['assignment', 'lesson_key'], name='one_guided_lesson')]


class Review(models.Model):
    attempt = models.OneToOneField(Attempt, on_delete=models.PROTECT, related_name='review')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    decision = models.CharField(max_length=20, choices=[('retry', 'Coach and retry'),
        ('ready', 'Manager confirms practice readiness'), ('escalation', 'Valid escalation / non-fit')])
    coaching = models.CharField(max_length=1000)
    override_reason = models.CharField(max_length=1000, blank=True)
    keep_doing = models.CharField(max_length=1000, blank=True)
    retry_task = models.CharField(max_length=1000, blank=True)
    observation = models.CharField(max_length=20, default='not_assessed')
    evidence = models.CharField(max_length=1000, blank=True)
    criteria_version = models.CharField(max_length=80, blank=True)
    objection_evidence = models.CharField(max_length=1000, blank=True)
    simulated_deposit_reference = models.CharField(max_length=80, blank=True)
    policy_flag_assessment = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class BudgetSettings(models.Model):
    # Only row 1 is used. Does not enable a paid provider.
    monthly_target_cents = models.PositiveIntegerField(default=5000)
    alert_percent = models.PositiveSmallIntegerField(default=80)
    max_attempts_per_day = models.PositiveSmallIntegerField(default=10)
    max_minutes = models.PositiveSmallIntegerField(default=20)
    max_turns = models.PositiveSmallIntegerField(default=24)
    updated_at = models.DateTimeField(auto_now=True)


class UsageEntry(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.PROTECT, related_name='usage')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    event_key = models.CharField(max_length=100, unique=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    provider = models.CharField(max_length=60, default='local-scripted')
    model = models.CharField(max_length=60, default='macOS-Samantha-fixture')
    activity = models.CharField(max_length=30)
    synthetic = models.BooleanField(default=True)
    voice_seconds = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    estimated_cents = models.DecimalField(max_digits=14, decimal_places=6, default=0)
    reported_cents = models.DecimalField(max_digits=14, decimal_places=6, null=True)
    price_version = models.CharField(max_length=80, default='local-fixtures-free-v1')

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(estimated_cents__gte=0), name='nonnegative_estimate'),
            models.CheckConstraint(condition=Q(reported_cents__isnull=True) | Q(reported_cents__gte=0), name='nonnegative_reported'),
            models.CheckConstraint(condition=Q(synthetic=False) | (Q(estimated_cents=0) & Q(reported_cents=0)), name='free_synthetic_usage')]


class OperatingCost(models.Model):
    month = models.DateField()
    category = models.CharField(max_length=20, choices=[('hosting', 'Hosting'), ('email', 'Email'), ('other', 'Other non-AI')])
    cents = models.PositiveIntegerField()
    note = models.CharField(max_length=200)
    entered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class FollowupAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name='followup_attempts')
    started_at = models.DateTimeField(auto_now_add=True)
    revision = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=24, default='active')
    policy = models.JSONField(default=dict)
    scenario = models.JSONField(default=dict)
    limits = models.JSONField(default=dict)
    state = models.JSONField(default=dict)
    events = models.JSONField(default=list)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['assignment'], condition=Q(status='active'), name='one_active_followup')]


class CoachingFocus(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name='coaching_focuses')
    behavior = models.CharField(max_length=500)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['assignment'], condition=Q(active=True), name='one_active_focus')]


class ReadinessReview(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name='readiness_reviews')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    areas = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class PracticeRecording(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attempt = models.ForeignKey(Attempt, on_delete=models.PROTECT, related_name='recordings')
    label = models.CharField(max_length=100)
    sha256 = models.CharField(max_length=64)
    frames = models.PositiveIntegerField()
    sample_rate = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['attempt', 'sha256'], name='one_recording_upload')]

    @property
    def seconds(self):
        return round(self.frames / self.sample_rate, 1)


class LiveCall(models.Model):
    attempt = models.OneToOneField(Attempt, primary_key=True, on_delete=models.PROTECT, related_name='live_call')
    state = models.CharField(max_length=24, default='starting')
    started_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True)
    approval = models.CharField(max_length=80)
    model = models.CharField(max_length=40, default='gpt-live-1')
    voice = models.CharField(max_length=30, default='marin')
    synthetic_test = models.BooleanField(default=True)
    fragments = models.JSONField(default=list)
    evidence = models.JSONField(default=dict)
    usage = models.JSONField(default=dict)
    error_code = models.CharField(max_length=80, blank=True)


class WrittenResponse(models.Model):
    """Append-only snapshots of written submissions and their limited checks."""
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name='written_responses')
    lesson_key = models.CharField(max_length=60)
    page_number = models.PositiveSmallIntegerField()
    event_key = models.CharField(max_length=160, unique=True)
    answer = models.JSONField(default=dict)
    evaluation = models.JSONField(default=dict)
    question = models.JSONField(default=dict)
    source = models.CharField(max_length=30, default='guided')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-pk']


class TranscriptAnchor(models.Model):
    """Append-only human alignment, bound to an actual rendered WAV digest."""
    attempt = models.ForeignKey(Attempt, on_delete=models.PROTECT, related_name='transcript_anchors')
    turn_id = models.CharField(max_length=60)
    revision = models.PositiveIntegerField()
    start_frame = models.PositiveIntegerField()
    end_frame = models.PositiveIntegerField()
    recording_sha256 = models.CharField(max_length=64)
    confidence = models.CharField(max_length=16, choices=[('confirmed','Confirmed by listening'),('approximate','Approximate — review again')])
    source = models.CharField(max_length=40, default='trainer-alignment-v1')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['pk']
        constraints = [models.UniqueConstraint(fields=['attempt','turn_id','revision'],name='unique_transcript_anchor_revision')]

    @property
    def start_seconds(self):
        return self.start_frame / 24000

    @property
    def end_seconds(self):
        return self.end_frame / 24000
