from django import forms
from .sales_content import PERSONAS, DIFFICULTIES, DRILLS


class ScenarioForm(forms.Form):
    persona_id=forms.ChoiceField(label='Prospective customer',choices=[(k,p['title']) for k,p in PERSONAS.items()])
    difficulty=forms.ChoiceField(choices=[(k,p['label']) for k,p in DIFFICULTIES.items()])
    drill=forms.ChoiceField(label='Practice format',choices=[(k,p['label']) for k,p in DRILLS.items()])


class ScenarioCRMForm(forms.Form):
    customer=forms.ChoiceField()
    sqft=forms.IntegerField(min_value=1,max_value=20000,label='Property size (sq ft)')
    service=forms.ChoiceField()
    needs=forms.CharField(max_length=500,widget=forms.Textarea(attrs={'rows':2}),label='Priorities, condition, pets and scope questions')
    initial_quote=forms.IntegerField(min_value=0,max_value=10000,required=False,label='First / one-time estimate ($)')
    recurring_quote=forms.IntegerField(min_value=0,max_value=10000,required=False,label='Ongoing estimate ($), recurring only')
    disposition=forms.ChoiceField(choices=[('request','Service request — not booked'),('followup','Follow-up agreed — no service commitment'),
        ('escalation','Manager confirmation required'),('nonfit','Potential non-fit — manager review')])
    follow_up=forms.CharField(max_length=500,widget=forms.Textarea(attrs={'rows':2}),label='Actual agreement, next step and confirmation still needed')
    reason=forms.CharField(required=False,max_length=500,label='Reason for escalation / non-fit')

    def __init__(self,*args,scenario,**kwargs):
        super().__init__(*args,**kwargs)
        self.scenario=scenario
        self.fields['customer'].choices=[(scenario['customer'],scenario['customer']+' — fictional')]
        self.fields['service'].choices=[(scenario['service'],scenario['service'])]
        self.fields['sqft'].initial=scenario['sqft']
        if scenario['pricing']['manual']:
            self.fields['initial_quote'].help_text='Leave blank: scope/manual review needed.'
            self.fields['recurring_quote'].help_text='Leave blank: no automatic quote.'

    def clean(self):
        data=super().clean()
        if data.get('sqft')!=self.scenario['sqft']:self.add_error('sqft','Use this fictional scenario’s discovered size.')
        if data.get('disposition') in {'escalation','nonfit'} and not data.get('reason'):
            self.add_error('reason','Record what needs review or why the service is not a fit.')
        return data
