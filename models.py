from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from database import db
from reputation import get_user_reputation


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(20), nullable=False)  # builder, investor, company
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    builder_profile = db.relationship("BuilderProfile", backref="user", uselist=False, cascade="all, delete-orphan")
    investor_profile = db.relationship("InvestorProfile", backref="user", uselist=False, cascade="all, delete-orphan")
    company_profile = db.relationship("CompanyProfile", backref="user", uselist=False, cascade="all, delete-orphan")

    # Tracks the reputation badge label this user was last congratulated for
    # (see notifications.check_and_award_badge). Lets us fire a "new badge"
    # notification only the first time a rank is reached, not on every
    # request that happens to recompute the same reputation.
    last_badge_label = db.Column(db.String(80), nullable=True)

    projects = db.relationship("Project", backref="owner", cascade="all, delete-orphan")
    likes = db.relationship("Like", backref="user", cascade="all, delete-orphan")
    comments = db.relationship("Comment", backref="user", cascade="all, delete-orphan")
    saved_projects = db.relationship("SavedProject", backref="user", cascade="all, delete-orphan")
    notifications = db.relationship(
        "Notification", foreign_keys="Notification.user_id", backref="recipient",
        cascade="all, delete-orphan", order_by="Notification.created_at.desc()",
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def display_name(self):
        if self.role == "vision_ai":
            return "VISION AI"
        if self.role == "builder" and self.builder_profile:
            return self.builder_profile.full_name
        if self.role == "investor" and self.investor_profile:
            return self.investor_profile.full_name
        if self.role == "company" and self.company_profile:
            return self.company_profile.company_name
        return self.username

    @property
    def is_vision_ai(self):
        return self.role == "vision_ai"

    @property
    def avatar_url(self):
        if self.role == "builder" and self.builder_profile and self.builder_profile.profile_picture:
            return "/static/uploads/profile/" + self.builder_profile.profile_picture
        if self.role == "investor" and self.investor_profile and self.investor_profile.profile_picture:
            return "/static/uploads/profile/" + self.investor_profile.profile_picture
        if self.role == "company" and self.company_profile and self.company_profile.logo:
            return "/static/uploads/profile/" + self.company_profile.logo
        return None

    @property
    def bio(self):
        if self.role == "builder" and self.builder_profile:
            return self.builder_profile.bio
        if self.role == "investor" and self.investor_profile:
            return self.investor_profile.bio
        if self.role == "company" and self.company_profile:
            return self.company_profile.bio
        return None

    @property
    def country(self):
        if self.role == "builder" and self.builder_profile:
            return self.builder_profile.country
        if self.role == "investor" and self.investor_profile:
            return self.investor_profile.country
        if self.role == "company" and self.company_profile:
            return self.company_profile.country
        return None

    @property
    def total_likes(self):
        return sum(p.like_count for p in self.projects)

    @property
    def total_saves(self):
        return sum(len(p.saved_by) for p in self.projects)

    @property
    def reputation(self):
        """Reputation badge dict: {kind, icon/letter, color, rank, label}.

        This is the single source of truth for the reputation icon shown
        everywhere a user's name appears (dashboards, project cards,
        comments, messages, profile, search, collaboration requests).
        """
        return get_user_reputation(self)

    @property
    def languages_list(self):
        """Known programming languages, for builder + investor accounts
        only (companies don't have this field)."""
        if self.role == "builder" and self.builder_profile:
            return self.builder_profile.languages_list
        if self.role == "investor" and self.investor_profile:
            return self.investor_profile.languages_list
        return []

    @property
    def builder_type(self):
        """software / hardware / both — builders only, used to show the
        category icon next to the reputation badge."""
        if self.role == "builder" and self.builder_profile:
            return self.builder_profile.builder_type
        return None

    @property
    def unread_notification_count(self):
        return sum(1 for n in self.notifications if not n.is_read)


class BuilderProfile(db.Model):
    __tablename__ = "builder_profiles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    full_name = db.Column(db.String(120))
    country = db.Column(db.String(80))
    builder_type = db.Column(db.String(20))  # software, hardware, both
    primary_skill = db.Column(db.String(120))
    bio = db.Column(db.Text)
    profile_picture = db.Column(db.String(255))

    # Comma-separated list of language names picked at signup (or later via
    # settings), e.g. "Python,JavaScript,Go". Kept as a simple delimited
    # string rather than a join table — see languages.py for the canonical
    # list + rendering helpers.
    known_languages = db.Column(db.Text)

    @property
    def languages_list(self):
        return [l for l in (self.known_languages or "").split(",") if l]


class InvestorProfile(db.Model):
    __tablename__ = "investor_profiles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    full_name = db.Column(db.String(120))
    country = db.Column(db.String(80))
    investor_type = db.Column(db.String(80))
    bio = db.Column(db.Text)
    profile_picture = db.Column(db.String(255))

    # Reputation stats — drive the investor's reputation icon (see reputation.py)
    engagement_points = db.Column(db.Integer, default=0)
    successful_collaborations = db.Column(db.Integer, default=0)
    projects_funded = db.Column(db.Integer, default=0)
    projects_helped = db.Column(db.Integer, default=0)

    known_languages = db.Column(db.Text)

    @property
    def languages_list(self):
        return [l for l in (self.known_languages or "").split(",") if l]


class CompanyProfile(db.Model):
    __tablename__ = "company_profiles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    company_name = db.Column(db.String(120))
    country = db.Column(db.String(80))
    industry = db.Column(db.String(120))
    bio = db.Column(db.Text)
    logo = db.Column(db.String(255))

    # Reputation stats — drive the company's reputation icon (see reputation.py)
    company_points = db.Column(db.Integer, default=0)
    verified_partnerships = db.Column(db.Integer, default=0)


class Project(db.Model):
    __tablename__ = "projects"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    category = db.Column(db.String(20))  # software, hardware
    project_name = db.Column(db.String(150), nullable=False)
    overview = db.Column(db.Text)
    inspiration = db.Column(db.Text)
    problem = db.Column(db.Text)
    solution = db.Column(db.Text)
    stage = db.Column(db.String(50))

    cover_image = db.Column(db.String(255))
    demo_video = db.Column(db.String(255))

    investment_open = db.Column(db.Boolean, default=False)
    collaboration_open = db.Column(db.Boolean, default=False)
    sale_open = db.Column(db.Boolean, default=False)
    team_open = db.Column(db.Boolean, default=False)
    public_project = db.Column(db.Boolean, default=True)

    max_collaborators = db.Column(db.Integer, default=5)

    # Software-specific extras. Left null for hardware projects.
    repo_url = db.Column(db.String(255))       # GitHub repo link
    live_url = db.Column(db.String(255))       # Live/working demo link
    challenges = db.Column(db.Text)             # what they're currently stuck on
    next_steps = db.Column(db.Text)             # how they plan to move forward

    # `public_project` doubles as the public/private toggle (see below).
    # When private, `view_password_hash` gates full detail views — the
    # project card / search result still shows cover image + overview,
    # but everything else requires the password (or team membership).
    view_password_hash = db.Column(db.String(255))

    # Comma-separated subset of {"builder","investor","company"} — who is
    # allowed to see the full project beyond cover image + overview. Null/
    # empty means everyone. This is independent of (and checked before) the
    # password gate above: a role that's excluded here can't get in even
    # with the right password.
    visible_to_roles = db.Column(db.String(60), default="builder,investor,company")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    screenshots = db.relationship("ProjectScreenshot", backref="project", cascade="all, delete-orphan")
    likes = db.relationship("Like", backref="project", cascade="all, delete-orphan")
    comments = db.relationship("Comment", backref="project", cascade="all, delete-orphan", order_by="Comment.created_at.desc()")
    saved_by = db.relationship("SavedProject", backref="project", cascade="all, delete-orphan")
    collaboration_requests = db.relationship("CollaborationRequest", backref="project", cascade="all, delete-orphan")

    @property
    def like_count(self):
        return len(self.likes)

    @property
    def comment_count(self):
        return len(self.comments)

    def is_liked_by(self, user_id):
        return any(l.user_id == user_id for l in self.likes)

    def is_saved_by(self, user_id):
        return any(s.user_id == user_id for s in self.saved_by)

    @property
    def accepted_collaborators_count(self):
        return sum(1 for r in self.collaboration_requests if r.status == "Accepted")

    @property
    def accepted_collaborators(self):
        """CollaborationRequest rows for applicants who were accepted onto this project."""
        return [r for r in self.collaboration_requests if r.status == "Accepted"]

    @property
    def collaboration_slots_left(self):
        cap = self.max_collaborators or 0
        return max(0, cap - self.accepted_collaborators_count)

    @property
    def collaboration_open_for_applicants(self):
        return self.collaboration_open and self.collaboration_slots_left > 0

    def collaboration_status_for(self, user_id):
        """Returns the applicant's request status for this project, or None."""
        req = next((r for r in self.collaboration_requests if r.applicant_id == user_id), None)
        return req.status if req else None

    @property
    def team_member_ids(self):
        """Owner + every accepted collaborator — the people who make up the project's team."""
        ids = {self.owner_id}
        ids.update(r.applicant_id for r in self.collaboration_requests if r.status == "Accepted")
        return ids

    def is_team_member(self, user_id):
        return user_id in self.team_member_ids

    def can_edit(self, user_id):
        """Owner and any accepted collaborator can edit project details and post updates."""
        return self.is_team_member(user_id)

    def can_delete(self, user_id):
        """Only the owner can delete the project outright."""
        return self.owner_id == user_id

    @property
    def is_private(self):
        return not self.public_project

    @property
    def visible_to_roles_list(self):
        roles = [r for r in (self.visible_to_roles or "").split(",") if r]
        return roles  # empty list == everyone

    def is_role_allowed(self, role):
        allowed = self.visible_to_roles_list
        return not allowed or role in allowed

    def set_view_password(self, password):
        self.view_password_hash = generate_password_hash(password)

    def check_view_password(self, password):
        if not self.view_password_hash or not password:
            return False
        return check_password_hash(self.view_password_hash, password)

    def can_view_full(self, viewer, unlocked=False):
        """Whether the full project (beyond cover image + overview) should
        be shown to this viewer. Owner/team always get in. Otherwise the
        viewer's role has to be on the allowed list *and* the project has
        to be public (or already unlocked with the password this session)
        — role restriction is checked first since no password can get
        around it."""
        if self.owner_id == viewer.id or self.is_team_member(viewer.id):
            return True
        if not self.is_role_allowed(viewer.role):
            return False
        return self.public_project or unlocked


class ProjectScreenshot(db.Model):
    __tablename__ = "project_screenshots"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    filename = db.Column(db.String(255), nullable=False)


class Like(db.Model):
    __tablename__ = "likes"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    __table_args__ = (db.UniqueConstraint("project_id", "user_id", name="uq_like_project_user"),)


class Comment(db.Model):
    __tablename__ = "comments"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("comments.id"), nullable=True)
    comment = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    replies = db.relationship(
        "Comment",
        backref=db.backref("parent", remote_side=[id]),
        cascade="all, delete-orphan",
        order_by="Comment.created_at.asc()",
    )


class SavedProject(db.Model):
    __tablename__ = "saved_projects"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    __table_args__ = (db.UniqueConstraint("project_id", "user_id", name="uq_saved_project_user"),)


class CollaborationRequest(db.Model):
    __tablename__ = "collaboration_requests"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    applicant_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    skill = db.Column(db.String(150))
    reason = db.Column(db.Text)
    portfolio = db.Column(db.String(255))
    status = db.Column(db.String(20), default="Pending")  # Pending, Accepted, Declined
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    applicant = db.relationship("User", foreign_keys=[applicant_id])
    owner = db.relationship("User", foreign_keys=[owner_id])

    __table_args__ = (db.UniqueConstraint("project_id", "applicant_id", name="uq_collab_project_applicant"),)


class Conversation(db.Model):
    __tablename__ = "conversations"

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Group/team chats are tied to a project. 1:1 DMs leave this null.
    is_group = db.Column(db.Boolean, default=False, nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=True)

    project = db.relationship("Project", backref=db.backref("team_conversation", uselist=False))

    members = db.relationship("ConversationMember", backref="conversation", cascade="all, delete-orphan")
    messages = db.relationship(
        "Message", backref="conversation", cascade="all, delete-orphan",
        order_by="Message.created_at.asc()",
    )

    def other_member(self, user_id):
        """Only meaningful for 1:1 conversations."""
        if self.is_group:
            return None
        m = next((m for m in self.members if m.user_id != user_id), None)
        return m.user if m else None

    def other_members(self, user_id):
        """Everyone in the conversation except the given user — used for group chats."""
        return [m.user for m in self.members if m.user_id != user_id]

    def has_member(self, user_id):
        return any(m.user_id == user_id for m in self.members)

    def title_for(self, viewer_id):
        if self.is_group:
            return (self.project.project_name + " — Team Chat") if self.project else "Team Chat"
        other = self.other_member(viewer_id)
        return other.display_name if other else "Conversation"

    def subtitle_for(self, viewer_id):
        if self.is_group:
            count = len(self.members)
            return f"{count} team member{'s' if count != 1 else ''}"
        return None

    @property
    def last_message(self):
        return self.messages[-1] if self.messages else None

    def unread_count_for(self, user_id):
        return sum(1 for m in self.messages if m.sender_id != user_id and not m.is_read)


class ConversationMember(db.Model):
    __tablename__ = "conversation_members"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    last_read_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User")

    __table_args__ = (db.UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),)


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id"), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)
    edited_at = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)

    # Reply/quote — WhatsApp-style "swipe to reply".
    reply_to_id = db.Column(db.Integer, db.ForeignKey("messages.id"), nullable=True)

    # A single image/file attachment. Stored under static/uploads/messages/.
    attachment_filename = db.Column(db.String(255), nullable=True)
    attachment_original_name = db.Column(db.String(255), nullable=True)
    attachment_kind = db.Column(db.String(10), nullable=True)  # "image" or "file"

    # Set when this message was created by the Forward action.
    is_forwarded = db.Column(db.Boolean, default=False)

    sender = db.relationship("User")
    reply_to = db.relationship("Message", remote_side=[id])
    reactions = db.relationship("MessageReaction", backref="message", cascade="all, delete-orphan")
    stars = db.relationship("MessageStar", backref="message", cascade="all, delete-orphan")

    def reactions_summary(self, viewer_id):
        """[{'emoji': '👍', 'count': 2, 'reacted_by_me': True}, ...] — grouped
        and ordered by first-used so the pill order doesn't jump around."""
        order, counts, mine = [], {}, set()
        for r in self.reactions:
            if r.emoji not in counts:
                order.append(r.emoji)
                counts[r.emoji] = 0
            counts[r.emoji] += 1
            if r.user_id == viewer_id:
                mine.add(r.emoji)
        return [{"emoji": e, "count": counts[e], "reacted_by_me": e in mine} for e in order]

    def is_starred_by(self, viewer_id):
        return any(s.user_id == viewer_id for s in self.stars)


class MessageReaction(db.Model):
    """One emoji reaction per user per message — reacting again with a
    different emoji replaces it, matching WhatsApp/iMessage behavior."""
    __tablename__ = "message_reactions"

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    emoji = db.Column(db.String(16), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User")

    __table_args__ = (db.UniqueConstraint("message_id", "user_id", name="uq_reaction_message_user"),)


class MessageStar(db.Model):
    """A message a user has starred for themselves — private, like WhatsApp
    stars (not visible to the other party)."""
    __tablename__ = "message_stars"

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("message_id", "user_id", name="uq_star_message_user"),)


class BlockedUser(db.Model):
    __tablename__ = "blocked_users"

    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    blocker = db.relationship("User", foreign_keys=[blocker_id])
    blocked = db.relationship("User", foreign_keys=[blocked_id])

    __table_args__ = (db.UniqueConstraint("blocker_id", "blocked_id", name="uq_blocked_user_pair"),)


DEAL_STATUSES = ("Pending", "Negotiating", "Accepted", "Signed", "Completed", "Cancelled")

# Deal type -> (label, party category). "investor" deals show up in
# Builder<->Investor conversations, "company" deals in Builder<->Company ones.
DEAL_TYPES = {
    "equity_investment": ("Equity Investment", "investor"),
    "safe": ("SAFE Agreement", "investor"),
    "convertible_note": ("Convertible Note", "investor"),
    "grant": ("Grant", "investor"),
    "revenue_share": ("Revenue Share", "investor"),
    "loan": ("Loan", "investor"),
    "partnership": ("Partnership Agreement", "company"),
    "sponsorship": ("Sponsorship Agreement", "company"),
    "pilot": ("Pilot Agreement", "company"),
    "licensing": ("Licensing Agreement", "company"),
    "service": ("Service Agreement", "company"),
    "api_partnership": ("API Partnership", "company"),
    "acquisition": ("Acquisition Proposal", "company"),
    "nda": ("NDA", "company"),
}


class Deal(db.Model):
    """A deal drafted inside a conversation. A conversation can have more
    than one Deal row over its lifetime — cancelling or completing one is
    terminal for that row, but the pair can start a fresh deal afterward
    without losing the old one from history. `app.get_latest_deal()` is
    what decides which one is 'the' live deal for a conversation."""
    __tablename__ = "deals"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id"), nullable=False, index=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    deal_type = db.Column(db.String(40), nullable=False)
    title = db.Column(db.String(200))
    startup_name = db.Column(db.String(150))
    other_party_name = db.Column(db.String(150))

    status = db.Column(db.String(20), default="Pending", nullable=False)

    investment_amount = db.Column(db.Float, nullable=True)
    currency = db.Column(db.String(10), default="USD")
    equity_percentage = db.Column(db.Float, nullable=True)
    valuation = db.Column(db.Float, nullable=True)

    current_version_number = db.Column(db.Integer, default=1)

    # AI Fairness Score — cached from the most recent analysis.
    fairness_builder = db.Column(db.Integer, nullable=True)
    fairness_other = db.Column(db.Integer, nullable=True)
    fairness_overall = db.Column(db.Integer, nullable=True)
    fairness_explanation = db.Column(db.Text, nullable=True)
    fairness_breakdown_json = db.Column(db.Text, nullable=True)  # JSON dict of category -> score
    risk_analysis_json = db.Column(db.Text, nullable=True)       # JSON: good_for_you/warnings/missing_clauses

    # JSON list of {"user_id": int, "name": str, "signed_at": iso str}
    signatures_json = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    conversation = db.relationship("Conversation", backref=db.backref("deals", lazy="dynamic"))
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    versions = db.relationship(
        "DealVersion", backref="deal", cascade="all, delete-orphan",
        order_by="DealVersion.version_number.asc()",
    )
    activities = db.relationship(
        "DealActivity", backref="deal", cascade="all, delete-orphan",
        order_by="DealActivity.created_at.asc()",
    )

    @property
    def deal_type_label(self):
        return DEAL_TYPES.get(self.deal_type, (self.deal_type, ""))[0]

    @property
    def current_version(self):
        for v in reversed(self.versions):
            if v.version_number == self.current_version_number:
                return v
        return self.versions[-1] if self.versions else None

    @property
    def signatures(self):
        import json
        try:
            return json.loads(self.signatures_json) if self.signatures_json else []
        except (ValueError, TypeError):
            return []

    def has_signed(self, user_id):
        return any(s.get("user_id") == user_id for s in self.signatures)

    def is_fully_signed(self):
        signer_ids = {s.get("user_id") for s in self.signatures}
        member_ids = {m.user_id for m in self.conversation.members}
        return member_ids and member_ids.issubset(signer_ids)

    def to_summary_dict(self):
        return {
            "id": self.id,
            "deal_type": self.deal_type,
            "deal_type_label": self.deal_type_label,
            "title": self.title,
            "startup_name": self.startup_name,
            "other_party_name": self.other_party_name,
            "status": self.status,
            "investment_amount": self.investment_amount,
            "currency": self.currency,
            "equity_percentage": self.equity_percentage,
            "valuation": self.valuation,
            "current_version_number": self.current_version_number,
            "fairness": {
                "builder": self.fairness_builder,
                "other_party": self.fairness_other,
                "overall": self.fairness_overall,
                "explanation": self.fairness_explanation,
            } if self.fairness_overall is not None else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DealVersion(db.Model):
    """One version of the contract. v1 is the original AI-generated draft;
    every negotiation round creates a new version rather than mutating the
    old one, so the whole history stays inspectable (like a PR diff)."""
    __tablename__ = "deal_versions"

    id = db.Column(db.Integer, primary_key=True)
    deal_id = db.Column(db.Integer, db.ForeignKey("deals.id"), nullable=False)
    version_number = db.Column(db.Integer, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    terms_json = db.Column(db.Text, nullable=False)       # JSON dict of the deal-form fields
    contract_title = db.Column(db.String(200))
    sections_json = db.Column(db.Text, nullable=True)      # JSON list of {"heading","body"}
    clauses_json = db.Column(db.Text, nullable=True)       # JSON list of {"clause_title","clause_text","plain_english"}
    change_summary_json = db.Column(db.Text, nullable=True)  # JSON list of short change strings (null for v1)

    decision = db.Column(db.String(20), nullable=True)  # None, "accepted", "countered"
    decided_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    decided_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    created_by = db.relationship("User", foreign_keys=[created_by_id])
    decided_by = db.relationship("User", foreign_keys=[decided_by_id])

    __table_args__ = (db.UniqueConstraint("deal_id", "version_number", name="uq_deal_version_number"),)

    @property
    def terms(self):
        import json
        try:
            return json.loads(self.terms_json) if self.terms_json else {}
        except (ValueError, TypeError):
            return {}

    @property
    def sections(self):
        import json
        try:
            return json.loads(self.sections_json) if self.sections_json else []
        except (ValueError, TypeError):
            return []

    @property
    def clauses(self):
        import json
        try:
            return json.loads(self.clauses_json) if self.clauses_json else []
        except (ValueError, TypeError):
            return []

    @property
    def change_summary(self):
        import json
        try:
            return json.loads(self.change_summary_json) if self.change_summary_json else []
        except (ValueError, TypeError):
            return []

    def to_dict(self, include_contract=True):
        data = {
            "version_number": self.version_number,
            "created_by": {"id": self.created_by.id, "name": self.created_by.display_name} if self.created_by else None,
            "terms": self.terms,
            "change_summary": self.change_summary,
            "decision": self.decision,
            "decided_by": self.decided_by.display_name if self.decided_by else None,
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_contract:
            data["contract_title"] = self.contract_title
            data["sections"] = self.sections
            data["clauses"] = self.clauses
        return data


class DealActivity(db.Model):
    """Stripe-style activity log for a deal: created, viewed, analyzed,
    negotiation rounds, accepted, signed, completed..."""
    __tablename__ = "deal_activities"

    id = db.Column(db.Integer, primary_key=True)
    deal_id = db.Column(db.Integer, db.ForeignKey("deals.id"), nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    action = db.Column(db.String(40), nullable=False)
    detail = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def to_dict(self):
        return {
            "action": self.action,
            "detail": self.detail,
            "actor": self.actor.display_name if self.actor else "VISION AI",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Notification(db.Model):
    """A single notification for a user. `category` drives the tabs in the
    notification panel; `type` drives which icon/verb is shown. Built and
    written via helpers in notifications.py — don't construct these by hand
    in app.py, so the categorization logic stays in one place."""
    __tablename__ = "notifications"

    CATEGORY_MESSAGES = "messages"
    CATEGORY_ENGAGEMENT = "engagement"
    CATEGORY_COLLABORATION = "collaboration"
    CATEGORY_PROFILE = "profile"
    CATEGORY_ACHIEVEMENTS = "achievements"

    id = db.Column(db.Integer, primary_key=True)

    # Who sees this notification.
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    # Who caused it (the liker, commenter, viewer...). Null for system-
    # generated notifications like a new badge.
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    category = db.Column(db.String(20), nullable=False)
    type = db.Column(db.String(30), nullable=False)  # message, like, comment, reply, save,
                                                       # profile_view, collab_request,
                                                       # collab_accepted, collab_declined, badge

    text = db.Column(db.String(255), nullable=False)
    link = db.Column(db.String(255), nullable=True)  # where clicking this notification should go

    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), nullable=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id"), nullable=True)

    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    actor = db.relationship("User", foreign_keys=[actor_id])
    project = db.relationship("Project")
    conversation = db.relationship("Conversation")

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "type": self.type,
            "text": self.text,
            "link": self.link,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat(),
            "project_id": self.project_id,
            "conversation_id": self.conversation_id,
            "actor": {
                "id": self.actor.id,
                "name": self.actor.display_name,
                "avatar_url": self.actor.avatar_url,
            } if self.actor else None,
        }