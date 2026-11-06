from django import forms
from .models import BudgetSettings, OperatingCost


class SignInForm(forms.Form):
    email = forms.EmailField(label='Demo email')


class WelcomeForm(forms.Form):
    clock = forms.ChoiceField(label='Which clock should you check before promising a local call time?', choices=[
        ('', 'Choose an answer'), ('pacific', 'America/Los_Angeles for the appointment date'),
        ('fixed', 'Use the same Philippines-to-Portland offset all year')])
    deep = forms.ChoiceField(label='What comes before a new recurring plan?', choices=[
        ('', 'Choose an answer'), ('required', 'A required initial Deluxe Deep'), ('optional', 'An optional deep clean')])
    booking = forms.ChoiceField(label='A customer asks for next Tuesday. What do you record?', choices=[
        ('', 'Choose an answer'), ('request', 'A request that needs availability confirmation'), ('booked', 'A confirmed booking')])
    introduction = forms.CharField(label='Practice a short company introduction in your own words', min_length=30,
        max_length=1000, widget=forms.Textarea(attrs={'rows': 4, 'placeholder': 'Use confirmed services. Do not invent company values, guarantees, or service-area coverage.'}))

    def clean_introduction(self):
        from .curriculum import LESSON_BY_KEY
        from .written_checks import evaluate_writing
        value=self.cleaned_data['introduction'].strip()
        self.writing_feedback=evaluate_writing('welcome',2,LESSON_BY_KEY['welcome']['pages'][2],value)
        if self.writing_feedback['status'] in {'incorrect','partial'}:
            raise forms.ValidationError(self.writing_feedback['issues']+self.writing_feedback['missing'])
        return value

    def clean(self):
        data = super().clean()
        for key, expected in [('clock', 'pacific'), ('deep', 'required'), ('booking', 'request')]:
            if data.get(key) != expected:
                self.add_error(key, 'Review the chapter and try this again.')
        return data


class CRMForm(forms.Form):
    customer = forms.ChoiceField(choices=[('Taylor Sample', 'Taylor Sample — fictional')])
    sqft = forms.IntegerField(min_value=2000, max_value=2000, initial=2000, label='Home size (sq ft)')
    service = forms.ChoiceField(choices=[('biweekly', 'Biweekly + required initial Deluxe Deep')])
    needs = forms.CharField(max_length=500, widget=forms.Textarea(attrs={'rows': 2}), label='Customer priorities and cleaning needs')
    initial_quote = forms.IntegerField(min_value=0, max_value=10000, label='Initial deep quote ($)')
    recurring_quote = forms.IntegerField(min_value=0, max_value=10000, label='Biweekly quote ($)')
    disposition = forms.ChoiceField(choices=[('request', 'Service request — not booked'),
        ('escalation', 'Manager clarification required'), ('nonfit', 'Potential non-fit — manager review')])
    follow_up = forms.CharField(max_length=500, widget=forms.Textarea(attrs={'rows': 2}), label='Next step, timing, expectations, and unresolved questions')
    reason = forms.CharField(max_length=500, required=False, label='Reason for escalation / potential non-fit')

    def clean(self):
        data = super().clean()
        if data.get('disposition') in {'escalation', 'nonfit'} and not data.get('reason'):
            self.add_error('reason', 'Explain what needs a manager’s decision.')
        return data


class ReviewForm(forms.Form):
    policy_flag_assessment = forms.ChoiceField(required=False,
        choices=[('', 'Not assessed / no provisional flags'),('confirmed','Listening confirms a prohibited policy promise'),
                 ('context_or_transcription','Listening shows quotation, context or transcription error; explain below')],
        label='If AI/text policy flags exist, resolve them against the recording before readiness; explain in the decision reason')
    objection_evidence = forms.CharField(required=False,max_length=1000,widget=forms.Textarea(attrs={'rows':2}),
        label='Objection handling demonstrated: cite a learner turn ID or response-recording ID with mm:ss, and explain the behavior (required for readiness)')
    simulated_deposit = forms.BooleanField(required=False,
        label='Trainer fixture: explicitly record a SIMULATED paid deposit after a qualified full rehearsal request. No money is collected and no authority or deposit terms are granted.')
    decision = forms.ChoiceField(choices=[('retry', 'Coach one behavior and retry'),
        ('ready', 'Manager confirms practice readiness'), ('escalation', 'Accept legitimate escalation / non-fit')])
    coaching = forms.CharField(min_length=10, max_length=1000, widget=forms.Textarea(attrs={'rows': 3}),
        label='One observable behavior to improve')
    keep_doing = forms.CharField(required=False, max_length=1000, widget=forms.Textarea(attrs={'rows': 2}), label='One thing to continue')
    retry_task = forms.CharField(required=False, max_length=1000, widget=forms.Textarea(attrs={'rows': 2}), label='Short retry task')
    observation = forms.ChoiceField(required=False, choices=[('not_assessed', 'Not assessable from this evidence'), ('observed', 'Focus behavior observed'), ('not_yet', 'Focus behavior not yet observed')])
    evidence = forms.CharField(required=False, max_length=1000, label='Evidence: transcript turn, recording label and timestamp, or specific observation')

    def clean_observation(self):
        return self.cleaned_data.get('observation') or 'not_assessed'

    def clean(self):
        data = super().clean()
        if data.get('observation') in {'observed', 'not_yet'} and not data.get('evidence', '').strip():
            self.add_error('evidence', 'Identify the evidence for this observation.')
        return data

    override_reason = forms.CharField(required=False, max_length=1000, widget=forms.Textarea(attrs={'rows': 2}),
        label='Why is this the right next step? (required for readiness or escalation)')


class BudgetForm(forms.ModelForm):
    class Meta:
        model = BudgetSettings
        fields = ['monthly_target_cents', 'alert_percent', 'max_attempts_per_day', 'max_minutes', 'max_turns']
        labels = {'monthly_target_cents': 'Monthly AI budget target (cents; 5000 = $50)',
                  'alert_percent': 'Alert threshold (%)', 'max_minutes': 'Minutes per new attempt',
                  'max_turns': 'Scripted turns per new attempt'}

    def clean(self):
        data = super().clean()
        bounds = {'monthly_target_cents': (1, 1000000), 'alert_percent': (1, 100),
                  'max_attempts_per_day': (1, 50), 'max_minutes': (1, 60), 'max_turns': (1, 50)}
        for key, (low, high) in bounds.items():
            if data.get(key) is not None and not low <= data[key] <= high:
                self.add_error(key, f'Choose a value from {low} to {high}.')
        return data


class OperatingCostForm(forms.ModelForm):
    class Meta:
        model = OperatingCost
        fields = ['month', 'category', 'cents', 'note']
        widgets = {'month': forms.DateInput(attrs={'type': 'date'})}
        labels = {'month': 'Month (any day is normalized to the first)', 'cents': 'Manually recorded cost in cents'}

    def clean_month(self):
        return self.cleaned_data['month'].replace(day=1)
