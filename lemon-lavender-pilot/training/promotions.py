"""Date-aware eligibility check over a versioned, verified policy snapshot.

No campaign writes, payment calls or price overrides. The local policy has no
verified campaign terms. Tests supply fictional offers, never production terms.
"""
from datetime import date


def promotion_status(policy, code, service, on_date, *, customer_mentioned=False, already_applied=False):
    result={'offer':False,'status':'manager_verification','terms':None,'applied':False}
    if not customer_mentioned:
        return {**result,'status':'not_mentioned'}
    if already_applied:
        return {**result,'status':'no_automatic_stacking'}
    if type(on_date) is not date or not isinstance(code,str) or not code.strip():
        return result
    offers=policy.get('owner_decisions',{}).get('promotions',[])
    matches=[p for p in offers if isinstance(p,dict) and isinstance(p.get('code'),str) and p['code'].casefold()==code.strip().casefold()]
    if len(matches)!=1:return result
    item=matches[0]
    try:
        start,end=date.fromisoformat(item['starts_on']),date.fromisoformat(item['ends_on'])
        if (item.get('verified') is not True or start>end or not isinstance(item['services'],list) or
                not item['services'] or any(s not in policy['services'] for s in item['services']) or
                not isinstance(item['terms'],str) or not item['terms'].strip() or
                not isinstance(item.get('version'),str) or not item['version'].strip()):return result
    except (KeyError,TypeError,ValueError):return result
    if not start<=on_date<=end:return {**result,'status':'inactive_on_date'}
    if service not in item['services']:return {**result,'status':'ineligible_service'}
    return {**result,'offer':True,'status':'eligible_active','terms':item['terms'],'version':item['version'],
            'note':'Offer only these verified terms; this check does not apply a price or confirm payment.'}
