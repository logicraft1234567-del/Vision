"""
Vision reputation system.

Single source of truth for turning a user's stats into a reputation
icon + color + rank title. Everything (dashboard, project cards,
comments, messages, profile, search, collaboration requests) should
go through get_user_reputation() so the icon logic never gets
duplicated across templates/JS.
"""

# ---------------------------------------------------------------------------
# Builder — based on total likes across all of their projects
# ---------------------------------------------------------------------------
BUILDER_RANKS = [
    # (min_likes, rank title, lucide icon name, color hex)
    (10000, "Legend", "crown", "#F59E0B"),
    (1000, "Elite", "sparkles", "#FBBF24"),
    (100, "Level 5", "circle-check", "#A855F7"),
    (50, "Level 4", "circle-check", "#3B82F6"),
    (20, "Level 3", "circle-check", "#22C55E"),
    (10, "Level 2", "circle-check", "#FACC15"),
    (0, "Beginner", "circle-check", "#FFFFFF"),
]

# ---------------------------------------------------------------------------
# Investor — based on engagement points + collaboration/funding milestones
# ---------------------------------------------------------------------------
# Each tier's requirement is checked top-down; the first one the investor
# qualifies for wins.
INVESTOR_RANKS = [
    # (rank title, icon, color, unlock check key)
    ("Vision Legend", "plane", "#A855F7", "projects_helped"),        # 10+ projects helped
    ("Elite Investor", "sailboat", "#06B6D4", "projects_funded"),    # a project funded & launched
    ("Collaborator", "car", "#3B82F6", "successful_collaborations"),  # 1+ successful collab/investment
    ("Active", "bike", "#22C55E", "engagement_points"),              # 30+ engagement points
    ("Beginner", "bike", "#C0C0C0", None),
]

# ---------------------------------------------------------------------------
# Company — based on company points + verified partnership milestones
# ---------------------------------------------------------------------------
COMPANY_RANKS = [
    # (min_points, rank title, letter, color hex, filled)
    (500, "Gold Tier", "C", "#FBBF24", True),
    (200, "Tier C", "C", "#A855F7", False),
    (50, "Tier B", "B", "#3B82F6", False),
    (0, "Beginner", "A", "#9CA3AF", False),
]


def _builder_total_likes(user):
    projects = getattr(user, "projects", None) or []
    return sum(getattr(p, "like_count", 0) for p in projects)


def get_builder_reputation(total_likes):
    for min_likes, title, icon, color in BUILDER_RANKS:
        if total_likes >= min_likes:
            return {
                "kind": "icon",
                "icon": icon,
                "color": color,
                "rank": title,
                "label": f"{title} Builder \u2022 {total_likes} likes",
            }
    # unreachable (0 threshold always matches) but keep a safe fallback
    return {
        "kind": "icon",
        "icon": "circle-check",
        "color": "#FFFFFF",
        "rank": "Beginner",
        "label": "Beginner Builder",
    }


def get_investor_reputation(engagement_points=0, successful_collaborations=0,
                             projects_funded=0, projects_helped=0):
    stats = {
        "engagement_points": engagement_points >= 30,
        "successful_collaborations": successful_collaborations >= 1,
        "projects_funded": projects_funded >= 1,
        "projects_helped": projects_helped >= 10,
    }
    for title, icon, color, key in INVESTOR_RANKS:
        if key is None or stats.get(key):
            return {
                "kind": "icon",
                "icon": icon,
                "color": color,
                "rank": title,
                "label": f"{title} Investor",
            }
    return {
        "kind": "icon",
        "icon": "bike",
        "color": "#C0C0C0",
        "rank": "Beginner",
        "label": "Beginner Investor",
    }


def get_company_reputation(company_points=0, verified_partnerships=0):
    # Gold tier is a milestone (verified partnerships), not just points.
    if verified_partnerships >= 3:
        min_points, title, letter, color, filled = COMPANY_RANKS[0]
        return {
            "kind": "letter",
            "letter": letter,
            "color": color,
            "filled": filled,
            "rank": title,
            "label": f"{title} Company",
        }
    for min_points, title, letter, color, filled in COMPANY_RANKS[1:]:
        if company_points >= min_points:
            return {
                "kind": "letter",
                "letter": letter,
                "color": color,
                "filled": filled,
                "rank": title,
                "label": f"{title} Company",
            }
    return {
        "kind": "letter",
        "letter": "A",
        "color": "#9CA3AF",
        "filled": False,
        "rank": "Beginner",
        "label": "Beginner Company",
    }


def get_user_reputation(user):
    """Dispatch on user.role and pull the stats needed from their profile."""
    if user is None:
        return None

    if user.role == "builder":
        return get_builder_reputation(_builder_total_likes(user))

    if user.role == "investor":
        profile = getattr(user, "investor_profile", None)
        return get_investor_reputation(
            engagement_points=getattr(profile, "engagement_points", 0) or 0,
            successful_collaborations=getattr(profile, "successful_collaborations", 0) or 0,
            projects_funded=getattr(profile, "projects_funded", 0) or 0,
            projects_helped=getattr(profile, "projects_helped", 0) or 0,
        )

    if user.role == "company":
        profile = getattr(user, "company_profile", None)
        return get_company_reputation(
            company_points=getattr(profile, "company_points", 0) or 0,
            verified_partnerships=getattr(profile, "verified_partnerships", 0) or 0,
        )

    return None


def reputation_to_dict(rep):
    """JSON-safe copy of a reputation dict for API responses."""
    if not rep:
        return None
    return dict(rep)


# ---------------------------------------------------------------------------
# Profile page: current rank + progress toward the next rank
# ---------------------------------------------------------------------------

def get_builder_progress(user):
    total_likes = _builder_total_likes(user)
    rep = get_builder_reputation(total_likes)
    # BUILDER_RANKS is ordered highest-first; walk it low-to-high to find "next".
    ordered = list(reversed(BUILDER_RANKS))  # [(0,...), (10,...), ... (10000,...)]
    next_rank = None
    for min_likes, title, icon, color in ordered:
        if min_likes > total_likes:
            next_rank = {"rank": title, "icon": icon, "color": color, "threshold": min_likes}
            break
    progress = None
    if next_rank:
        # find current tier's floor for a 0-1 progress bar between tiers
        floor = 0
        for min_likes, *_ in ordered:
            if min_likes <= total_likes:
                floor = min_likes
        span = max(1, next_rank["threshold"] - floor)
        progress = min(1.0, max(0.0, (total_likes - floor) / span))
    return {
        "current": rep,
        "stat_label": f"{total_likes} total likes",
        "next_rank": next_rank,
        "progress": progress,
    }


def get_investor_progress(user):
    profile = getattr(user, "investor_profile", None)
    engagement_points = getattr(profile, "engagement_points", 0) or 0
    successful_collaborations = getattr(profile, "successful_collaborations", 0) or 0
    projects_funded = getattr(profile, "projects_funded", 0) or 0
    projects_helped = getattr(profile, "projects_helped", 0) or 0
    rep = get_investor_reputation(engagement_points, successful_collaborations, projects_funded, projects_helped)

    # Ordered lowest-to-highest with the stat + goal needed to unlock each.
    ladder = [
        {"rank": "Beginner", "icon": "bike", "color": "#C0C0C0"},
        {"rank": "Active", "icon": "bike", "color": "#22C55E", "need": "30+ engagement points", "have": engagement_points, "goal": 30},
        {"rank": "Collaborator", "icon": "car", "color": "#3B82F6", "need": "1 successful collaboration/investment", "have": successful_collaborations, "goal": 1},
        {"rank": "Elite Investor", "icon": "sailboat", "color": "#06B6D4", "need": "a project funded & launched", "have": projects_funded, "goal": 1},
        {"rank": "Vision Legend", "icon": "plane", "color": "#A855F7", "need": "10+ projects helped succeed", "have": projects_helped, "goal": 10},
    ]
    current_index = next((i for i, tier in enumerate(ladder) if tier["rank"] == rep["rank"]), 0)
    next_rank = ladder[current_index + 1] if current_index + 1 < len(ladder) else None
    progress = None
    if next_rank:
        progress = min(1.0, max(0.0, next_rank["have"] / next_rank["goal"])) if next_rank["goal"] else None
    return {
        "current": rep,
        "stat_label": f"{engagement_points} engagement points",
        "next_rank": next_rank,
        "progress": progress,
    }


def get_company_progress(user):
    profile = getattr(user, "company_profile", None)
    company_points = getattr(profile, "company_points", 0) or 0
    verified_partnerships = getattr(profile, "verified_partnerships", 0) or 0
    rep = get_company_reputation(company_points, verified_partnerships)

    ordered = list(reversed(COMPANY_RANKS[1:]))  # Beginner -> Tier B -> Tier C, points-based
    next_rank = None
    for min_points, title, letter, color, filled in ordered:
        if min_points > company_points and rep["rank"] != "Gold Tier":
            next_rank = {"rank": title, "letter": letter, "color": color, "threshold": min_points}
            break
    if rep["rank"] != "Gold Tier" and not next_rank and verified_partnerships < 3:
        min_points, title, letter, color, filled = COMPANY_RANKS[0]
        next_rank = {"rank": title, "letter": letter, "color": color, "threshold": None,
                     "need": "3 verified partnerships", "have": verified_partnerships, "goal": 3}

    progress = None
    if next_rank and next_rank.get("threshold") is not None:
        floor = 0
        for min_points, *_ in ordered:
            if min_points <= company_points:
                floor = min_points
        span = max(1, next_rank["threshold"] - floor)
        progress = min(1.0, max(0.0, (company_points - floor) / span))
    elif next_rank and next_rank.get("goal"):
        progress = min(1.0, max(0.0, next_rank["have"] / next_rank["goal"]))

    return {
        "current": rep,
        "stat_label": f"{company_points} company points",
        "next_rank": next_rank,
        "progress": progress,
    }


def get_reputation_progress(user):
    """Current rank + how close the user is to the next one, for the profile page."""
    if user is None:
        return None
    if user.role == "builder":
        return get_builder_progress(user)
    if user.role == "investor":
        return get_investor_progress(user)
    if user.role == "company":
        return get_company_progress(user)
    return None


# ---------------------------------------------------------------------------
# Help page: the full ladder of ranks for each role, for the badge guide
# ---------------------------------------------------------------------------

def help_badge_data():
    """Static reference data describing every rank, for the 'Understanding Badges' page."""
    builder_rows = [
        {"rank": title, "kind": "icon", "icon": icon, "color": color,
         "requirement": "New builder" if min_likes == 0 else f"{min_likes:,} total likes"}
        for min_likes, title, icon, color in BUILDER_RANKS
    ]
    investor_rows = [
        {"rank": "Vision Legend", "kind": "icon", "icon": "plane", "color": "#A855F7", "requirement": "Helped 10+ projects succeed"},
        {"rank": "Elite Investor", "kind": "icon", "icon": "sailboat", "color": "#06B6D4", "requirement": "A project funded & launched"},
        {"rank": "Collaborator", "kind": "icon", "icon": "car", "color": "#3B82F6", "requirement": "1+ successful collaboration/investment"},
        {"rank": "Active", "kind": "icon", "icon": "bike", "color": "#22C55E", "requirement": "30+ engagement points"},
        {"rank": "Beginner", "kind": "icon", "icon": "bike", "color": "#C0C0C0", "requirement": "New investor"},
    ]
    company_rows = [
        {"rank": "Gold Tier", "kind": "letter", "letter": "C", "color": "#FBBF24", "filled": True, "requirement": "3+ verified partnerships"},
        {"rank": "Tier C", "kind": "letter", "letter": "C", "color": "#A855F7", "filled": False, "requirement": "200+ company points"},
        {"rank": "Tier B", "kind": "letter", "letter": "B", "color": "#3B82F6", "filled": False, "requirement": "50+ company points"},
        {"rank": "Beginner", "kind": "letter", "letter": "A", "color": "#9CA3AF", "filled": False, "requirement": "New company"},
    ]
    return {
        "builder": builder_rows,
        "investor": investor_rows,
        "company": company_rows,
    }