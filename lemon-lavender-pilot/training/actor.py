"""Scripted customer actor: only supplies customer responses, never grades."""
ACTIONS = {
    'discover': ('Ask about the home and goals', 'Before we discuss price, what is your home size, cleaning priority, preferred frequency, and hoped-for start date?'),
    'value': ('Connect service to their needs', 'An initial Deluxe Deep helps address the kitchen buildup and bathrooms. Biweekly cleaning can then help maintain that routine.'),
    'explain': ('Explain scope and accurate pricing', 'For 2,000 square feet, the required initial Deluxe Deep is $570, followed by $220 per biweekly visit. These are practice estimates without extras; availability and final arrangements still need confirmation.'),
    'objection': ('Address the first-visit objection', 'I understand the first visit is a larger investment. The initial deep addresses the buildup before we move to maintenance. It is required for recurring service. Does that explain the difference?'),
    'close': ('Ask for an explicit next step', 'Would you like me to record your request for the $570 initial deep and $220 biweekly plan and have the team confirm availability? This is a request, not a confirmed booking.'),
    'clarify': ('Refer an unresolved policy', 'I will ask the manager to confirm payment terms and any deposit before making a promise.'),
    'escalate': ('Make a transparent escalation', 'I will record your question for manager clarification. I cannot promise an exception or a booking.'),
    'discount': ('Practice a mistake: invent a discount', 'I can give you an unapproved 20 percent discount.'),
    'waive': ('Practice a mistake: waive the deep clean', 'We can skip the required initial deep clean.'),
    'falsebook': ('Practice a mistake: promise a booking', 'You are definitely booked for next week and your deposit is paid.'),
}
CLIPS = {
    'opening': 'Hi, I am Taylor. I am looking for cleaning every other week. Can you tell me what it costs?',
    'discover': 'Our home is two thousand square feet. The kitchen has buildup and the bathrooms need attention. Every other week would help. We hope to start next week.',
    'value': 'That sounds useful. The kitchen and bathrooms are the priorities.',
    'explain': 'Five hundred seventy dollars for the first visit, then two hundred twenty dollars every other week. Why does the first visit cost more?',
    'objection': 'That explains the difference. I understand the initial deep is required.',
    'close_ready': 'Yes. Please record my request for the five hundred seventy dollar initial deep and two hundred twenty dollar biweekly visits. Please have the team confirm availability. I understand I am not booked yet.',
    'close_missing': 'I am not ready to commit. Please understand my needs, explain the first visit and cost, answer my question, and prepare an accurate quote first.',
    'clarify': 'Thank you. Please check those terms with your manager.',
    'escalate': 'That is fine. Please record the question for your manager. I am not making a service commitment yet.',
    'unsafe': 'That seems inconsistent with the service terms. Please check with your manager before we proceed.',
}
VIOLATIONS = {'discount': 'Invented discount', 'waive': 'Waived mandatory initial deep', 'falsebook': 'False booking / payment claim'}


def respond(action, attempt):
    codes = {event['code'] for event in attempt.actions}
    if action in VIOLATIONS:
        return 'unsafe'
    if action == 'close':
        needed = {'discover', 'value', 'explain', 'objection', 'saved_quote'}
        accurate = attempt.crm.get('initial_quote') == 570 and attempt.crm.get('recurring_quote') == 220
        latest = {e['code']: e['order'] for e in attempt.actions}
        discovery_before_price = latest.get('discover', 999) < latest.get('explain', -1)
        return 'close_ready' if needed <= codes and accurate and discovery_before_price and not (codes & VIOLATIONS.keys()) else 'close_missing'
    return action

# Older attempts retain their original scripts and audio files.
LEGACY_ACTIONS = dict(ACTIONS)
LEGACY_CLIPS = dict(CLIPS)
VOICE_VERSION = 'samantha-v2'
CLIPS = {
    'opening': "Hi, I'm Taylor. We're looking for cleaning every other week. What would that cost?",
    'discover': "It's about two thousand square feet. The kitchen has some buildup, and the bathrooms need attention. Every other week sounds good. Could we start next week?",
    'value': "That sounds good. The kitchen and bathrooms are what I need help with most.",
    'explain': "Okay, five seventy for the first visit, then two twenty every other week. Why is the first visit more?",
    'objection': "That makes sense. The deep clean comes first, then we keep up with it.",
    'close_ready': "Yes, please request the five hundred seventy dollar deep clean and two hundred twenty dollar visits every other week. Please have the team confirm the date. I know it's not booked yet.",
    'close_missing': "Before I decide, could you walk me through what I'd get and the price? I still have a few questions.",
    'clarify': "Thanks. Please check with your manager and let me know.",
    'escalate': "Okay, please ask your manager. I'll wait to decide until we have that answer.",
    'unsafe': "Hang on, that sounds different from the service terms. Could you check with your manager?",
}
ACTIONS.update({
    'discover': ('Ask about the home', "I'd love to help. How big is your home, and what would you most like help with? How often are you thinking, and when would you like to start?"),
    'value': ('Explain how we can help', "The initial Deluxe Deep would address the kitchen buildup and bathrooms. After that, cleaning every two weeks would help you keep up with them."),
    'explain': ('Explain the price', "For your two-thousand-square-foot home, the required initial Deluxe Deep is $570. After that, it's $220 every two weeks, before extras. The team still needs to confirm availability."),
    'objection': ('Answer the first-visit question', "The first visit costs more because we're tackling the buildup before moving to regular maintenance. Every recurring plan starts with that deep clean. Does that help explain the difference?"),
    'close': ('Agree on the next step', "Would you like me to request the $570 deep clean and the $220 visits every two weeks? I'll ask the team to confirm availability. It isn't booked until they confirm."),
    'clarify': ('Check with a manager', "Let me check the payment and deposit details with my manager before I promise anything."),
    'escalate': ('Explain what needs checking', "I'll write down your question and ask my manager. I can't confirm an exception or a booking yet."),
})

# Version 3 adds short phrase groups and explicit pauses to the same installed voice.
VOICE_VERSION = 'samantha-v3'
VOICE_SEGMENTS = {
 'opening': [("Hi, I'm Taylor.",178,180),("I'm looking for someone to clean our house every other week.",178,140),("Could you give me an idea of the price?",174,0)],
 'discover': [("It's about two thousand square feet.",178,180),("Mostly, I need help with the kitchen and bathrooms.",176,120),("The kitchen's gotten a bit ahead of us.",180,210),("Every other week would be great.",178,160),("Is next week possible?",173,0)],
 'value': [("Yeah, that would help.",176,150),("The kitchen and bathrooms are definitely the priority.",179,0)],
 'explain': [("Okay, so five seventy for the first visit.",172,230),("Then two twenty every other week?",174,240),("Why is the first one so much more?",177,0)],
 'objection': [("Oh, okay.",174,160),("You're getting it back into shape first.",177,180),("Then the regular visits keep it that way.",175,0)],
 'close_ready': [("Yes, let's put in that request.",178,180),("Five hundred seventy for the deep clean, then two hundred twenty every other week.",171,230),("Just let me know what date the team can confirm.",178,180),("I understand it isn't booked yet.",176,0)],
 'close_missing': [("I'm not quite ready yet.",176,210),("Could we go over what I'd get, and what it would cost?",174,140),("I still have a couple of questions.",178,0)],
 'clarify': [("Sure, thank you.",177,180),("Just check with your manager and let me know.",178,0)],
 'escalate': [("Okay, that works.",177,150),("I'll wait until we have an answer before I decide.",176,0)],
 'unsafe': [("Wait, I'm a little confused.",178,200),("That sounds different from the terms you mentioned.",175,170),("Could you double-check?",175,0)],
}
CLIPS = {key:' '.join(part[0] for part in parts) for key,parts in VOICE_SEGMENTS.items()}
