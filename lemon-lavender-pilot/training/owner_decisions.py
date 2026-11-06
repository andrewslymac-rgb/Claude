"""Owner-confirmed sales decisions. No payment processing or operational authority."""
VERSION = 'owner-sales-2026-10-08-v3'
DISCOUNT_RESPONSE = 'I’m sorry, we don’t have any discounts available right now.'
DECISIONS = {
    'version': VERSION,
    'won_requires': 'paid_deposit',
    'ideal_customer': 'A busy single-family household needing help maintaining home cleanliness.',
    'ideal_is_exclusion_rule': False,
    'differentiation': ['High-quality cleaning', 'Background-checked team', 'We will always do right by our customers'],
    'ethos_is_remedy_authority': False,
    'tone': ['kind', 'calm', 'patient', 'explain clearly', 'listen to concerns', 'no pressure'],
    'objection_priority': ['found_another_cleaner','cost_too_high','do_it_ourselves','no_response','more_than_expected'],
    'no_response_is_spoken_objection': False,
    'engaged_not_ready': 'Propose sending a proposal and agree on a specific follow-up in a day or two; honor the customer’s preference.',
    'no_response_cadence_unchanged': True,
    'readiness_requires': 'Manager-confirmed, evidence-linked demonstration of objection handling',
    'discount_response': DISCOUNT_RESPONSE,
    'explicit_promotion_code': 'Offer customer-mentioned active promotions according to verified dates, eligibility and terms. No invented terms or automatic stacking. Unknown details require manager verification.',
    'promotions': [],
    'unresolved': ['VA quoting/booking/deposit/availability authority', 'payment methods, amount and timing',
                   'current promotion dates, service eligibility and terms', 'numeric rubric and threshold', 'critical-failure rules',
                   'first trainee baseline', 'daily practice duration'],
}


def guidance():
    return [
        'A won lead requires a paid deposit. A proposal, approved quote, verbal yes or tentative booking is not a win. This pilot only records explicit simulated deposits; no real payment occurs.',
        'Our ideal customer is a busy single-family household needing help maintaining cleanliness. Other residential properties are not automatically excluded.',
        'Explain high-quality cleaning and our background-checked team. “We will always do right by our customers” is our approach, not a refund, guarantee, insurance claim or authority to offer a remedy.',
        'Be kind, calm and patient. Listen, explain the relevant value and ask for a clear next step without pressure.',
        'Practice objections in this order: found another cleaner; cost too high; doing it ourselves; no response (a follow-up exercise); more than expected.',
        DISCOUNT_RESPONSE+' Then address needs and value without negotiation. Offer a customer-mentioned active promotion under its verified eligibility and terms; this is the exception. Check unknown dates or terms with the manager, including FALL26. Do not invent or stack offers.',
        'For an engaged qualified prospect who is not ready, propose a proposal and agree on a specific follow-up in a day or two. This does not replace the business-day no-response sequence. The pilot sends nothing.',
        'Your quoting, booking, deposit and availability authority will be established in one-on-one training. Until confirmed, record the request and ask your manager.',
        'Readiness requires demonstrating objection handling with evidence and a manager’s judgment. Numeric weights, thresholds and automatic clearance remain unapproved.',
    ]
