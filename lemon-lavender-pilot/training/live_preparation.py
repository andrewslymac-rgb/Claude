"""Allowlisted live configuration; selecting a caller never authorizes a call."""
from copy import deepcopy
from django import forms
from .sales_content import PERSONAS, DIFFICULTIES
from .sales_feedback import DRAFT_RUBRIC
from .sales_scenarios import scenario_snapshot, SCHEMA_VERSION
from .sales_forms import ScenarioCRMForm
from .forms import CRMForm


class LivePreparationForm(forms.Form):
    persona_id = forms.ChoiceField(required=False, label='Fictional customer',
        choices=[('', 'Historical Taylor test configuration')] + [(k,v['title']) for k,v in PERSONAS.items()])
    difficulty = forms.ChoiceField(choices=[(k,v['label']) for k,v in DIFFICULTIES.items()])


def selected_scenario(data, policy):
    form = LivePreparationForm({'persona_id':data.get('persona_id',''), 'difficulty':data.get('difficulty','beginner')})
    if not form.is_valid():
        raise ValueError('Choose an available customer and difficulty.')
    if not form.cleaned_data['persona_id']:
        if form.cleaned_data['difficulty'] != 'beginner':
            raise ValueError('The historical configuration has one fixed difficulty.')
        return None
    return scenario_snapshot(form.cleaned_data['persona_id'], form.cleaned_data['difficulty'], 'full', policy)


def selection_allowed(controller, scenario):
    if not scenario or scenario.get('schema_version') != SCHEMA_VERSION:
        return True
    choices = getattr(controller, 'scenario_choices', ())
    return isinstance(choices, (tuple,list,set)) and (scenario['persona_id'],scenario['difficulty']) in choices


def notes_form(scenario, *args, **kwargs):
    return (ScenarioCRMForm(*args, scenario=scenario, **kwargs) if scenario and scenario.get('schema_version') == SCHEMA_VERSION
            else CRMForm(*args, **kwargs))


def live_rubric():
    return deepcopy(DRAFT_RUBRIC)
