"""
Notification creation & badge-congrats helpers.

Keeping this in one place (instead of scattering db.session.add(Notification(...))
calls across app.py) means the categorization rules, throttling, and badge
logic have exactly one home. Every route that should notify someone calls
one of the functions below.
"""

from datetime import datetime, timedelta

from database import db
from models import Notification

# Cooldown so an obsessive profile-refresher (or a bug re-firing a route)
# doesn't spam the same recipient with duplicate notifications.
PROFILE_VIEW_COOLDOWN = timedelta(hours=6)
LIKE_COOLDOWN = timedelta(minutes=1)  # like/unlike/like toggling shouldn't spam

CATEGORY_LABELS = {
    Notification.CATEGORY_MESSAGES: "Messages",
    Notification.CATEGORY_ENGAGEMENT: "Engagement",
    Notification.CATEGORY_COLLABORATION: "Collaboration",
    Notification.CATEGORY_PROFILE: "Profile Views",
    Notification.CATEGORY_ACHIEVEMENTS: "Achievements",
}

# type -> icon name used by the frontend (matches _icons.html names already
# used elsewhere in the app, so no new icon assets are needed).
TYPE_ICONS = {
    "message": "message",
    "like": "heart",
    "comment": "message",
    "reply": "message",
    "save": "bookmark",
    "profile_view": "user-search",
    "collab_request": "users",
    "collab_accepted": "check-circle",
    "collab_declined": "x",
    "badge": "sparkles",  # special-cased on the frontend (uses the reputation sparkle icon)
}


def _create(user_id, category, type_, text, actor_id=None, link=None, project_id=None, conversation_id=None):
    """Low-level insert. Never notify a user about their own action."""
    if actor_id is not None and actor_id == user_id:
        return None
    notif = Notification(
        user_id=user_id,
        actor_id=actor_id,
        category=category,
        type=type_,
        text=text,
        link=link,
        project_id=project_id,
        conversation_id=conversation_id,
    )
    db.session.add(notif)
    return notif


def _recent_duplicate_exists(user_id, actor_id, type_, project_id, cooldown):
    cutoff = datetime.utcnow() - cooldown
    return (
        Notification.query.filter(
            Notification.user_id == user_id,
            Notification.actor_id == actor_id,
            Notification.type == type_,
            Notification.project_id == project_id,
            Notification.created_at >= cutoff,
        ).first()
        is not None
    )


# ---------------------------------------------------------------------------
# Engagement: likes, comments, replies, saves
# ---------------------------------------------------------------------------

def notify_like(project, actor):
    if _recent_duplicate_exists(project.owner_id, actor.id, "like", project.id, LIKE_COOLDOWN):
        return None
    return _create(
        user_id=project.owner_id,
        category=Notification.CATEGORY_ENGAGEMENT,
        type_="like",
        text=f"{actor.display_name} liked your project \u201c{project.project_name}\u201d",
        actor_id=actor.id,
        link=f"/dashboard/browse#project-{project.id}",
        project_id=project.id,
    )


def notify_save(project, actor):
    return _create(
        user_id=project.owner_id,
        category=Notification.CATEGORY_ENGAGEMENT,
        type_="save",
        text=f"{actor.display_name} saved your project \u201c{project.project_name}\u201d",
        actor_id=actor.id,
        link=f"/dashboard/browse#project-{project.id}",
        project_id=project.id,
    )


def notify_comment(project, actor, comment):
    """Notifies the project owner about a top-level comment, and — separately
    — the parent comment's author when it's a reply (unless that's the same
    person, e.g. owner replying to their own comment thread)."""
    _create(
        user_id=project.owner_id,
        category=Notification.CATEGORY_ENGAGEMENT,
        type_="comment",
        text=f"{actor.display_name} commented on \u201c{project.project_name}\u201d",
        actor_id=actor.id,
        link=f"/dashboard/browse#project-{project.id}",
        project_id=project.id,
    )
    if comment.parent_id and comment.parent and comment.parent.user_id != project.owner_id:
        _create(
            user_id=comment.parent.user_id,
            category=Notification.CATEGORY_ENGAGEMENT,
            type_="reply",
            text=f"{actor.display_name} replied to your comment on \u201c{project.project_name}\u201d",
            actor_id=actor.id,
            link=f"/dashboard/browse#project-{project.id}",
            project_id=project.id,
        )


# ---------------------------------------------------------------------------
# Collaboration
# ---------------------------------------------------------------------------

def notify_collab_request(collab_request):
    return _create(
        user_id=collab_request.owner_id,
        category=Notification.CATEGORY_COLLABORATION,
        type_="collab_request",
        text=f"{collab_request.applicant.display_name} applied to collaborate on \u201c{collab_request.project.project_name}\u201d",
        actor_id=collab_request.applicant_id,
        link="/dashboard/builder/collaboration-requests",
        project_id=collab_request.project_id,
    )


def notify_collab_accepted(collab_request):
    return _create(
        user_id=collab_request.applicant_id,
        category=Notification.CATEGORY_COLLABORATION,
        type_="collab_accepted",
        text=f"You're now a collaborator on \u201c{collab_request.project.project_name}\u201d",
        actor_id=collab_request.owner_id,
        link=f"/dashboard/browse#project-{collab_request.project_id}",
        project_id=collab_request.project_id,
    )


def notify_collab_declined(collab_request):
    return _create(
        user_id=collab_request.applicant_id,
        category=Notification.CATEGORY_COLLABORATION,
        type_="collab_declined",
        text=f"Your application to \u201c{collab_request.project.project_name}\u201d wasn't accepted this time",
        actor_id=collab_request.owner_id,
        link="/dashboard/browse",
        project_id=collab_request.project_id,
    )


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

def notify_new_message(conversation, sender, message):
    """Notifies every other member of the conversation (handles both 1:1 DMs
    and group/team chats) unless the sender is the VISION AI bot itself."""
    if getattr(sender, "is_vision_ai", False):
        return
    for member in conversation.members:
        if member.user_id == sender.id:
            continue
        _create(
            user_id=member.user_id,
            category=Notification.CATEGORY_MESSAGES,
            type_="message",
            text=(
                f"{sender.display_name} sent a message in {conversation.project.project_name}"
                if conversation.is_group and conversation.project
                else f"{sender.display_name} sent you a message"
            ),
            actor_id=sender.id,
            link=f"/messages/{conversation.id}",
            conversation_id=conversation.id,
        )


# ---------------------------------------------------------------------------
# Profile views
# ---------------------------------------------------------------------------

def notify_profile_view(viewed_user, viewer):
    if _recent_duplicate_exists(viewed_user.id, viewer.id, "profile_view", None, PROFILE_VIEW_COOLDOWN):
        return None
    return _create(
        user_id=viewed_user.id,
        category=Notification.CATEGORY_PROFILE,
        type_="profile_view",
        text=f"{viewer.display_name} viewed your profile",
        actor_id=viewer.id,
        link=f"/api/users/{viewer.id}/profile",
    )


# ---------------------------------------------------------------------------
# Badge / reputation congrats
# ---------------------------------------------------------------------------

def check_and_award_badge(user):
    """Call this after any action that could move `user`'s reputation
    (a like/save/comment landing on their project, a collaboration being
    accepted, etc). Compares the current reputation *rank* — the discrete
    tier name like "Level 2" or "Elite", not the (possibly more dynamic)
    tooltip label — against the last one we congratulated them for, and
    fires a one-time "achievements" notification only when it actually
    changes tiers. Returns the new badge dict if a fresh congrats
    notification was created, else None — callers can use the return
    value to also push a celebratory toast in the same response.

    Deliberately keyed on `rank`, not `label`: `label` is meant for a
    hover tooltip and isn't guaranteed to be static within a tier, so
    comparing against it can fire on every single like instead of only
    on level-ups.
    """
    rep = user.reputation
    rank = rep.get("rank") if rep else None
    if not rank:
        return None
    if user.last_badge_label == rank:
        return None

    is_first_badge = user.last_badge_label is None
    user.last_badge_label = rank

    # Don't congratulate brand-new users for simply having a starting rank —
    # only for progressing to a new one.
    if is_first_badge:
        return None

    _create(
        user_id=user.id,
        category=Notification.CATEGORY_ACHIEVEMENTS,
        type_="badge",
        text=f"You leveled up to {rank}! \U0001F389",
        link="/help/badges",
    )
    return rep


# ---------------------------------------------------------------------------
# Reading notifications back out
# ---------------------------------------------------------------------------

def get_notifications(user, category=None, limit=50):
    query = Notification.query.filter_by(user_id=user.id)
    if category and category != "all":
        query = query.filter_by(category=category)
    return query.order_by(Notification.created_at.desc()).limit(limit).all()