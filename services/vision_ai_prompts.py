"""
services/vision_ai_prompts.py

Every VISION AI prompt lives here so the wording only needs to be tuned
once. Each function takes plain dicts (already pulled from the DB by the
Flask route) and returns a prompt string ready to hand to ask_vision_ai().
"""


def project_review_prompt(project):
    return f"""Review this startup project and act as a sharp startup mentor.

Project Name: {project.get('project_name')}
Category: {project.get('category')}
Stage: {project.get('stage')}
Overview: {project.get('overview') or 'Not provided'}
Inspiration: {project.get('inspiration') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}

Return a JSON object with exactly these keys:
{{
  "summary": "2-3 sentence summary of the project",
  "strengths": ["short strength", "..."],
  "weaknesses": ["short weakness", "..."],
  "missing_info": ["important info missing from this project page", "..."],
  "suggestions": ["concrete, actionable next step", "..."]
}}
Keep each list to 3-5 items. Be honest and specific, not generic."""


def improve_pitch_prompt(project):
    return f"""Rewrite this startup's pitch so it reads as professional and
investor-ready, while keeping the founder's original idea, facts, and voice
intact. Do not invent features, traction, or numbers that weren't given.

Project Name: {project.get('project_name')}
Current Overview: {project.get('overview') or 'Not provided'}
Current Problem: {project.get('problem') or 'Not provided'}
Current Solution: {project.get('solution') or 'Not provided'}

Return a JSON object with exactly these keys:
{{
  "overview": "improved overview, 2-4 sentences",
  "problem": "improved problem statement, 2-3 sentences",
  "solution": "improved solution statement, 2-3 sentences"
}}"""


def startup_roadmap_prompt(project):
    return f"""Build a realistic startup roadmap for this project.

Project Name: {project.get('project_name')}
Category: {project.get('category')}
Stage: {project.get('stage')}
Overview: {project.get('overview') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}

Return a JSON object with exactly these keys:
{{
  "mvp": ["feature or task to build first", "..."],
  "beta": ["feature or task to add after MVP", "..."],
  "launch": ["growth or monetization idea for launch", "..."]
}}
3-6 items per list, specific to this project — not generic startup advice."""


def startup_chat_prompt(question, project=None):
    project_block = ""
    if project:
        project_block = f"""
The builder is asking about this specific project:
Project Name: {project.get('project_name')}
Overview: {project.get('overview') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}
Stage: {project.get('stage')}
"""
    return f"""{project_block}
The builder's question: {question}

Answer directly and practically. Use the project details above if relevant.
If you don't have enough information to answer specifically, say what's
missing and give general best-practice guidance instead."""


def investment_analysis_prompt(project):
    return f"""Analyze this startup project from an investor's point of view.
Do NOT invent valuations, funding amounts, or market-size numbers — if you
don't have real data to base a number on, describe it qualitatively instead.

Project Name: {project.get('project_name')}
Category: {project.get('category')}
Stage: {project.get('stage')}
Overview: {project.get('overview') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}
Open for investment: {project.get('investment_open')}

Return a JSON object with exactly these keys:
{{
  "summary": "2-3 sentence startup summary",
  "market_potential": "qualitative assessment",
  "technical_difficulty": "qualitative assessment",
  "revenue_potential": "qualitative assessment, no invented numbers",
  "biggest_risks": ["risk", "..."],
  "biggest_opportunities": ["opportunity", "..."],
  "suggested_questions": ["due-diligence question to ask the builder", "..."]
}}
3-5 items per list."""


def due_diligence_questions_prompt(project):
    return f"""Generate sharp due-diligence questions an investor should ask
the builder of this project before deciding whether to invest or collaborate.

Project Name: {project.get('project_name')}
Overview: {project.get('overview') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}
Stage: {project.get('stage')}

Return a JSON object: {{"questions": ["question", "..."]}}
6-8 specific, non-generic questions."""


def partnership_suggestions_prompt(company, candidate_projects):
    projects_block = "\n".join(
        f"- \"{p['project_name']}\" by @{p['owner_username']} "
        f"(category: {p['category']}, stage: {p['stage']}): {p['overview'] or 'No overview'}"
        for p in candidate_projects
    ) or "No public projects are currently available."

    return f"""A company is looking for startups to partner with.

Company: {company.get('company_name')}
Industry: {company.get('industry') or 'Not specified'}
Bio: {company.get('bio') or 'Not provided'}

Here are real public projects currently on the platform:
{projects_block}

From ONLY the list above, pick the best matches for this company (up to 5).
Do not invent projects that aren't in the list.

Return a JSON object:
{{"suggestions": [{{"project_name": "...", "owner_username": "...", "reason": "1-2 sentence reason this fits the company"}}]}}
If nothing in the list is a good fit, return an empty suggestions list."""


def outreach_message_prompt(company, target):
    return f"""Write a short, professional outreach message from a company to
a startup builder, proposing a conversation about a potential partnership.

From company: {company.get('company_name')} ({company.get('industry') or 'industry not specified'})
To builder: @{target.get('username')}, project "{target.get('project_name') or 'their project'}"

Keep it warm, specific, and under 120 words. No invented facts about either
party. Return a JSON object: {{"message": "the outreach message"}}"""


def chat_mention_prompt(asker_name, question, thread_context=None):
    """Used when someone types @VISIONAI inside a direct message or team
    chat thread with other real people. Keep it short — it's dropping into
    an ongoing human conversation, not a private copilot session."""
    history_block = ""
    if thread_context:
        history_block = "\nRecent messages in this conversation for context:\n" + thread_context

    return f"""You were just tagged with @VISIONAI inside a chat conversation
between real people on the VISION platform (builders/investors/companies
talking directly to each other). {asker_name} tagged you and asked:

"{question}"
{history_block}

Reply directly to what was asked, addressed to the group. Don't repeat the
question back, don't introduce yourself, and don't say "as an AI" — just
answer like a helpful teammate would. If the question depends on
information you don't have, say plainly what's missing instead of
guessing."""


def universal_chat_prompt(question, user_context):
    return f"""A {user_context.get('user_role')} on the VISION platform is
currently on the "{user_context.get('page') or 'dashboard'}" page and asks:

"{question}"

Answer helpfully as their startup copilot, using only the context you've
been given. If you need information you don't have, ask a clarifying
question or say plainly what's missing."""


def find_matches_prompt(project, candidate_backers):
    """Builder-facing matchmaking: from REAL investor/company profiles
    already on the platform, pick who's actually worth reaching out to for
    this specific project, and why. Never invent a backer that isn't in
    the candidate list."""
    candidates_block = "\n".join(
        f"- id:{c['id']} | @{c['username']} | {c['role']} | "
        f"{'industry: ' + c['industry'] if c.get('industry') else 'type: ' + (c.get('investor_type') or 'unspecified')} | "
        f"bio: {c['bio'] or 'not provided'}"
        for c in candidate_backers
    ) or "No investor or company profiles are currently available on the platform."

    return f"""A builder wants to know which real investors or companies on
the platform are worth reaching out to about their project.

Project Name: {project.get('project_name')}
Category: {project.get('category')}
Stage: {project.get('stage')}
Overview: {project.get('overview') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}
Open for investment: {project.get('investment_open')}

Candidates currently on the platform (ONLY pick from this list — never
invent a person, company, or profile that isn't here; if nothing here is a
good fit, say so honestly rather than forcing a match):
{candidates_block}

Return a JSON object with exactly this shape:
{{
  "matches": [
    {{"id": <candidate id from the list above, as a number>, "username": "...", "fit_reason": "1-2 sentence honest reason this specific candidate fits, referencing their real industry/bio/type", "how_to_approach": "one concrete, specific tip for how to pitch this project to this particular candidate"}}
  ],
  "no_match_note": "if the candidate list is empty or truly nothing fits, explain why honestly here — otherwise empty string"
}}
Return at most 5 matches, best fit first. Quality over quantity — a short
honest list beats padding it with weak fits."""


def risk_analysis_prompt(project):
    """Blunt, protective risk assessment for the BUILDER (not an investor's
    due diligence) — what could realistically kill or stall this project,
    stated plainly enough to actually act on."""
    return f"""Give this builder a brutally honest risk assessment of their
own project — the kind of thing a mentor who actually wants them to
succeed would say, not vague hedging. Do not invent competitors, market
data, or numbers you don't have — describe risks qualitatively and say
plainly where you're speculating vs where something in the project
description itself is the warning sign.

Project Name: {project.get('project_name')}
Category: {project.get('category')}
Stage: {project.get('stage')}
Overview: {project.get('overview') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}

Return a JSON object with exactly these keys:
{{
  "critical_risks": ["the risks most likely to actually kill this project if ignored — be specific to THIS project, not generic startup advice", "..."],
  "market_risks": ["risks about demand, timing, or competition"],
  "execution_risks": ["risks about the team, technical difficulty, or scope actually getting built"],
  "legal_or_ethical_risks": ["any regulatory, privacy, safety, or ethical exposure worth knowing about now — empty list if genuinely none apply"],
  "how_to_derisk": ["concrete, doable-this-month action that would reduce one of the risks above", "..."]
}}
3-5 items per list except legal_or_ethical_risks, which can be empty. Be
honest even if that means saying an idea has a serious flaw — a builder who
hears this now is better off than one who hears it after burning months on it."""


def scale_plan_prompt(project):
    """Beyond MVP/launch — a growth/scale roadmap for making the project
    into something big, grounded in what's actually plausible from here."""
    return f"""This builder already has a roadmap to launch. Now they want to
know: what does it realistically take to grow this from a launched product
into something big? Be ambitious but grounded — describe growth levers and
milestones, not guaranteed outcomes, and don't invent funding amounts,
user numbers, or revenue figures that weren't given to you.

Project Name: {project.get('project_name')}
Category: {project.get('category')}
Stage: {project.get('stage')}
Overview: {project.get('overview') or 'Not provided'}
Problem: {project.get('problem') or 'Not provided'}
Solution: {project.get('solution') or 'Not provided'}

Return a JSON object with exactly these keys:
{{
  "growth_levers": ["a specific way this project could realistically grow its user base or revenue, given what it actually does", "..."],
  "milestones": ["a concrete, ordered milestone on the path to scale — e.g. a metric to hit or capability to build, roughly in order", "..."],
  "partnership_ideas": ["a type of partner, platform, or channel worth pursuing at scale, specific to this project's category/audience", "..."],
  "warning_signs_to_watch": ["a signal that would mean the growth plan needs to change course", "..."]
}}
3-6 items per list. Ambitious language is fine — invented facts are not."""


def supercharge_pitch_prompt(draft):
    """Used from the CREATE PROJECT form itself, before anything is saved —
    takes whatever the builder has typed so far (even partial) and returns
    a dramatically stronger rewrite. Can be called repeatedly, each time
    starting from whatever the current form text is, so the builder can
    keep regenerating. Amplify clarity, hook, and persuasive framing —
    never invent features, traction, numbers, or users that aren't implied
    by the draft."""
    return f"""A builder is filling out a new project listing and wants you
to make their pitch dramatically more compelling — sharper, punchier, more
exciting to read — while staying 100% honest about what the project
actually is. This is a REWRITE task, not a fact-generation task: you may
sharpen framing, cut filler, add energy, and make the value proposition
land harder, but you must NEVER invent features, user numbers, revenue,
traction, or capabilities that aren't already implied by the draft below.
If the draft is thin (e.g. just a project name), work with what's there
and keep the result honestly scoped rather than padding it with invented
specifics.

Project Name: {draft.get('project_name') or 'Not provided yet'}
Category: {draft.get('category') or 'Not specified'}
Current Overview: {draft.get('overview') or 'Not provided yet'}
Current Problem: {draft.get('problem') or 'Not provided yet'}
Current Solution: {draft.get('solution') or 'Not provided yet'}

Return a JSON object with exactly these keys:
{{
  "tagline": "one punchy one-line hook for this project, under 12 words",
  "overview": "a dramatically sharper, more compelling overview, 2-4 sentences — same facts, way more impact",
  "problem": "a sharper, more urgent-feeling problem statement, 2-3 sentences",
  "solution": "a sharper, more confident solution statement, 2-3 sentences",
  "honesty_note": "one short sentence flagging anything you deliberately did NOT embellish because there wasn't enough in the draft to honestly support it — empty string if nothing applies"
}}"""
# --------------------------------------------------------------------------
# ADD THESE to services/vision_ai_prompts.py (not uploaded, so pasted here
# separately). Follow the same JSON-instruction style as your existing
# project_review_prompt / investment_analysis_prompt functions.
# --------------------------------------------------------------------------

def startup_score_prompt(project):
    """AI Startup Score — instant feedback on startup quality."""
    return f"""
You are VISION AI. Score the overall quality of this startup on a 0-100 scale
based only on the information given below. Be honest, not flattering.

Project:
{project}

Respond ONLY with JSON in this exact shape:
{{
  "score": <integer 0-100>,
  "verdict": "<1-2 sentence plain-language explanation of the score>",
  "strengths": ["<short strength>", ...],
  "weaknesses": ["<short weakness>", ...]
}}
""".strip()


def pitch_practice_prompt(project):
    """AI Pitch Practice — mock investor Q&A to prep founders for real meetings."""
    return f"""
You are VISION AI, running a mock investor Q&A session to help this founder
prepare for a real pitch meeting. Base every question strictly on the project
details below — do not invent facts about the company.

Project:
{project}

Respond ONLY with JSON in this exact shape:
{{
  "likely_questions": ["<tough, realistic investor question>", ...],
  "coaching_notes": "<short paragraph of general coaching advice for how to answer confidently>"
}}
""".strip()


def weekly_advisor_prompt(display_name, projects):
    """AI Weekly Startup Advisor — personalized recommendations every week."""
    return f"""
You are VISION AI, giving {display_name} their weekly startup check-in.
Base your advice only on the projects listed below (there may be more than one).

Projects:
{projects}

Respond ONLY with JSON in this exact shape:
{{
  "summary": "<1-2 sentence overview of what to focus on this week>",
  "recommendations": ["<concrete, actionable recommendation>", ...]
}}
""".strip()


def compare_startups_prompt(projects):
    """AI Compare Startups — lets investors compare investment opportunities."""
    return f"""
You are VISION AI, helping an investor compare {len(projects)} startups
side by side. Base your comparison strictly on the data below.

Projects:
{projects}

Respond ONLY with JSON in this exact shape:
{{
  "comparisons": [
    {{"project_name": "<name>", "verdict": "<1 sentence assessment of this one>"}},
    ...
  ],
  "recommendation": "<1-2 sentences on which looks strongest and why, with appropriate caveats>"
}}
""".strip()
