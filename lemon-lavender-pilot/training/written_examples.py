"""Fictional validation fixtures; no customer data or readiness benchmarks."""
EXAMPLES = {
 ('welcome',2): [
  'Thank you for calling Lemon and Lavender. We provide home cleaning, including deep cleaning and regular cleaning. What would you like help with?',
  "You've reached L&L. We clean homes with weekly visits or a one-time deep clean. Tell me about the areas you need help with."],
 ('conversation',2): [
  'Taylor has a 2,000 sq ft home; kitchen buildup and bathrooms are priorities. Recommend a required initial deep at $570, then $220 biweekly. Taylor said yes to a service request. They requested next week; the team will confirm availability. Payment terms are unconfirmed; manager will clarify. No booking or payment has been confirmed.',
  'Taylor: 2000 square feet; kitchen and bathroom priorities. The initial deep is required at $570. Biweekly visits are $220. Taylor agreed to record a request. Taylor wants next week; manager to check availability. Payment questions need manager confirmation. This is a request only, not a booking.'],
 ('objections',0): [
  "I understand the price matters and you'd like to discuss it with your partner. Are you comparing the first visit, ongoing visits, or the scope?",
  "That's fair; take your time with your partner. Which part of the estimate feels unclear: the initial clean, the regular visits, or the work included?"],
 ('followup',1): [
  'Hi Taylor, this is Lemon and Lavender following up on your cleaning request. Please call us when you have a moment. If there is no answer, I will log the call attempt, time, voicemail outcome, and next approved follow-up.',
  'Hello Taylor, L&L here about your request for cleaning. Could you reply when convenient? For an unanswered call I record the time, channel and no response, along with the next permitted contact in the approved sequence.'],
}
PARTIAL = {
 ('welcome',2): 'Thank you for calling Lemon and Lavender. How is your day going?',
 ('conversation',2): 'Taylor has a 2,000 sq ft home, with kitchen buildup and bathrooms as the priority.',
 ('objections',0): 'I understand the price matters and you want to talk to your partner. Take your time.',
 ('followup',1): 'This is Lemon and Lavender following up on your cleaning request. Please reply when convenient.',
}
