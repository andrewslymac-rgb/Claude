from django import forms
from .followup import AFTER_HOURS_FIXTURES

PREFERENCE_CHOICES = [('all', 'Call, text, and email allowed'), ('call_text', 'Call and text only'),
    ('call_only', 'Calls only'), ('text_only', 'Text only'), ('email_only', 'Email only')]


class FollowupSetupForm(forms.Form):
    source = forms.ChoiceField(choices=[('google', 'Google lead — fictional'), ('facebook', 'Facebook lead — fictional')])
    arrival = forms.ChoiceField(choices=[('new_lead', 'New inbound lead'), ('missed_call', 'Missed inbound call'), ('live_call', 'Live inbound call')])
    email_case = forms.ChoiceField(label='Fictional email data', choices=[('valid', 'Valid reserved example address'), ('invalid', 'Invalid email'), ('missing', 'No email')])
    preference = forms.ChoiceField(label='Preference already supplied with the lead', choices=PREFERENCE_CHOICES)
    context = forms.ChoiceField(label='Training context', choices=[('normal', 'Ordinary context — Monday–Friday business-day practice'), ('after_hours', 'After hours — first outreach by 8:05 AM next business day')])
    day_one_weekday = forms.TypedChoiceField(coerce=int, initial=4, label='Already-established fictional day 1',
        choices=[(0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday')],
        help_text='Used for ordinary business-hours practice. After-hours missed/new leads use the next business opening from the fictional arrival below as day 1.')
    after_hours_fixture = forms.ChoiceField(required=False, initial='friday_evening', label='Fictional after-hours arrival',
        choices=[(key, value[0]) for key, value in AFTER_HOURS_FIXTURES.items()],
        help_text='Used only for after-hours missed calls/new leads. Dates are fixed training examples; holiday treatment remains pending. Live calls still practice immediate answering.')


class FollowupCheckForm(forms.Form):
    first = forms.ChoiceField(label='During business hours, a missed call gets no answer when you call back. What is the first outreach requirement?', choices=[
        ('', 'Choose an answer'), ('five', 'Call, voicemail, text, and valid-email outreach within five minutes, honoring preferences'),
        ('tomorrow', 'Wait until tomorrow for the first call')])
    response = forms.ChoiceField(label='The customer replies asking for a callback. What happens to the no-response sequence?', choices=[
        ('', 'Choose an answer'), ('stop', 'Exit it and track the specific callback promise'), ('continue', 'Continue all remaining steps anyway')])
    final = forms.ChoiceField(label='Which final-message delivery rule is approved?', choices=[
        ('', 'Choose an answer'), ('pending', 'The message content is approved; delivery channel(s) remain pending'),
        ('both', 'Text plus email is already confirmed')])

    def clean(self):
        data = super().clean()
        for key, expected in [('first', 'five'), ('response', 'stop'), ('final', 'pending')]:
            if data.get(key) != expected:
                self.add_error(key, 'Review the approved sequence and the pending policy details.')
        return data


class CallbackForm(forms.Form):
    channel = forms.ChoiceField(choices=[('call', 'Call'), ('text', 'Text'), ('email', 'Email')])
    promised_when = forms.CharField(min_length=8, max_length=200, label='Customer’s requested date/time and time zone (fictional)',
        widget=forms.TextInput(attrs={'placeholder': 'Record the exact promise; flag missing date/time or time zone for clarification.'}))
    note = forms.CharField(min_length=8, max_length=500, label='Callback promise / clarification note', widget=forms.Textarea(attrs={'rows': 3}))


class PreferenceForm(forms.Form):
    preference = forms.ChoiceField(label='New preference stated in a customer response', choices=PREFERENCE_CHOICES)
