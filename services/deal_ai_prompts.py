"""
services/deal_ai_prompts.py

Prompt builders for the Deal Room feature. Every function returns a plain
prompt string and is meant to be passed to ask_vision_ai_json() (JSON mode)
so the route can render structured cards instead of parsing free text.

IMPORTANT: everything generated here is a *draft for discussion between the
two parties*, not legal advice, and every prompt says so explicitly so the
model doesn't dress its output up as certified legal counsel.
"""

import json

LEGAL_DISCLAIMER_RULE = (
    "This is a draft to help two parties discuss terms, not legal advice. "
    "Never claim the document is legally binding or reviewed by a lawyer. "
    "Do not invent monetary amounts, percentages, dates, or names that "
    "were not given in the terms below — if a field is missing or blank, "
    "write 'To be agreed' instead of guessing a number."
)


def _terms_block(terms):
    return json.dumps(terms, indent=2, default=str)


def generate_contract_prompt(deal_type_label, terms):
    return f"""Draft a professional startup agreement of type "{deal_type_label}"
between a Builder (founder) and the other party, based only on these terms:

{_terms_block(terms)}

{LEGAL_DISCLAIMER_RULE}

Write it like a clean, modern term sheet / agreement — DocuSign-meets-Notion
in tone: clear section headings, short paragraphs, no dense legalese walls.

Return a JSON object with exactly these keys:
{{
  "title": "short contract title, e.g. 'Equity Investment Agreement — {{startup name}}'",
  "sections": [
    {{"heading": "Parties", "body": "..."}},
    {{"heading": "Purpose", "body": "..."}},
    {{"heading": "Investment / Deal Terms", "body": "..."}},
    {{"heading": "Ownership & Equity", "body": "..."}},
    {{"heading": "Rights & Responsibilities", "body": "..."}},
    {{"heading": "Payment Terms", "body": "..."}},
    {{"heading": "Milestones", "body": "..."}},
    {{"heading": "Confidentiality", "body": "..."}},
    {{"heading": "Intellectual Property", "body": "..."}},
    {{"heading": "Dispute Resolution", "body": "..."}},
    {{"heading": "Exit Terms", "body": "..."}},
    {{"heading": "Termination", "body": "..."}},
    {{"heading": "Signatures", "body": "Signature blocks for both parties, with printed name, role, and date."}}
  ],
  "clauses": [
    {{"clause_title": "short label, e.g. '8% Equity'", "clause_text": "the actual clause wording", "plain_english": "one or two plain-English sentences explaining what this really means for the founder"}}
  ]
}}
Include 5-8 entries in "clauses", picked from the most consequential terms
actually present above (equity/investment amount, board seat or control,
milestones/payment schedule, vesting, IP, confidentiality, exclusivity,
exit/termination — whichever apply). Skip a section in "sections" only if
it's genuinely not applicable to this deal type; otherwise keep all of them,
writing "Not applicable to this agreement." if needed."""


def negotiation_change_summary_prompt(deal_type_label, old_terms, new_terms):
    return f"""Compare these two versions of the same {deal_type_label} deal
terms and summarize, in plain English, exactly what changed. Only describe
actual differences — do not invent changes that aren't there.

Previous terms:
{_terms_block(old_terms)}

New terms:
{_terms_block(new_terms)}

Return a JSON object: {{"changes": ["short sentence describing one change", "..."]}}
One short sentence per actual change (e.g. "Equity reduced from 8% to 5%.",
"Quarterly reporting requirement added."). If nothing meaningfully changed,
return {{"changes": ["No material terms changed from the previous version."]}}"""


def risk_and_fairness_prompt(deal_type_label, terms, sections):
    sections_block = "\n".join(f"- {s.get('heading')}: {s.get('body')}" for s in (sections or []))
    return f"""Act as an experienced startup lawyer and deal analyst reviewing
this {deal_type_label} agreement on behalf of the Builder (founder). Be
concrete and specific to the actual terms given — never generic filler.

Terms:
{_terms_block(terms)}

Contract sections:
{sections_block or 'Not yet generated.'}

{LEGAL_DISCLAIMER_RULE}

Return a JSON object with exactly these keys:
{{
  "good_for_you": [{{"text": "favorable term for the Builder", "severity": "green"}}],
  "warnings": [{{"text": "risky or unfavorable clause for the Builder", "severity": "yellow_or_red"}}],
  "missing_clauses": [{{"text": "an important protection that's absent", "severity": "yellow_or_red"}}],
  "fairness": {{
    "builder": 0,
    "other_party": 0,
    "overall": 0,
    "explanation": "1-2 sentence explanation of why the score leans where it does",
    "breakdown": {{
      "equity": 0, "control": 0, "financial_risk": 0,
      "founder_protection": 0, "investor_protection": 0,
      "exit_fairness": 0, "legal_completeness": 0
    }}
  }}
}}
Use "severity" values of exactly "green", "yellow", or "red" (write the
literal word, not "yellow_or_red"). Scores are 0-100 integers, where higher
is more favorable/fair. 2-5 items per list. If a list genuinely has nothing
to report, return an empty array for it rather than padding it."""


def clause_action_prompt(action, clause_text, deal_type_label, context_note=None):
    """Powers the 'Ask VISION AI' per-clause actions: explain, simplify,
    rewrite professionally, make founder/investor-friendly, counter-offer,
    fairness check, or a free-form question about the clause."""
    action_instructions = {
        "explain": "Explain what this clause actually means in plain English, in 2-4 sentences.",
        "simplify": "Rewrite this clause in the simplest possible plain English, as if explaining it to a first-time founder.",
        "rewrite_professional": "Rewrite this clause in clean, professional contract language, keeping the same substance.",
        "founder_friendly": "Rewrite this clause to be more favorable to the Builder/founder, while staying realistic and not absurd — note briefly what changed and why the other party might push back.",
        "investor_friendly": "Rewrite this clause to be more favorable to the investor/other party, while staying realistic — note briefly what changed.",
        "counter_offer": "Propose one realistic, specific counter-offer for this clause the Builder could send back, with a one-sentence rationale.",
        "is_fair": "Assess plainly whether this clause is fair market practice for an early-stage startup deal, and why.",
        "ask": "Answer the Builder's question about this clause as specifically as possible.",
    }
    instruction = action_instructions.get(action, action_instructions["explain"])
    question_block = f"\nThe Builder's question: {context_note}" if action == "ask" and context_note else ""
    return f"""You are reviewing one clause from a {deal_type_label} agreement.

Clause:
\"\"\"{clause_text}\"\"\"
{question_block}

{instruction}

{LEGAL_DISCLAIMER_RULE}
Keep the reply focused on this clause alone."""


def investment_proposal_prompt(pitch):
    return f"""Convert this founder's funding request into a clean, structured
investment proposal a builder can send to an investor inside a chat.

Amount Needed: {pitch.get('amount_needed') or 'Not specified'}
Startup Stage: {pitch.get('stage') or 'Not specified'}
Use of Funds: {pitch.get('use_of_funds') or 'Not specified'}
Equity Offered: {pitch.get('equity_offered') or 'Not specified'}
Milestones: {pitch.get('milestones') or 'Not specified'}
Pitch Summary: {pitch.get('pitch_summary') or 'Not specified'}

{LEGAL_DISCLAIMER_RULE}

Return a JSON object: {{"proposal": "a well-structured 4-6 sentence proposal message, written in first person as the founder, ready to send as a chat message"}}"""
