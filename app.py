import os
import time
import re
import uuid
from datetime import datetime

from flask import (
    Flask, render_template, redirect, url_for, request,
    flash, jsonify, abort, session
)
from flask_login import (
    LoginManager, login_user, logout_user, login_required, current_user
)
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash

from sqlalchemy import or_

from config import Config
from database import db
from reputation import reputation_to_dict, get_reputation_progress, help_badge_data
from languages import LANGUAGES, LANGUAGE_LOOKUP, BUILDER_TYPE_META
from models import (
    User, BuilderProfile, InvestorProfile, CompanyProfile,
    Project, ProjectScreenshot, Like, Comment, SavedProject,
    CollaborationRequest, Conversation, ConversationMember, Message,
    MessageReaction, MessageStar,
    BlockedUser, Notification, Deal, DealVersion, DealActivity, DEAL_TYPES,
)
from notifications import (
    notify_like, notify_save, notify_comment,
    notify_collab_request, notify_collab_accepted, notify_collab_declined,
    notify_new_message, notify_profile_view, check_and_award_badge,
    get_notifications, CATEGORY_LABELS, TYPE_ICONS,
)
from services.vision_ai import ask_vision_ai, ask_vision_ai_json
from services.vision_ai_prompts import (
    project_review_prompt, improve_pitch_prompt, startup_roadmap_prompt,
    startup_chat_prompt, investment_analysis_prompt, due_diligence_questions_prompt,
    partnership_suggestions_prompt, outreach_message_prompt, universal_chat_prompt,
    chat_mention_prompt, find_matches_prompt, risk_analysis_prompt,
    scale_plan_prompt, supercharge_pitch_prompt,
    startup_score_prompt, pitch_practice_prompt, weekly_advisor_prompt,
    compare_startups_prompt,
)
from services.deal_ai_prompts import (
    generate_contract_prompt, negotiation_change_summary_prompt,
    risk_and_fairness_prompt, clause_action_prompt, investment_proposal_prompt,
)
import json as _json

# Matches "@VISIONAI", "@visionai", "@Vision AI", "@vision_ai", etc. so
# tagging the copilot inside a chat is forgiving about spacing/case.
VISION_AI_MENTION_RE = re.compile(r"@vision[\s_-]*ai\b", re.IGNORECASE)
VISION_AI_USERNAME = "visionai"

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)

# gunicorn imports this module as `app:app` and never executes the
# `if __name__ == "__main__"` block below, so table creation has to happen
# here at import time too (db.create_all() is a no-op for tables that
# already exist, so this is safe to run on every boot/worker start).
with app.app_context():
    db.create_all()

login_manager = LoginManager()
login_manager.login_view = "login"
login_manager.init_app(app)

# Make sure upload directories exist
for folder in (
    Config.PROFILE_UPLOAD_FOLDER,
    Config.SHOTS_UPLOAD_FOLDER,
    Config.VIDEOS_UPLOAD_FOLDER,
):
    os.makedirs(folder, exist_ok=True)

# Chat attachments get their own folder under static/, self-contained here
# rather than added to the Config class this file doesn't own.
MESSAGE_UPLOAD_FOLDER = os.path.join(app.static_folder, "uploads", "messages")
os.makedirs(MESSAGE_UPLOAD_FOLDER, exist_ok=True)
MESSAGE_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MESSAGE_FILE_EXTENSIONS = MESSAGE_IMAGE_EXTENSIONS | {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip", "csv"}
MESSAGE_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024  # 15MB, matches the client-side check


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def allowed_file(filename, allowed_set):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_set


def _parse_max_collaborators(raw_value):
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return 5
    return max(1, min(value, 50))


def save_upload(file_storage, folder, allowed_set):
    """Save an uploaded file with a unique name and return the stored filename."""
    if not file_storage or file_storage.filename == "":
        return None
    if not allowed_file(file_storage.filename, allowed_set):
        return None
    ext = file_storage.filename.rsplit(".", 1)[1].lower()
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_storage.save(os.path.join(folder, unique_name))
    return unique_name


def save_message_attachment(file_storage):
    """Save a chat attachment and return (stored_filename, original_name, kind),
    or (None, None, None) if there's nothing to save or it fails validation."""
    if not file_storage or file_storage.filename == "":
        return None, None, None
    if not allowed_file(file_storage.filename, MESSAGE_FILE_EXTENSIONS):
        return None, None, None

    file_storage.seek(0, os.SEEK_END)
    size = file_storage.tell()
    file_storage.seek(0)
    if size > MESSAGE_ATTACHMENT_MAX_BYTES:
        return None, None, None

    ext = file_storage.filename.rsplit(".", 1)[1].lower()
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_storage.save(os.path.join(MESSAGE_UPLOAD_FOLDER, unique_name))
    kind = "image" if ext in MESSAGE_IMAGE_EXTENSIONS else "file"
    original_name = secure_filename(file_storage.filename) or file_storage.filename
    return unique_name, original_name, kind


def team_projects_for(user):
    """Projects this user collaborates on but doesn't own (any role can collaborate)."""
    return (
        Project.query
        .join(CollaborationRequest, CollaborationRequest.project_id == Project.id)
        .filter(
            CollaborationRequest.applicant_id == user.id,
            CollaborationRequest.status == "Accepted",
            Project.owner_id != user.id,
        )
        .order_by(Project.updated_at.desc())
        .all()
    )


def dashboard_redirect_for(user):
    if user.role == "builder":
        return url_for("builder_dashboard")
    if user.role == "investor":
        return url_for("investor_dashboard")
    if user.role == "company":
        return url_for("company_dashboard")
    return url_for("index")


def get_or_create_conversation(user_id_a, user_id_b):
    """Return the existing 1:1 conversation between two users, or create one."""
    existing = (
        Conversation.query
        .filter_by(is_group=False)
        .join(ConversationMember, Conversation.id == ConversationMember.conversation_id)
        .filter(ConversationMember.user_id.in_([user_id_a, user_id_b]))
        .all()
    )
    for convo in existing:
        member_ids = {m.user_id for m in convo.members}
        if member_ids == {user_id_a, user_id_b}:
            return convo

    convo = Conversation(is_group=False)
    db.session.add(convo)
    db.session.flush()
    db.session.add(ConversationMember(conversation_id=convo.id, user_id=user_id_a))
    db.session.add(ConversationMember(conversation_id=convo.id, user_id=user_id_b))
    db.session.flush()
    return convo


def get_or_create_project_conversation(project):
    """Return the project's team group chat, creating it (with the owner as the
    first member) if it doesn't exist yet."""
    convo = project.team_conversation
    if convo:
        return convo

    convo = Conversation(is_group=True, project_id=project.id)
    db.session.add(convo)
    db.session.flush()
    db.session.add(ConversationMember(conversation_id=convo.id, user_id=project.owner_id))
    db.session.flush()
    return convo


def ensure_team_membership(project, user_id):
    """Make sure `user_id` is a member of the project's team group chat."""
    convo = get_or_create_project_conversation(project)
    if not convo.has_member(user_id):
        db.session.add(ConversationMember(conversation_id=convo.id, user_id=user_id))
        db.session.flush()
    return convo


def get_vision_ai_user():
    """The system account that posts VISION AI's replies when it's @-tagged
    inside a real conversation. Created lazily on first use so a fresh
    database doesn't need a special seed step."""
    bot = User.query.filter_by(username=VISION_AI_USERNAME).first()
    if bot:
        return bot
    bot = User(
        role="vision_ai",
        username=VISION_AI_USERNAME,
        email="visionai@vision.local",
        password_hash=generate_password_hash(uuid.uuid4().hex),
    )
    db.session.add(bot)
    db.session.flush()
    return bot


def extract_vision_ai_mention(content):
    """Returns (question, was_tagged) — the message text with the @VISIONAI
    tag stripped out, and whether the tag was present at all."""
    if not VISION_AI_MENTION_RE.search(content):
        return content, False
    question = VISION_AI_MENTION_RE.sub(" ", content).strip()
    return question, True


def build_vision_ai_reply(convo, asker, question):
    """Ask VISION AI to answer a mention inside an existing chat thread,
    grounded in a little recent history. Returns the reply text, or a short
    apology string if the request fails for any reason (never raises, so a
    VISION AI hiccup never breaks sending the underlying chat message)."""
    recent = convo.messages[-8:] if convo.messages else []
    lines = []
    for m in recent:
        sender_label = m.sender.display_name if m.sender else "Someone"
        lines.append(f"{sender_label}: {m.content}")
    thread_context = "\n".join(lines) if lines else None

    session_context = {
        "user_role": asker.role,
        "user_display_name": asker.display_name,
        "page": "messages",
    }

    try:
        return ask_vision_ai(
            chat_mention_prompt(asker.display_name, question, thread_context),
            context=session_context,
        )
    except RuntimeError as e:
        return str(e)
    except Exception:
        app.logger.exception("VISION AI mention reply failed")
        return "VISION AI couldn't process that just now — please try again."


def is_blocked_pair(user_a_id, user_b_id):
    """True if either user has blocked the other."""
    return BlockedUser.query.filter(
        or_(
            db.and_(BlockedUser.blocker_id == user_a_id, BlockedUser.blocked_id == user_b_id),
            db.and_(BlockedUser.blocker_id == user_b_id, BlockedUser.blocked_id == user_a_id),
        )
    ).first() is not None


def remove_team_membership(project, user_id):
    convo = project.team_conversation
    if not convo:
        return
    member = ConversationMember.query.filter_by(conversation_id=convo.id, user_id=user_id).first()
    if member:
        db.session.delete(member)
        db.session.flush()


# ---------------------------------------------------------------------------
# Deal Room helpers
# ---------------------------------------------------------------------------

def get_latest_deal(convo):
    """The deal currently 'live' in this conversation. Deals aren't unique
    per conversation — cancelling one leaves it in history and a fresh Deal
    row gets created for the next attempt — so 'the' deal is always just
    the most recently created one."""
    return Deal.query.filter_by(conversation_id=convo.id).order_by(Deal.created_at.desc()).first()


def get_latest_deal_or_404(convo):
    deal = get_latest_deal(convo)
    if not deal:
        abort(404)
    return deal


def get_deal_conversation_or_403(conversation_id):
    """Deal Room is for 1:1 conversations only — a project's internal team
    chat doesn't get one (drafting a legal agreement is between two
    outside parties, not something a team negotiates with itself)."""
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)
    if convo.is_group:
        abort(400)
    return convo


def log_deal_activity(deal, action, detail=None, actor=None):
    db.session.add(DealActivity(
        deal_id=deal.id,
        actor_id=(actor or current_user).id if (actor or current_user) else None,
        action=action,
        detail=detail,
    ))


def notify_deal_update(convo, text):
    """Notifies everyone else in the conversation — one person for a 1:1
    chat, every teammate for a group chat — reusing the existing
    Notification model/category rather than a new one."""
    for other in convo.other_members(current_user.id) if convo.is_group else ([convo.other_member(current_user.id)] if convo.other_member(current_user.id) else []):
        db.session.add(Notification(
            user_id=other.id,
            actor_id=current_user.id,
            category=Notification.CATEGORY_COLLABORATION,
            type="deal_update",
            text=text,
            link=url_for("messages_page", conversation_id=convo.id),
            conversation_id=convo.id,
        ))


def _merge_terms(base_terms, updates):
    merged = dict(base_terms or {})
    for key, value in (updates or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def _generate_contract_for_terms(deal, terms):
    """Calls VISION AI to draft the contract body + clause explainer for a
    given set of terms. Returns (title, sections, clauses)."""
    result = ask_vision_ai_json(
        generate_contract_prompt(deal.deal_type_label, terms),
        context={"deal_type": deal.deal_type_label, "role": "deal_room_contract_generation"},
        max_tokens=4000,
    )
    title = result.get("title") or f"{deal.deal_type_label} — {deal.startup_name or 'Untitled'}"
    sections = result.get("sections") or []
    clauses = result.get("clauses") or []
    return title, sections, clauses


# ---------------------------------------------------------------------------
# Public pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    projects = (
        Project.query.filter_by(public_project=True)
        .order_by(Project.created_at.desc())
        .limit(6)
        .all()
    )
    builder_count = User.query.filter_by(role="builder").count()
    investor_count = User.query.filter_by(role="investor").count()
    company_count = User.query.filter_by(role="company").count()
    project_count = Project.query.filter_by(public_project=True).count()
    return render_template(
        "index.html",
        projects=projects,
        builder_count=builder_count,
        investor_count=investor_count,
        company_count=company_count,
        project_count=project_count,
    )


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(dashboard_redirect_for(current_user))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            login_user(user)
            flash("Welcome back to Vision.", "success")
            return redirect(dashboard_redirect_for(user))

        flash("Invalid email or password.", "error")
        return redirect(url_for("login"))

    return render_template("login.html")


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(dashboard_redirect_for(current_user))

    if request.method == "POST":
        role = request.form.get("role")
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        country = request.form.get("country", "").strip()

        if role not in ("builder", "investor", "company"):
            flash("Please choose an account type.", "error")
            return redirect(url_for("signup"))

        if not email or not password:
            flash("Email and password are required.", "error")
            return redirect(url_for("signup"))

        if User.query.filter_by(email=email).first():
            flash("An account with that email already exists.", "error")
            return redirect(url_for("signup"))

        if role == "company":
            username_base = request.form.get("company_name", "company").strip()
        else:
            username_base = request.form.get("username", "").strip()

        if role in ("builder", "investor"):
            username = username_base
            if not username:
                flash("Username is required.", "error")
                return redirect(url_for("signup"))
            if User.query.filter_by(username=username).first():
                flash("That username is already taken.", "error")
                return redirect(url_for("signup"))
        else:
            # auto-generate a unique username for companies
            base_slug = "".join(c.lower() if c.isalnum() else "-" for c in username_base) or "company"
            username = base_slug
            suffix = 1
            while User.query.filter_by(username=username).first():
                suffix += 1
                username = f"{base_slug}-{suffix}"

        user = User(role=role, username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.flush()  # get user.id before commit

        if role == "builder":
            profile = BuilderProfile(
                user_id=user.id,
                full_name=request.form.get("full_name", "").strip(),
                country=country,
                builder_type=request.form.get("builder_type", "").strip(),
                primary_skill=request.form.get("primary_skill", "").strip(),
                known_languages=",".join(l for l in request.form.getlist("languages") if l in LANGUAGE_LOOKUP),
            )
            db.session.add(profile)
        elif role == "investor":
            profile = InvestorProfile(
                user_id=user.id,
                full_name=request.form.get("full_name", "").strip(),
                country=country,
                investor_type=request.form.get("investor_type", "").strip(),
                known_languages=",".join(l for l in request.form.getlist("languages") if l in LANGUAGE_LOOKUP),
            )
            db.session.add(profile)
        elif role == "company":
            profile = CompanyProfile(
                user_id=user.id,
                company_name=request.form.get("company_name", "").strip(),
                country=country,
                industry=request.form.get("industry", "").strip(),
            )
            db.session.add(profile)

        db.session.commit()
        login_user(user)
        flash("Your Vision account is ready.", "success")
        return redirect(dashboard_redirect_for(user))

    return render_template("signup.html", languages=LANGUAGES)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.", "success")
    return redirect(url_for("index"))


# ---------------------------------------------------------------------------
# Builder dashboard
# ---------------------------------------------------------------------------

@app.route("/dashboard/builder")
@login_required
def builder_dashboard():
    if current_user.role != "builder":
        abort(403)

    my_projects = (
        Project.query.filter_by(owner_id=current_user.id)
        .order_by(Project.updated_at.desc())
        .all()
    )
    total_likes = sum(p.like_count for p in my_projects)
    total_saves = sum(len(p.saved_by) for p in my_projects)

    # Projects this builder collaborates on but doesn't own — they can edit
    # and post updates, just like the owner can.
    team_projects = team_projects_for(current_user)

    return render_template(
        "builderdashboard.html",
        my_projects=my_projects,
        team_projects=team_projects,
        total_likes=total_likes,
        total_saves=total_saves,
    )


def _parse_audience(form):
    """Checkbox list of roles allowed to view a project's full details.
    Empty selection is treated as "everyone" rather than "no one" — an
    unchecked-by-accident form shouldn't silently hide the project from
    the whole platform."""
    roles = [r for r in form.getlist("audience") if r in ("builder", "investor", "company")]
    return ",".join(roles) if roles else "builder,investor,company"


@app.route("/dashboard/builder/project/create", methods=["POST"])
@login_required
def create_project():
    if current_user.role != "builder":
        abort(403)

    project = Project(
        owner_id=current_user.id,
        category=request.form.get("category"),
        project_name=request.form.get("project_name", "").strip(),
        overview=request.form.get("overview", "").strip(),
        inspiration=request.form.get("inspiration", "").strip(),
        problem=request.form.get("problem", "").strip(),
        solution=request.form.get("solution", "").strip(),
        stage=request.form.get("stage", "").strip(),
        repo_url=request.form.get("repo_url", "").strip(),
        live_url=request.form.get("live_url", "").strip(),
        challenges=request.form.get("challenges", "").strip(),
        next_steps=request.form.get("next_steps", "").strip(),
        investment_open=bool(request.form.get("investment_open")),
        collaboration_open=bool(request.form.get("collaboration_open")),
        sale_open=bool(request.form.get("sale_open")),
        team_open=bool(request.form.get("team_open")),
        max_collaborators=_parse_max_collaborators(request.form.get("max_collaborators")),
        visible_to_roles=_parse_audience(request.form),
    )

    if not project.project_name:
        flash("Project name is required.", "error")
        return redirect(url_for("builder_dashboard"))

    # Visibility: "public" (default) or "private". Private projects still
    # show up in search/browse — just with the cover image + overview only,
    # per project.can_view_full() — but require a password to unlock the
    # rest, so one must be set.
    visibility = request.form.get("visibility", "public")
    view_password = request.form.get("view_password", "").strip()
    project.public_project = (visibility != "private")
    if not project.public_project:
        if not view_password:
            flash("Set a password to publish a private project.", "error")
            return redirect(url_for("builder_dashboard"))
        project.set_view_password(view_password)

    cover_file = request.files.get("cover_image")
    cover_name = save_upload(cover_file, Config.SHOTS_UPLOAD_FOLDER, Config.ALLOWED_IMAGE_EXTENSIONS)
    if cover_name:
        project.cover_image = cover_name

    video_file = request.files.get("demo_video")
    video_name = save_upload(video_file, Config.VIDEOS_UPLOAD_FOLDER, Config.ALLOWED_VIDEO_EXTENSIONS)
    if video_name:
        project.demo_video = video_name

    db.session.add(project)
    db.session.flush()

    screenshots = request.files.getlist("screenshots")
    for shot in screenshots:
        shot_name = save_upload(shot, Config.SHOTS_UPLOAD_FOLDER, Config.ALLOWED_IMAGE_EXTENSIONS)
        if shot_name:
            db.session.add(ProjectScreenshot(project_id=project.id, filename=shot_name))

    # Every project gets a team group chat from day one — collaborators are
    # dropped into it automatically the moment they're accepted.
    get_or_create_project_conversation(project)

    db.session.commit()
    flash("Project published to Vision.", "success")
    return redirect(url_for("builder_dashboard"))


@app.route("/dashboard/builder/project/<int:project_id>/edit", methods=["POST"])
@login_required
def edit_project(project_id):
    project = Project.query.get_or_404(project_id)
    if not project.can_edit(current_user.id):
        abort(403)

    project.category = request.form.get("category")
    project.project_name = request.form.get("project_name", "").strip()
    project.overview = request.form.get("overview", "").strip()
    project.inspiration = request.form.get("inspiration", "").strip()
    project.problem = request.form.get("problem", "").strip()
    project.solution = request.form.get("solution", "").strip()
    project.stage = request.form.get("stage", "").strip()
    project.repo_url = request.form.get("repo_url", "").strip()
    project.live_url = request.form.get("live_url", "").strip()
    project.challenges = request.form.get("challenges", "").strip()
    project.next_steps = request.form.get("next_steps", "").strip()
    project.investment_open = bool(request.form.get("investment_open"))
    project.collaboration_open = bool(request.form.get("collaboration_open"))
    project.sale_open = bool(request.form.get("sale_open"))
    project.team_open = bool(request.form.get("team_open"))
    project.max_collaborators = _parse_max_collaborators(request.form.get("max_collaborators"))
    project.visible_to_roles = _parse_audience(request.form)
    project.updated_at = datetime.utcnow()

    visibility = request.form.get("visibility", "public")
    view_password = request.form.get("view_password", "").strip()
    going_private = (visibility == "private")
    if going_private and view_password:
        project.set_view_password(view_password)
    elif going_private and not project.view_password_hash:
        flash("Set a password to make this project private.", "error")
        return redirect(url_for("builder_dashboard"))
    project.public_project = not going_private

    cover_file = request.files.get("cover_image")
    cover_name = save_upload(cover_file, Config.SHOTS_UPLOAD_FOLDER, Config.ALLOWED_IMAGE_EXTENSIONS)
    if cover_name:
        project.cover_image = cover_name

    video_file = request.files.get("demo_video")
    video_name = save_upload(video_file, Config.VIDEOS_UPLOAD_FOLDER, Config.ALLOWED_VIDEO_EXTENSIONS)
    if video_name:
        project.demo_video = video_name

    db.session.commit()
    flash("Project updated.", "success")
    return redirect(url_for("builder_dashboard"))


@app.route("/dashboard/builder/project/<int:project_id>/delete", methods=["POST"])
@login_required
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    if not project.can_delete(current_user.id):
        abort(403)
    db.session.delete(project)
    db.session.commit()
    flash("Project deleted.", "success")
    return redirect(url_for("builder_dashboard"))


# ---------------------------------------------------------------------------
# Shared: Browse / Saved / Settings (builder, investor, company)
# ---------------------------------------------------------------------------

def role_template(base_name):
    mapping = {
        "builder": "builderdashboard.html",
        "investor": "investordashboard.html",
        "company": "companydashboard.html",
    }
    return mapping[current_user.role]


@app.route("/dashboard/browse")
@login_required
def browse_projects():
    search = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()

    query = Project.query
    if search:
        query = query.filter(Project.project_name.ilike(f"%{search}%"))
    if category in ("software", "hardware"):
        query = query.filter_by(category=category)

    projects = query.order_by(Project.created_at.desc()).all()

    template = {
        "builder": "builderdashboard.html",
        "investor": "investordashboard.html",
        "company": "companydashboard.html",
    }[current_user.role]

    return render_template(
        template,
        active_panel="browse",
        projects=projects,
        search=search,
        category=category,
    )


@app.route("/dashboard/saved")
@login_required
def saved_projects():
    saved = (
        SavedProject.query.filter_by(user_id=current_user.id)
        .join(Project)
        .order_by(SavedProject.id.desc())
        .all()
    )
    projects = [s.project for s in saved]

    template = {
        "builder": "builderdashboard.html",
        "investor": "investordashboard.html",
        "company": "companydashboard.html",
    }[current_user.role]

    return render_template(template, active_panel="saved", projects=projects)


@app.route("/dashboard/settings", methods=["POST"])
@login_required
def update_settings():
    user = current_user

    if user.role == "builder" and user.builder_profile:
        profile = user.builder_profile
        profile.bio = request.form.get("bio", profile.bio)
        profile.country = request.form.get("country", profile.country)
        profile.primary_skill = request.form.get("primary_skill", profile.primary_skill)
        pic = save_upload(request.files.get("profile_picture"), Config.PROFILE_UPLOAD_FOLDER, Config.ALLOWED_IMAGE_EXTENSIONS)
        if pic:
            profile.profile_picture = pic
    elif user.role == "investor" and user.investor_profile:
        profile = user.investor_profile
        profile.bio = request.form.get("bio", profile.bio)
        profile.country = request.form.get("country", profile.country)
        pic = save_upload(request.files.get("profile_picture"), Config.PROFILE_UPLOAD_FOLDER, Config.ALLOWED_IMAGE_EXTENSIONS)
        if pic:
            profile.profile_picture = pic
    elif user.role == "company" and user.company_profile:
        profile = user.company_profile
        profile.bio = request.form.get("bio", profile.bio)
        profile.country = request.form.get("country", profile.country)
        pic = save_upload(request.files.get("profile_picture"), Config.PROFILE_UPLOAD_FOLDER, Config.ALLOWED_IMAGE_EXTENSIONS)
        if pic:
            profile.logo = pic

    db.session.commit()
    flash("Settings updated.", "success")
    return redirect(dashboard_redirect_for(user))


# ---------------------------------------------------------------------------
# Investor / Company dashboards
# ---------------------------------------------------------------------------

@app.route("/dashboard/investor")
@login_required
def investor_dashboard():
    if current_user.role != "investor":
        abort(403)
    projects = (
        Project.query.filter_by(public_project=True)
        .order_by(Project.created_at.desc())
        .all()
    )
    return render_template(
        "investordashboard.html",
        projects=projects,
        team_projects=team_projects_for(current_user),
        active_panel="dashboard",
    )


@app.route("/dashboard/company")
@login_required
def company_dashboard():
    if current_user.role != "company":
        abort(403)
    projects = (
        Project.query.filter_by(public_project=True)
        .order_by(Project.created_at.desc())
        .all()
    )
    return render_template(
        "companydashboard.html",
        projects=projects,
        team_projects=team_projects_for(current_user),
        active_panel="dashboard",
    )


# ---------------------------------------------------------------------------
# Project interactions: like, save, comment (JSON endpoints)
# ---------------------------------------------------------------------------

@app.route("/api/projects/counts")
@login_required
def api_project_counts():
    """?ids=1,2,3 -> current like/comment counts + my like/save state for
    each, in one round trip. Used to keep project cards on Browse/Saved/
    Dashboard grids live without refetching each card's full detail."""
    raw_ids = request.args.get("ids", "")
    try:
        ids = [int(x) for x in raw_ids.split(",") if x.strip()]
    except ValueError:
        return jsonify({"error": "invalid ids"}), 400
    ids = ids[:60]  # sane upper bound — a screen only ever shows so many cards
    if not ids:
        return jsonify({"counts": {}})

    projects = Project.query.filter(Project.id.in_(ids)).all()
    my_likes = {
        l.project_id for l in Like.query.filter(
            Like.user_id == current_user.id, Like.project_id.in_(ids)
        ).all()
    }
    my_saves = {
        s.project_id for s in SavedProject.query.filter(
            SavedProject.user_id == current_user.id, SavedProject.project_id.in_(ids)
        ).all()
    }
    counts = {
        str(p.id): {
            "like_count": p.like_count,
            "comment_count": p.comment_count,
            "liked": p.id in my_likes,
            "saved": p.id in my_saves,
        }
        for p in projects
    }
    return jsonify({"counts": counts})


@app.route("/api/project/<int:project_id>/like", methods=["POST"])
@login_required
def toggle_like(project_id):
    project = Project.query.get_or_404(project_id)
    existing = Like.query.filter_by(project_id=project.id, user_id=current_user.id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"liked": False, "like_count": project.like_count})

    db.session.add(Like(project_id=project.id, user_id=current_user.id))
    db.session.commit()

    notify_like(project, current_user)
    check_and_award_badge(project.owner)
    db.session.commit()

    return jsonify({"liked": True, "like_count": project.like_count})


@app.route("/api/project/<int:project_id>/save", methods=["POST"])
@login_required
def toggle_save(project_id):
    project = Project.query.get_or_404(project_id)
    existing = SavedProject.query.filter_by(project_id=project.id, user_id=current_user.id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"saved": False})

    db.session.add(SavedProject(project_id=project.id, user_id=current_user.id))
    db.session.commit()

    notify_save(project, current_user)
    check_and_award_badge(project.owner)
    db.session.commit()

    return jsonify({"saved": True})


@app.route("/api/project/<int:project_id>/comment", methods=["POST"])
@login_required
def add_comment(project_id):
    project = Project.query.get_or_404(project_id)
    text = request.form.get("comment", "").strip()
    if not text:
        return jsonify({"error": "Comment cannot be empty."}), 400

    parent_id = request.form.get("parent_id", type=int)
    parent = None
    if parent_id:
        parent = Comment.query.filter_by(id=parent_id, project_id=project.id).first()
        if not parent:
            return jsonify({"error": "The comment you're replying to no longer exists."}), 400

    comment = Comment(project_id=project.id, user_id=current_user.id, comment=text, parent_id=parent.id if parent else None)
    db.session.add(comment)
    db.session.commit()

    notify_comment(project, current_user, comment)
    check_and_award_badge(project.owner)
    db.session.commit()

    return jsonify({
        "id": comment.id,
        "comment": comment.comment,
        "username": current_user.display_name,
        "avatar_url": current_user.avatar_url,
        "parent_id": comment.parent_id,
        "comment_count": project.comment_count,
        "reputation": reputation_to_dict(current_user.reputation),
    })


def _project_preview_dict(project, role_restricted=False):
    """What anyone can see about a private/restricted project: just enough
    to recognize it in search/browse."""
    return {
        "id": project.id,
        "project_name": project.project_name,
        "category": project.category,
        "overview": project.overview,
        "cover_image": f"/static/uploads/shots/{project.cover_image}" if project.cover_image else None,
        "owner_username": project.owner.username,
        "owner_name": project.owner.display_name,
        "owner_reputation": reputation_to_dict(project.owner.reputation),
        "is_private": project.is_private,
        "locked": True,
        "role_restricted": role_restricted,
        "visible_to_labels": [r.capitalize() + "s" for r in project.visible_to_roles_list],
    }


def _project_full_dict(project, viewer_id, unlocked=False):
    return {
        "id": project.id,
        "project_name": project.project_name,
        "category": project.category,
        "overview": project.overview,
        "inspiration": project.inspiration,
        "problem": project.problem,
        "solution": project.solution,
        "stage": project.stage,
        "repo_url": project.repo_url,
        "live_url": project.live_url,
        "challenges": project.challenges,
        "next_steps": project.next_steps,
        "cover_image": f"/static/uploads/shots/{project.cover_image}" if project.cover_image else None,
        "demo_video": f"/static/uploads/videos/{project.demo_video}" if project.demo_video else None,
        "screenshots": [f"/static/uploads/shots/{s.filename}" for s in project.screenshots],
        "owner_username": project.owner.username,
        "owner_name": project.owner.display_name,
        "owner_reputation": reputation_to_dict(project.owner.reputation),
        "like_count": project.like_count,
        "is_liked": project.is_liked_by(viewer_id),
        "is_saved": project.is_saved_by(viewer_id),
        "investment_open": project.investment_open,
        "collaboration_open": project.collaboration_open,
        "sale_open": project.sale_open,
        "team_open": project.team_open,
        "collaboration_slots_left": project.collaboration_slots_left,
        "max_collaborators": project.max_collaborators,
        "is_owner": project.owner_id == viewer_id,
        "is_team_member": project.is_team_member(viewer_id),
        "can_edit": project.can_edit(viewer_id),
        "team_conversation_id": project.team_conversation.id if project.team_conversation else None,
        "collaboration_status": project.collaboration_status_for(viewer_id),
        "is_private": project.is_private,
        "locked": False,
        "unlocked_this_session": unlocked,
        "visible_to_roles": project.visible_to_roles_list,
        "comments": [
            {
                "id": c.id,
                "username": c.user.display_name,
                "comment": c.comment,
                "avatar_url": c.user.avatar_url,
                "parent_id": c.parent_id,
                "reputation": reputation_to_dict(c.user.reputation),
            }
            for c in project.comments
        ],
        "collaborators": [
            {
                "request_id": r.id,
                "user_id": r.applicant_id,
                "name": r.applicant.display_name,
                "avatar_url": r.applicant.avatar_url,
                "reputation": reputation_to_dict(r.applicant.reputation),
            }
            for r in project.accepted_collaborators
        ],
        "collaboration_open_for_applicants": project.collaboration_open_for_applicants,
    }


def _is_member_or_owner(project, user):
    return project.owner_id == user.id or project.is_team_member(user.id)


@app.route("/api/project/<int:project_id>")
@login_required
def project_detail(project_id):
    project = Project.query.get_or_404(project_id)
    unlocked = project.id in session.get("unlocked_projects", [])
    if not project.can_view_full(current_user, unlocked=unlocked):
        role_restricted = not _is_member_or_owner(project, current_user) and not project.is_role_allowed(current_user.role)
        return jsonify(_project_preview_dict(project, role_restricted=role_restricted))
    return jsonify(_project_full_dict(project, current_user.id, unlocked=unlocked))


@app.route("/api/project/<int:project_id>/unlock", methods=["POST"])
@login_required
def unlock_project(project_id):
    project = Project.query.get_or_404(project_id)

    if not _is_member_or_owner(project, current_user) and not project.is_role_allowed(current_user.role):
        return jsonify({"error": "This project isn't visible to your account type."}), 403

    if project.public_project:
        return jsonify(_project_full_dict(project, current_user.id))

    password = request.form.get("password", "")
    if not project.check_view_password(password):
        return jsonify({"error": "That password isn't right."}), 400

    unlocked_ids = set(session.get("unlocked_projects", []))
    unlocked_ids.add(project.id)
    session["unlocked_projects"] = list(unlocked_ids)

    return jsonify(_project_full_dict(project, current_user.id, unlocked=True))


@app.route("/api/project/<int:project_id>/request-password", methods=["POST"])
@login_required
def request_project_password(project_id):
    project = Project.query.get_or_404(project_id)
    if project.owner_id == current_user.id:
        return jsonify({"error": "This is your own project."}), 400
    if not _is_member_or_owner(project, current_user) and not project.is_role_allowed(current_user.role):
        return jsonify({"error": "This project isn't visible to your account type."}), 403
    if project.public_project:
        return jsonify({"error": "This project isn't private."}), 400

    convo = get_or_create_conversation(current_user.id, project.owner_id)
    message = Message(
        conversation_id=convo.id,
        sender_id=current_user.id,
        content=f'Hi! Could you share the password to view your private project "{project.project_name}"?',
    )
    db.session.add(message)
    db.session.commit()

    notify_new_message(convo, current_user, message)
    db.session.commit()

    return jsonify({"conversation_id": convo.id, "message": "Your request was sent to the owner."})


# ---------------------------------------------------------------------------
# Collaboration requests
# ---------------------------------------------------------------------------

@app.route("/api/project/<int:project_id>/collaborate", methods=["POST"])
@login_required
def apply_to_collaborate(project_id):
    project = Project.query.get_or_404(project_id)

    if project.owner_id == current_user.id:
        return jsonify({"error": "You can't apply to your own project."}), 400
    if not project.collaboration_open_for_applicants:
        return jsonify({"error": "This project isn't open for collaborators right now."}), 400
    if project.collaboration_status_for(current_user.id):
        return jsonify({"error": "You've already applied to this project."}), 400

    skill = request.form.get("skill", "").strip()
    reason = request.form.get("reason", "").strip()
    portfolio = request.form.get("portfolio", "").strip()

    if not skill or not reason:
        return jsonify({"error": "Please fill in your skill and why you want to collaborate."}), 400

    req = CollaborationRequest(
        project_id=project.id,
        owner_id=project.owner_id,
        applicant_id=current_user.id,
        skill=skill,
        reason=reason,
        portfolio=portfolio,
    )
    db.session.add(req)
    db.session.commit()

    notify_collab_request(req)
    db.session.commit()

    return jsonify({"status": "Pending", "message": "Your application was sent to the builder."})


@app.route("/api/project/<int:project_id>/collaborators/<int:request_id>/remove", methods=["POST"])
@login_required
def remove_collaborator(project_id, request_id):
    project = Project.query.get_or_404(project_id)
    if project.owner_id != current_user.id:
        return jsonify({"error": "Only the project owner can remove collaborators."}), 403

    req = CollaborationRequest.query.filter_by(id=request_id, project_id=project.id, status="Accepted").first()
    if not req:
        return jsonify({"error": "Collaborator not found."}), 404

    remove_team_membership(project, req.applicant_id)
    db.session.delete(req)
    db.session.commit()

    return jsonify({"removed": True, "request_id": request_id, "collaboration_slots_left": project.collaboration_slots_left})


@app.route("/dashboard/builder/collaboration-requests")
@login_required
def collaboration_requests():
    if current_user.role != "builder":
        abort(403)

    requests_in = (
        CollaborationRequest.query.filter_by(owner_id=current_user.id)
        .order_by(CollaborationRequest.created_at.desc())
        .all()
    )

    return render_template(
        "builderdashboard.html",
        active_panel="collaboration_requests",
        collaboration_requests_list=requests_in,
    )


@app.route("/dashboard/builder/collaboration-requests/<int:request_id>/accept", methods=["POST"])
@login_required
def accept_collaboration_request(request_id):
    req = CollaborationRequest.query.get_or_404(request_id)
    if req.owner_id != current_user.id:
        abort(403)

    if req.project.collaboration_slots_left <= 0 and req.status != "Accepted":
        flash("This project has no open collaborator slots left.", "error")
        return redirect(url_for("collaboration_requests"))

    req.status = "Accepted"
    db.session.commit()

    # Drop them into the project's team group chat, and keep a 1:1 DM
    # option open too.
    team_convo = ensure_team_membership(req.project, req.applicant_id)
    get_or_create_conversation(req.owner_id, req.applicant_id)
    db.session.commit()

    notify_collab_accepted(req)
    check_and_award_badge(req.applicant)
    check_and_award_badge(req.owner)
    db.session.commit()

    flash(f"{req.applicant.display_name} is now a collaborator and has been added to the team chat.", "success")
    return redirect(url_for("view_conversation", conversation_id=team_convo.id))


@app.route("/dashboard/builder/collaboration-requests/<int:request_id>/decline", methods=["POST"])
@login_required
def decline_collaboration_request(request_id):
    req = CollaborationRequest.query.get_or_404(request_id)
    if req.owner_id != current_user.id:
        abort(403)

    req.status = "Declined"
    db.session.commit()

    notify_collab_declined(req)
    db.session.commit()

    flash("Request declined.", "success")
    return redirect(url_for("collaboration_requests"))


# ---------------------------------------------------------------------------
# User search & profiles
# ---------------------------------------------------------------------------

def _user_search_result(user):
    return {
        "id": user.id,
        "username": user.username,
        "name": user.display_name,
        "role": user.role,
        "country": user.country,
        "avatar_url": user.avatar_url,
        "reputation": reputation_to_dict(user.reputation),
        "languages": [{"name": l, **LANGUAGE_LOOKUP.get(l, {"color": "#94A3B8", "abbr": l[:2].upper()})} for l in user.languages_list],
        "builder_type": BUILDER_TYPE_META.get(user.builder_type) if user.builder_type else None,
    }


def _user_profile_payload(user):
    stats = []
    if user.role == "builder":
        stats = [
            {"label": "Projects", "value": len(user.projects)},
            {"label": "Total Likes", "value": user.total_likes},
            {"label": "Times Saved", "value": user.total_saves},
        ]
    elif user.role == "investor" and user.investor_profile:
        p = user.investor_profile
        stats = [
            {"label": "Engagement Points", "value": p.engagement_points or 0},
            {"label": "Collaborations", "value": p.successful_collaborations or 0},
            {"label": "Projects Funded", "value": p.projects_funded or 0},
            {"label": "Projects Helped", "value": p.projects_helped or 0},
        ]
    elif user.role == "company" and user.company_profile:
        p = user.company_profile
        stats = [
            {"label": "Company Points", "value": p.company_points or 0},
            {"label": "Verified Partnerships", "value": p.verified_partnerships or 0},
        ]

    return {
        "id": user.id,
        "username": user.username,
        "name": user.display_name,
        "role": user.role,
        "country": user.country,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "reputation": reputation_to_dict(user.reputation),
        "stats": stats,
        "languages": [{"name": l, **LANGUAGE_LOOKUP.get(l, {"color": "#94A3B8", "abbr": l[:2].upper()})} for l in user.languages_list],
        "builder_type": BUILDER_TYPE_META.get(user.builder_type) if user.builder_type else None,
    }


@app.route("/api/users/search")
@login_required
def search_users():
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return jsonify([])

    matches = (
        User.query
        .outerjoin(BuilderProfile, User.id == BuilderProfile.user_id)
        .outerjoin(InvestorProfile, User.id == InvestorProfile.user_id)
        .outerjoin(CompanyProfile, User.id == CompanyProfile.user_id)
        .filter(User.id != current_user.id)
        .filter(User.role != "vision_ai")
        .filter(or_(
            User.username.ilike(f"%{q}%"),
            BuilderProfile.full_name.ilike(f"%{q}%"),
            InvestorProfile.full_name.ilike(f"%{q}%"),
            CompanyProfile.company_name.ilike(f"%{q}%"),
        ))
        .limit(8)
        .all()
    )
    return jsonify([_user_search_result(u) for u in matches])


@app.route("/api/users/<int:user_id>/profile")
@login_required
def api_user_profile(user_id):
    user = User.query.get_or_404(user_id)
    if not user.is_vision_ai:
        notify_profile_view(user, current_user)
        db.session.commit()
    return jsonify(_user_profile_payload(user))


# ---------------------------------------------------------------------------
# VISION AI
# ---------------------------------------------------------------------------

@app.route("/api/my-projects")
@login_required
def api_my_projects():
    """Lightweight project list for the builder's project picker in the AI panel."""
    if current_user.role != "builder":
        return jsonify([])
    projects = (
        Project.query.filter_by(owner_id=current_user.id)
        .order_by(Project.updated_at.desc())
        .all()
    )
    return jsonify([{"id": p.id, "project_name": p.project_name} for p in projects])


@app.route("/api/public-projects")
@login_required
def api_public_projects():
    """Lightweight public project list for the investor project picker(s) in the AI panel."""
    if current_user.role != "investor":
        return jsonify([])
    projects = (
        Project.query.filter_by(public_project=True)
        .order_by(Project.updated_at.desc())
        .limit(50)
        .all()
    )
    return jsonify([
        {"id": p.id, "project_name": p.project_name, "owner_username": p.owner.username}
        for p in projects
    ])


def _project_ai_dict(project):
    """Only the fields VISION AI is allowed to reason about — never invents beyond this."""
    return {
        "project_name": project.project_name,
        "category": project.category,
        "stage": project.stage,
        "overview": project.overview,
        "inspiration": project.inspiration,
        "problem": project.problem,
        "solution": project.solution,
        "investment_open": project.investment_open,
        "owner_username": project.owner.username,
    }


@app.route("/api/vision-ai", methods=["POST"])
@login_required
def vision_ai_endpoint():
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "").strip()
    prompt = (data.get("prompt") or "").strip()
    project_id = data.get("project_id")

    project = Project.query.get(project_id) if project_id else None

    # Builders may only run project-specific actions on their own projects.
    if (
        project
        and current_user.role == "builder"
        and project.owner_id != current_user.id
        and action in ("project_review", "improve_pitch", "startup_roadmap", "risk_analysis", "scale_plan", "find_matches", "startup_score", "pitch_practice")
    ):
        abort(403)

    session_context = {
        "user_role": current_user.role,
        "user_display_name": current_user.display_name,
        "page": data.get("page", ""),
    }

    try:
        if action == "project_review":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(project_review_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "improve_pitch":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(improve_pitch_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "startup_roadmap":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(startup_roadmap_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "risk_analysis":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(risk_analysis_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "scale_plan":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(scale_plan_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "find_matches":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            candidates = (
                User.query.filter(User.role.in_(["investor", "company"]))
                .order_by(User.created_at.desc())
                .limit(30)
                .all()
            )
            candidate_dicts = []
            for u in candidates:
                if u.role == "investor" and u.investor_profile:
                    candidate_dicts.append({
                        "id": u.id, "username": u.username, "role": "investor",
                        "investor_type": u.investor_profile.investor_type,
                        "bio": u.investor_profile.bio,
                    })
                elif u.role == "company" and u.company_profile:
                    candidate_dicts.append({
                        "id": u.id, "username": u.username, "role": "company",
                        "industry": u.company_profile.industry,
                        "bio": u.company_profile.bio,
                    })
            result = ask_vision_ai_json(
                find_matches_prompt(_project_ai_dict(project), candidate_dicts), context=session_context
            )
            # Attach live profile info (avatar, reputation, display name) to
            # whatever the model matched, purely for rendering — the model
            # never sees or invents this part.
            matched_ids = {m.get("id") for m in (result.get("matches") or []) if isinstance(m, dict)}
            users_by_id = {u.id: u for u in candidates if u.id in matched_ids}
            for m in (result.get("matches") or []):
                if not isinstance(m, dict):
                    continue
                u = users_by_id.get(m.get("id"))
                if u:
                    m["avatar_url"] = u.avatar_url
                    m["display_name"] = u.display_name
                    m["reputation"] = reputation_to_dict(u.reputation)
            return jsonify({"action": action, "result": result})

        if action == "supercharge_pitch":
            # Works on the CREATE PROJECT form's current draft text, before
            # anything is saved — no project_id needed. Can be called
            # repeatedly; each call starts from whatever text is passed in,
            # so hitting it again re-supercharges the already-improved draft.
            draft = {
                "project_name": (data.get("project_name") or "").strip(),
                "category": (data.get("category") or "").strip(),
                "overview": (data.get("overview") or "").strip(),
                "problem": (data.get("problem") or "").strip(),
                "solution": (data.get("solution") or "").strip(),
            }
            if not any([draft["project_name"], draft["overview"], draft["problem"], draft["solution"]]):
                return jsonify({"error": "Write at least a little first — a project name or a sentence of overview."}), 400
            result = ask_vision_ai_json(supercharge_pitch_prompt(draft), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "startup_chat":
            if not prompt:
                return jsonify({"error": "Ask a question first."}), 400
            proj_dict = _project_ai_dict(project) if project else None
            text = ask_vision_ai(startup_chat_prompt(prompt, proj_dict), context=session_context)
            return jsonify({"action": action, "result": {"text": text}})

        if action == "investment_analysis":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(investment_analysis_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "due_diligence_questions":
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(due_diligence_questions_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "partnership_suggestions":
            if current_user.role != "company":
                abort(403)
            company = current_user.company_profile
            company_dict = {
                "company_name": current_user.display_name,
                "industry": company.industry if company else None,
                "bio": company.bio if company else None,
            }
            candidates = (
                Project.query.filter_by(public_project=True)
                .order_by(Project.created_at.desc())
                .limit(15)
                .all()
            )
            candidate_dicts = [_project_ai_dict(p) for p in candidates]
            result = ask_vision_ai_json(
                partnership_suggestions_prompt(company_dict, candidate_dicts), context=session_context
            )
            return jsonify({"action": action, "result": result})

        if action == "startup_score":
            # AI Startup Score — instant feedback on startup quality.
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(startup_score_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "pitch_practice":
            # AI Pitch Practice — mock investor Q&A to prep founders for real meetings.
            if not project:
                return jsonify({"error": "Pick a project first."}), 400
            result = ask_vision_ai_json(pitch_practice_prompt(_project_ai_dict(project)), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "weekly_advisor":
            # AI Weekly Startup Advisor — personalized recommendations each week,
            # built from everything the builder currently has live.
            if current_user.role != "builder":
                abort(403)
            my_projects = (
                Project.query.filter_by(owner_id=current_user.id)
                .order_by(Project.updated_at.desc())
                .all()
            )
            project_dicts = [_project_ai_dict(p) for p in my_projects]
            result = ask_vision_ai_json(
                weekly_advisor_prompt(current_user.display_name, project_dicts), context=session_context
            )
            return jsonify({"action": action, "result": result})

        if action == "compare_startups":
            # AI Compare Startups — lets investors weigh opportunities side by side.
            if current_user.role != "investor":
                abort(403)
            project_ids = data.get("project_ids") or []
            if not isinstance(project_ids, list) or len(project_ids) < 2:
                return jsonify({"error": "Pick at least two projects to compare."}), 400
            projects_to_compare = (
                Project.query.filter(Project.id.in_(project_ids), Project.public_project == True)
                .limit(4)
                .all()
            )
            if len(projects_to_compare) < 2:
                return jsonify({"error": "Couldn't find those projects."}), 400
            project_dicts = [_project_ai_dict(p) for p in projects_to_compare]
            result = ask_vision_ai_json(compare_startups_prompt(project_dicts), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "outreach_writer":
            if current_user.role != "company":
                abort(403)
            company = current_user.company_profile
            company_dict = {
                "company_name": current_user.display_name,
                "industry": company.industry if company else None,
            }
            target_dict = {
                "username": project.owner.username if project else data.get("target_username", ""),
                "project_name": project.project_name if project else data.get("target_project_name", "their project"),
            }
            result = ask_vision_ai_json(outreach_message_prompt(company_dict, target_dict), context=session_context)
            return jsonify({"action": action, "result": result})

        if action == "universal_chat":
            if not prompt:
                return jsonify({"error": "Ask a question first."}), 400
            text = ask_vision_ai(universal_chat_prompt(prompt, session_context), context=session_context)
            return jsonify({"action": action, "result": {"text": text}})

        return jsonify({"error": f"Unknown action: {action}"}), 400

    except RuntimeError as e:
        # Most commonly: GROQ_API_KEY missing from .env
        return jsonify({"error": str(e)}), 503
    except Exception:
        app.logger.exception("VISION AI request failed")
        return jsonify({"error": "VISION AI couldn't process that request. Please try again."}), 500


@app.route("/dashboard/profile")
@login_required
def profile_page():
    my_projects = None
    if current_user.role == "builder":
        my_projects = (
            Project.query.filter_by(owner_id=current_user.id)
            .order_by(Project.updated_at.desc())
            .all()
        )
    return render_template(
        "profile.html",
        active_panel="profile",
        profile_user=current_user,
        profile_data=_user_profile_payload(current_user),
        progress=get_reputation_progress(current_user),
        my_projects=my_projects,
    )


@app.route("/help/badges")
@login_required
def help_badges():
    return render_template(
        "help_badges.html",
        active_panel="help",
        badge_data=help_badge_data(),
    )


# ---------------------------------------------------------------------------
# Direct messages
# ---------------------------------------------------------------------------

@app.route("/messages")
@login_required
def messages_page():
    conversations = (
        Conversation.query
        .join(ConversationMember, Conversation.id == ConversationMember.conversation_id)
        .filter(ConversationMember.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
        .all()
    )
    return render_template(
        "messages.html",
        conversations=conversations,
        active_conversation_id=request.args.get("conversation_id", type=int),
    )


@app.route("/messages/<int:conversation_id>")
@login_required
def view_conversation(conversation_id):
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)
    return redirect(url_for("messages_page", conversation_id=conversation_id))


@app.route("/api/conversations")
@login_required
def api_conversations():
    conversations = (
        Conversation.query
        .join(ConversationMember, Conversation.id == ConversationMember.conversation_id)
        .filter(ConversationMember.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
        .all()
    )
    out = []
    for convo in conversations:
        last = convo.last_message
        entry = {
            "id": convo.id,
            "is_group": convo.is_group,
            "title": convo.title_for(current_user.id),
            "subtitle": convo.subtitle_for(current_user.id),
            "last_message": last.content if last else None,
            "last_message_at": last.created_at.isoformat() if last else None,
            "unread_count": convo.unread_count_for(current_user.id),
        }
        if convo.is_group:
            entry["project_id"] = convo.project_id
            entry["members"] = [
                {"id": u.id, "name": u.display_name, "avatar_url": u.avatar_url}
                for u in convo.other_members(current_user.id)
            ]
        else:
            other = convo.other_member(current_user.id)
            if not other:
                continue
            entry["other_user"] = {
                "id": other.id,
                "name": other.display_name,
                "role": other.role,
                "avatar_url": other.avatar_url,
                "reputation": reputation_to_dict(other.reputation),
            }
        out.append(entry)
    return jsonify(out)


def member_function(user):
    """A member's function within a project team, for the group chat's
    sender labels and Group Info panel. Reuses data that already exists
    (builder_type, primary_skill) rather than adding a whole new
    'assign a team role' feature — every builder already states a
    primary skill and a software/hardware type on their profile.

    Returns {"label": "Frontend Developer", "key": "frontend"} — `key` is
    one of frontend/backend/hardware/design/data/product/builder/investor/
    company, and the frontend maps `key` to an icon.
    """
    if user.role == "investor":
        return {"label": "Investor", "key": "investor"}
    if user.role == "company":
        return {"label": "Company", "key": "company"}
    if user.role != "builder" or not user.builder_profile:
        return {"label": user.role.title() if user.role else "Member", "key": "builder"}

    skill = (user.builder_profile.primary_skill or "").strip()
    builder_type = (user.builder_profile.builder_type or "").lower()
    haystack = f"{skill} {builder_type}".lower()

    if "hardware" in haystack or "embedded" in haystack or "electr" in haystack or "firmware" in haystack:
        key = "hardware"
    elif "front" in haystack or " ui" in haystack or "ux" in haystack:
        key = "frontend"
    elif "back" in haystack or "server" in haystack or "api" in haystack or "database" in haystack or "devops" in haystack:
        key = "backend"
    elif "design" in haystack:
        key = "design"
    elif "data" in haystack or "machine learning" in haystack or " ml" in haystack or " ai" in haystack:
        key = "data"
    elif "product" in haystack or "pm" in haystack:
        key = "product"
    else:
        key = "builder"

    if skill:
        label = skill
    elif builder_type == "hardware":
        label = "Hardware Builder"
    elif builder_type == "software":
        label = "Software Builder"
    else:
        label = "Builder"

    return {"label": label, "key": key}


def message_attachment_url(m):
    if not m.attachment_filename:
        return None
    return url_for("static", filename=f"uploads/messages/{m.attachment_filename}")


def serialize_message(m, convo, viewer_id):
    is_deleted = bool(getattr(m, "deleted_at", None))
    data = {
        "id": m.id,
        "sender_id": m.sender_id,
        "sender_name": m.sender.display_name if (convo.is_group or m.sender.is_vision_ai) else None,
        "sender_avatar_url": m.sender.avatar_url if (convo.is_group or m.sender.is_vision_ai) else None,
        "sender_function": member_function(m.sender) if (convo.is_group and not m.sender.is_vision_ai) else None,
        "content": "This message was deleted." if is_deleted else m.content,
        "created_at": m.created_at.isoformat(),
        "is_mine": m.sender_id == viewer_id,
        "is_vision_ai": m.sender.is_vision_ai,
        "is_read": m.is_read,
        "edited_at": m.edited_at.isoformat() if getattr(m, "edited_at", None) else None,
        "is_deleted": is_deleted,
        "is_forwarded": bool(m.is_forwarded),
        "is_starred": m.is_starred_by(viewer_id),
        "reactions": m.reactions_summary(viewer_id),
        "reply_to": None,
        "attachment": None,
    }
    if not is_deleted and m.reply_to_id and m.reply_to:
        rt = m.reply_to
        data["reply_to"] = {
            "id": rt.id,
            "sender_name": rt.sender.display_name,
            "content": "This message was deleted." if getattr(rt, "deleted_at", None) else rt.content,
            "is_deleted": bool(getattr(rt, "deleted_at", None)),
        }
    if not is_deleted and m.attachment_filename:
        data["attachment"] = {
            "url": message_attachment_url(m),
            "kind": m.attachment_kind,
            "original_name": m.attachment_original_name,
        }
    return data


@app.route("/api/conversations/<int:conversation_id>/messages")
@login_required
def api_conversation_messages(conversation_id):
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)

    for m in convo.messages:
        if m.sender_id != current_user.id and not m.is_read:
            m.is_read = True
    my_membership = next((m for m in convo.members if m.user_id == current_user.id), None)
    if my_membership:
        my_membership.last_read_at = datetime.utcnow()
    db.session.commit()

    # ?after_id=<message_id> — used by the poller so it only pulls messages
    # newer than the last one it already has, instead of re-fetching and
    # re-rendering the whole thread every few seconds.
    after_id = request.args.get("after_id", type=int)
    messages = convo.messages
    if after_id:
        messages = [m for m in messages if m.id > after_id]

    payload = {
        "id": convo.id,
        "is_group": convo.is_group,
        "title": convo.title_for(current_user.id),
        "subtitle": convo.subtitle_for(current_user.id),
        "messages": [serialize_message(m, convo, current_user.id) for m in messages],
    }

    if after_id:
        # Delta responses skip the group/other_user metadata below — the
        # poller already has it from the initial full load.
        return jsonify(payload)

    if convo.is_group:
        payload["project_id"] = convo.project_id
        payload["is_owner"] = bool(convo.project and convo.project.owner_id == current_user.id)
        payload["members"] = [
            {
                "id": u.id, "name": u.display_name, "avatar_url": u.avatar_url,
                "role": u.role, "reputation": reputation_to_dict(u.reputation),
                "is_owner": bool(convo.project and convo.project.owner_id == u.id),
                "function": member_function(u),
            }
            for u in [m.user for m in convo.members]
        ]
        last_msg = convo.last_message
        if last_msg and not getattr(last_msg, "deleted_at", None):
            seen_by = [
                m.user.display_name for m in convo.members
                if m.user_id != last_msg.sender_id and m.last_read_at and m.last_read_at >= last_msg.created_at
            ]
            payload["last_message_seen_by"] = seen_by
    else:
        other = convo.other_member(current_user.id)
        payload["other_user"] = {
            "id": other.id if other else None,
            "name": other.display_name if other else "Unknown",
            "role": other.role if other else "",
            "country": (
                other.builder_profile.country if other and other.role == "builder" and other.builder_profile else
                other.investor_profile.country if other and other.role == "investor" and other.investor_profile else
                other.company_profile.country if other and other.role == "company" and other.company_profile else ""
            ),
            "avatar_url": other.avatar_url if other else None,
            "reputation": reputation_to_dict(other.reputation) if other else None,
            "is_blocked_by_me": (
                BlockedUser.query.filter_by(blocker_id=current_user.id, blocked_id=other.id).first() is not None
                if other else False
            ),
            "has_blocked_me": (
                BlockedUser.query.filter_by(blocker_id=other.id, blocked_id=current_user.id).first() is not None
                if other else False
            ),
        }

    return jsonify(payload)


@app.route("/api/conversations/<int:conversation_id>/messages", methods=["POST"])
@login_required
def api_send_message(conversation_id):
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)

    if not convo.is_group:
        other = convo.other_member(current_user.id)
        if other and is_blocked_pair(current_user.id, other.id):
            return jsonify({"error": "You can't message this user."}), 403

    content = request.form.get("content", "").strip()
    attachment_file = request.files.get("attachment")
    if not content and not attachment_file:
        return jsonify({"error": "Message cannot be empty."}), 400

    attachment_filename, attachment_original_name, attachment_kind = (None, None, None)
    if attachment_file and attachment_file.filename:
        attachment_filename, attachment_original_name, attachment_kind = save_message_attachment(attachment_file)
        if not attachment_filename:
            return jsonify({"error": "That file couldn't be attached — check the type and that it's under 15MB."}), 400
        if not content:
            content = f"Sent {'an image' if attachment_kind == 'image' else 'a file'}: {attachment_original_name}"

    reply_to_id = request.form.get("reply_to_id", type=int)
    reply_to = None
    if reply_to_id:
        reply_to = Message.query.filter_by(id=reply_to_id, conversation_id=convo.id).first()

    message = Message(
        conversation_id=convo.id, sender_id=current_user.id, content=content,
        reply_to_id=reply_to.id if reply_to else None,
        attachment_filename=attachment_filename,
        attachment_original_name=attachment_original_name,
        attachment_kind=attachment_kind,
    )
    db.session.add(message)
    db.session.commit()

    notify_new_message(convo, current_user, message)
    db.session.commit()

    response = serialize_message(message, convo, current_user.id)

    # If VISION AI was tagged, have it answer right in the thread. A bare
    # "@VISIONAI" with nothing else strips down to an empty question, which
    # used to silently fail the `if question:` check below and produce no
    # reply at all — give it a sensible default instead of requiring text.
    question, was_tagged = extract_vision_ai_mention(content)
    if was_tagged:
        if not question:
            question = (
                "They just tagged you with no specific question attached — "
                "give a short, friendly hello and ask what they'd like help with."
            )
        bot = get_vision_ai_user()
        reply_text = build_vision_ai_reply(convo, current_user, question)

        ai_message = Message(conversation_id=convo.id, sender_id=bot.id, content=reply_text)
        db.session.add(ai_message)
        db.session.commit()

        response["ai_reply"] = {
            "id": ai_message.id,
            "sender_id": bot.id,
            "sender_name": bot.display_name,
            "sender_avatar_url": bot.avatar_url,
            "content": ai_message.content,
            "created_at": ai_message.created_at.isoformat(),
            "is_mine": False,
            "is_vision_ai": True,
        }

    return jsonify(response)


@app.route("/api/conversations/<int:conversation_id>/messages/<int:message_id>", methods=["PATCH"])
@login_required
def api_edit_message(conversation_id, message_id):
    """Lets the sender of a message change its text after the fact — the
    "edit" affordance in the WhatsApp-style chat UI. Requires Message.edited_at
    (see the models.py note above the imports at the top of this file)."""
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)

    message = Message.query.get_or_404(message_id)
    if message.conversation_id != convo.id:
        abort(404)
    if message.sender_id != current_user.id:
        abort(403)
    if message.sender.is_vision_ai:
        abort(400)
    if getattr(message, "deleted_at", None):
        return jsonify({"error": "Can't edit a deleted message."}), 400

    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Message cannot be empty."}), 400

    message.content = content
    message.edited_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        "id": message.id,
        "content": message.content,
        "edited_at": message.edited_at.isoformat(),
    })


@app.route("/api/conversations/<int:conversation_id>/messages/<int:message_id>", methods=["DELETE"])
@login_required
def api_delete_message(conversation_id, message_id):
    """Sender-only "delete for everyone" — the content is replaced with a
    placeholder in every future read of this message, not actually erased.
    Requires Message.deleted_at (see the models.py note above the imports
    at the top of this file)."""
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)

    message = Message.query.get_or_404(message_id)
    if message.conversation_id != convo.id:
        abort(404)
    if message.sender_id != current_user.id:
        abort(403)
    if message.sender.is_vision_ai:
        abort(400)

    message.deleted_at = datetime.utcnow()
    db.session.commit()

    return jsonify({"id": message.id, "deleted_at": message.deleted_at.isoformat()})


# A small fixed emoji set, matching WhatsApp's quick-react tray.
ALLOWED_REACTION_EMOJI = {"👍", "❤️", "😂", "😮", "😢", "🙏"}


@app.route("/api/conversations/<int:conversation_id>/members", methods=["POST"])
@login_required
def api_add_group_member(conversation_id):
    """Only the project owner (the group's leader) can add people directly
    to the team chat. Note: this adds chat membership only — it doesn't
    create or touch a CollaborationRequest, so someone added this way
    won't show up as an 'accepted collaborator' elsewhere in the app."""
    convo = Conversation.query.get_or_404(conversation_id)
    if not convo.is_group:
        abort(400)
    if not (convo.project and convo.project.owner_id == current_user.id):
        return jsonify({"error": "Only the group leader can add members."}), 403

    user_id = (request.get_json(silent=True) or {}).get("user_id")
    user = User.query.get_or_404(user_id)
    if any(m.user_id == user.id for m in convo.members):
        return jsonify({"error": f"{user.display_name} is already in this group."}), 400

    db.session.add(ConversationMember(conversation_id=convo.id, user_id=user.id))
    db.session.add(Notification(
        user_id=user.id, actor_id=current_user.id,
        category=Notification.CATEGORY_COLLABORATION, type="added_to_group",
        text=f"{current_user.display_name} added you to \"{convo.title_for(user.id)}\".",
        link=url_for("messages_page", conversation_id=convo.id),
        conversation_id=convo.id,
    ))
    db.session.commit()

    return jsonify({"member": {
        "id": user.id, "name": user.display_name, "avatar_url": user.avatar_url,
        "role": user.role, "is_owner": False, "function": member_function(user),
    }})


@app.route("/api/conversations/<int:conversation_id>/members/<int:user_id>", methods=["DELETE"])
@login_required
def api_remove_group_member(conversation_id, user_id):
    """Owner-only. The project owner can't be removed this way — kicking
    the group's leader out of their own project's chat isn't supported."""
    convo = Conversation.query.get_or_404(conversation_id)
    if not convo.is_group:
        abort(400)
    if not (convo.project and convo.project.owner_id == current_user.id):
        return jsonify({"error": "Only the group leader can remove members."}), 403
    if convo.project and convo.project.owner_id == user_id:
        return jsonify({"error": "The group leader can't be removed."}), 400

    member = ConversationMember.query.filter_by(conversation_id=convo.id, user_id=user_id).first_or_404()
    removed_user = member.user
    group_title = convo.title_for(user_id)
    db.session.delete(member)
    db.session.add(Notification(
        user_id=user_id, actor_id=current_user.id,
        category=Notification.CATEGORY_COLLABORATION, type="removed_from_group",
        text=f"{current_user.display_name} removed you from \"{group_title}\".",
        link=url_for("messages_page"),
    ))
    db.session.commit()

    return jsonify({"removed_id": user_id, "removed_name": removed_user.display_name})


@app.route("/api/conversations/<int:conversation_id>/messages/<int:message_id>/react", methods=["POST"])
@login_required
def api_react_to_message(conversation_id, message_id):
    """Tapping the same emoji again removes it; tapping a different one
    swaps it — one reaction per person per message, like WhatsApp/iMessage."""
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)

    message = Message.query.get_or_404(message_id)
    if message.conversation_id != convo.id or getattr(message, "deleted_at", None):
        abort(404)

    emoji = (request.get_json(silent=True) or {}).get("emoji")
    if emoji not in ALLOWED_REACTION_EMOJI:
        return jsonify({"error": "Unsupported reaction."}), 400

    existing = MessageReaction.query.filter_by(message_id=message.id, user_id=current_user.id).first()
    if existing and existing.emoji == emoji:
        db.session.delete(existing)
    elif existing:
        existing.emoji = emoji
    else:
        db.session.add(MessageReaction(message_id=message.id, user_id=current_user.id, emoji=emoji))
    db.session.commit()

    return jsonify({"reactions": message.reactions_summary(current_user.id)})


@app.route("/api/conversations/<int:conversation_id>/messages/<int:message_id>/star", methods=["POST"])
@login_required
def api_toggle_star(conversation_id, message_id):
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)

    message = Message.query.get_or_404(message_id)
    if message.conversation_id != convo.id:
        abort(404)

    existing = MessageStar.query.filter_by(message_id=message.id, user_id=current_user.id).first()
    if existing:
        db.session.delete(existing)
        starred = False
    else:
        db.session.add(MessageStar(message_id=message.id, user_id=current_user.id))
        starred = True
    db.session.commit()

    return jsonify({"starred": starred})


@app.route("/api/starred-messages")
@login_required
def api_starred_messages():
    """All of the current user's starred messages across every conversation
    they're still a member of — their own private 'Starred Messages' list."""
    stars = (
        MessageStar.query
        .filter_by(user_id=current_user.id)
        .join(Message, MessageStar.message_id == Message.id)
        .order_by(Message.created_at.desc())
        .all()
    )
    out = []
    for star in stars:
        m = star.message
        convo = m.conversation
        if current_user.id not in [cm.user_id for cm in convo.members]:
            continue
        out.append({
            "conversation_id": convo.id,
            "conversation_title": convo.title_for(current_user.id),
            "message": serialize_message(m, convo, current_user.id),
        })
    return jsonify({"starred": out})


@app.route("/api/conversations/<int:conversation_id>/messages/<int:message_id>/forward", methods=["POST"])
@login_required
def api_forward_message(conversation_id, message_id):
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)

    message = Message.query.get_or_404(message_id)
    if message.conversation_id != convo.id or getattr(message, "deleted_at", None):
        return jsonify({"error": "This message can't be forwarded."}), 400

    target_id = (request.get_json(silent=True) or {}).get("conversation_id")
    target = Conversation.query.get_or_404(target_id)
    if current_user.id not in [m.user_id for m in target.members]:
        abort(403)
    if not target.is_group:
        other = target.other_member(current_user.id)
        if other and is_blocked_pair(current_user.id, other.id):
            return jsonify({"error": "You can't message this user."}), 403

    forwarded = Message(
        conversation_id=target.id, sender_id=current_user.id, content=message.content,
        is_forwarded=True,
        attachment_filename=message.attachment_filename,
        attachment_original_name=message.attachment_original_name,
        attachment_kind=message.attachment_kind,
    )
    db.session.add(forwarded)
    db.session.commit()
    notify_new_message(target, current_user, forwarded)
    db.session.commit()

    return jsonify({
        "conversation_id": target.id,
        "message": serialize_message(forwarded, target, current_user.id),
    })


# In-memory "who's typing" tracker: {conversation_id: {user_id: expires_at}}.
# Deliberately not a DB table — this is throwaway, sub-second-relevant state
# that would just churn the database. Fine for a single-process deployment;
# a multi-worker/multi-dyno deployment would want this in Redis instead.
_TYPING_STATE = {}
_TYPING_TTL_SECONDS = 6


@app.route("/api/conversations/<int:conversation_id>/typing", methods=["POST"])
@login_required
def api_set_typing(conversation_id):
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)
    bucket = _TYPING_STATE.setdefault(conversation_id, {})
    bucket[current_user.id] = time.time() + _TYPING_TTL_SECONDS
    return jsonify({"ok": True})


@app.route("/api/conversations/<int:conversation_id>/typing")
@login_required
def api_get_typing(conversation_id):
    convo = Conversation.query.get_or_404(conversation_id)
    if current_user.id not in [m.user_id for m in convo.members]:
        abort(403)
    bucket = _TYPING_STATE.get(conversation_id, {})
    now = time.time()
    active_ids = [uid for uid, expires in bucket.items() if expires > now and uid != current_user.id]
    names = [m.user.display_name for m in convo.members if m.user_id in active_ids]
    return jsonify({"typing": names})


@app.route("/api/users/<int:user_id>/block", methods=["POST"])
@login_required
def api_block_user(user_id):
    if user_id == current_user.id:
        return jsonify({"error": "You can't block yourself."}), 400
    other = User.query.get_or_404(user_id)
    existing = BlockedUser.query.filter_by(blocker_id=current_user.id, blocked_id=other.id).first()
    if not existing:
        db.session.add(BlockedUser(blocker_id=current_user.id, blocked_id=other.id))
        db.session.commit()
    return jsonify({"blocked": True})


@app.route("/api/users/<int:user_id>/unblock", methods=["POST"])
@login_required
def api_unblock_user(user_id):
    existing = BlockedUser.query.filter_by(blocker_id=current_user.id, blocked_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify({"blocked": False})


@app.route("/api/conversations/start/<int:user_id>", methods=["POST"])
@login_required
def api_start_conversation(user_id):
    if user_id == current_user.id:
        return jsonify({"error": "You can't message yourself."}), 400
    other = User.query.get_or_404(user_id)
    convo = get_or_create_conversation(current_user.id, other.id)
    db.session.commit()
    return jsonify({"conversation_id": convo.id})


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def _notification_categories_payload(user):
    """Tab list for the notification panel, each with its own unread count."""
    all_notifs = user.notifications
    counts = {}
    for n in all_notifs:
        if not n.is_read:
            counts[n.category] = counts.get(n.category, 0) + 1

    tabs = [{"id": "all", "label": "All", "count": sum(counts.values())}]
    for cat_id, label in CATEGORY_LABELS.items():
        tabs.append({"id": cat_id, "label": label, "count": counts.get(cat_id, 0)})
    return tabs


@app.route("/api/notifications")
@login_required
def api_notifications():
    category = request.args.get("category", "all")
    notifs = get_notifications(current_user, category=category)
    return jsonify({
        "notifications": [
            {**n.to_dict(), "icon": TYPE_ICONS.get(n.type, "bell")} for n in notifs
        ],
        "categories": _notification_categories_payload(current_user),
        "unread_count": current_user.unread_notification_count,
    })


@app.route("/api/notifications/unread-count")
@login_required
def api_notifications_unread_count():
    return jsonify({"unread_count": current_user.unread_notification_count})


@app.route("/api/notifications/<int:notification_id>/read", methods=["POST"])
@login_required
def api_mark_notification_read(notification_id):
    notif = Notification.query.get_or_404(notification_id)
    if notif.user_id != current_user.id:
        abort(403)
    notif.is_read = True
    db.session.commit()
    return jsonify({"id": notif.id, "is_read": True, "unread_count": current_user.unread_notification_count})


@app.route("/api/notifications/read-all", methods=["POST"])
@login_required
def api_mark_all_notifications_read():
    category = request.args.get("category", "all")
    query = Notification.query.filter_by(user_id=current_user.id, is_read=False)
    if category and category != "all":
        query = query.filter_by(category=category)
    query.update({"is_read": True})
    db.session.commit()
    return jsonify({"unread_count": current_user.unread_notification_count})


@app.route("/api/notifications/clear", methods=["POST"])
@login_required
def api_clear_notifications():
    category = request.args.get("category", "all")
    query = Notification.query.filter_by(user_id=current_user.id)
    if category and category != "all":
        query = query.filter_by(category=category)
    query.delete()
    db.session.commit()
    return jsonify({
        "unread_count": current_user.unread_notification_count,
        "categories": _notification_categories_payload(current_user),
    })


@app.route("/deals")
@login_required
def deals_dashboard():
    """Deal Room Dashboard — every deal the current user is a party to,
    across all their conversations, with role-appropriate grouping and
    basic search/filters."""
    deals = (
        Deal.query
        .join(Conversation, Deal.conversation_id == Conversation.id)
        .join(ConversationMember, Conversation.id == ConversationMember.conversation_id)
        .filter(ConversationMember.user_id == current_user.id)
        .order_by(Deal.updated_at.desc())
        .all()
    )

    q = (request.args.get("q") or "").strip().lower()
    status_filter = request.args.get("status") or ""
    type_filter = request.args.get("deal_type") or ""

    def matches(d):
        if status_filter and d.status != status_filter:
            return False
        if type_filter and d.deal_type != type_filter:
            return False
        if q and q not in (d.title or "").lower() and q not in (d.startup_name or "").lower() and q not in (d.other_party_name or "").lower():
            return False
        return True

    deals = [d for d in deals if matches(d)]

    if current_user.role == "builder":
        groups = [
            ("Pending Offers", [d for d in deals if d.status == "Pending"]),
            ("Negotiations", [d for d in deals if d.status == "Negotiating"]),
            ("Contracts Waiting Review", [d for d in deals if d.status == "Accepted" and not d.has_signed(current_user.id)]),
            ("Active Agreements", [d for d in deals if d.status == "Signed"]),
            ("Completed Deals", [d for d in deals if d.status in ("Completed", "Cancelled")]),
        ]
    elif current_user.role == "investor":
        groups = [
            ("Sent Offers", [d for d in deals if d.created_by_id == current_user.id and d.status == "Pending"]),
            ("Negotiations", [d for d in deals if d.status == "Negotiating"]),
            ("Accepted Deals", [d for d in deals if d.status == "Accepted"]),
            ("Portfolio Contracts", [d for d in deals if d.status in ("Signed", "Completed")]),
        ]
    else:  # company
        groups = [
            ("Partnership Deals", [d for d in deals if d.deal_type in ("partnership", "api_partnership")]),
            ("Sponsorship Deals", [d for d in deals if d.deal_type == "sponsorship"]),
            ("Pilot Projects", [d for d in deals if d.deal_type == "pilot"]),
            ("Licensing Deals", [d for d in deals if d.deal_type == "licensing"]),
            ("Other Deals", [d for d in deals if d.deal_type not in ("partnership", "api_partnership", "sponsorship", "pilot", "licensing")]),
        ]

    return render_template(
        "deals_dashboard.html",
        groups=groups,
        total_count=len(deals),
        deal_types=DEAL_TYPES,
        q=request.args.get("q", ""),
        status_filter=status_filter,
        type_filter=type_filter,
        statuses=["Pending", "Negotiating", "Accepted", "Signed", "Completed", "Cancelled"],
    )


# ---------------------------------------------------------------------------
# Deal Room
# ---------------------------------------------------------------------------

@app.route("/api/deal-types")
@login_required
def api_deal_types():
    """Powers Step 1 of the Create AI Contract wizard — grouped by whether
    the current user's counterpart in this kind of chat is an investor or
    a company, so each dashboard only offers the deals that make sense."""
    investor_types = [{"id": k, "label": v[0]} for k, v in DEAL_TYPES.items() if v[1] == "investor"]
    company_types = [{"id": k, "label": v[0]} for k, v in DEAL_TYPES.items() if v[1] == "company"]
    return jsonify({"investor": investor_types, "company": company_types})


@app.route("/api/conversations/<int:conversation_id>/deal")
@login_required
def api_get_deal(conversation_id):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal(convo)
    if not deal:
        return jsonify({"deal": None})

    payload = deal.to_summary_dict()
    payload["current_version"] = deal.current_version.to_dict() if deal.current_version else None
    payload["signatures"] = deal.signatures
    payload["i_have_signed"] = deal.has_signed(current_user.id)
    payload["risk_analysis"] = _json.loads(deal.risk_analysis_json) if deal.risk_analysis_json else None
    payload["fairness_breakdown"] = _json.loads(deal.fairness_breakdown_json) if deal.fairness_breakdown_json else None
    payload["activities"] = [a.to_dict() for a in deal.activities][-25:]
    payload["is_group"] = convo.is_group
    payload["members"] = [{"id": m.user_id, "name": m.user.display_name} for m in convo.members]
    # Cancelled/Completed deals are terminal — the conversation can start a
    # brand new one without losing this one from its history.
    payload["can_start_new"] = deal.status in ("Cancelled", "Completed")
    return jsonify({"deal": payload})


@app.route("/api/conversations/<int:conversation_id>/deal/create", methods=["POST"])
@login_required
def api_create_deal(conversation_id):
    convo = get_deal_conversation_or_403(conversation_id)
    existing = get_latest_deal(convo)
    if existing and existing.status not in ("Cancelled", "Completed"):
        return jsonify({"error": "This conversation already has an active Deal Room. Use Negotiate to update it, or cancel it first to start fresh."}), 400

    data = request.get_json(silent=True) or {}
    deal_type = data.get("deal_type")
    if deal_type not in DEAL_TYPES:
        return jsonify({"error": "Unknown deal type."}), 400

    other = convo.other_member(current_user.id)
    other_group_members = convo.other_members(current_user.id) if convo.is_group else []
    default_other_party_name = (
        ", ".join(m.display_name for m in other_group_members) if convo.is_group
        else (other.display_name if other else "")
    )
    terms = {
        "startup_name": data.get("startup_name"),
        "builder_name": data.get("builder_name") or (current_user.display_name if current_user.role == "builder" else (other.display_name if other else "")),
        "other_party_name": data.get("other_party_name") or default_other_party_name,
        "deal_title": data.get("deal_title"),
        "investment_amount": data.get("investment_amount"),
        "currency": data.get("currency") or "USD",
        "equity_percentage": data.get("equity_percentage"),
        "valuation": data.get("valuation"),
        "payment_schedule": data.get("payment_schedule"),
        "milestone_payments": data.get("milestone_payments"),
        "conditions": data.get("conditions") or {},
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "milestones": data.get("milestones"),
        "deliverables": data.get("deliverables"),
        "custom_clauses": data.get("custom_clauses"),
    }

    deal = Deal(
        conversation_id=convo.id,
        created_by_id=current_user.id,
        deal_type=deal_type,
        title=terms.get("deal_title") or DEAL_TYPES[deal_type][0],
        startup_name=terms.get("startup_name"),
        other_party_name=terms.get("other_party_name"),
        status="Pending",
        investment_amount=_safe_float(terms.get("investment_amount")),
        currency=terms.get("currency"),
        equity_percentage=_safe_float(terms.get("equity_percentage")),
        valuation=_safe_float(terms.get("valuation")),
        current_version_number=1,
    )
    db.session.add(deal)
    db.session.flush()

    try:
        title, sections, clauses = _generate_contract_for_terms(deal, terms)
    except RuntimeError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 503
    except Exception:
        app.logger.exception("Deal contract generation failed")
        db.session.rollback()
        return jsonify({"error": "VISION AI couldn't generate the contract just now — please try again."}), 502

    deal.title = title
    version = DealVersion(
        deal_id=deal.id,
        version_number=1,
        created_by_id=current_user.id,
        terms_json=_json.dumps(terms),
        contract_title=title,
        sections_json=_json.dumps(sections),
        clauses_json=_json.dumps(clauses),
        change_summary_json=None,
    )
    db.session.add(version)
    log_deal_activity(deal, "created", detail=f"{DEAL_TYPES[deal_type][0]} drafted")
    notify_deal_update(convo, f"{current_user.display_name} created a {DEAL_TYPES[deal_type][0]} in your Deal Room.")
    db.session.commit()

    return jsonify({"deal": deal.to_summary_dict(), "version": version.to_dict()})


@app.route("/api/conversations/<int:conversation_id>/deal/versions")
@login_required
def api_deal_versions(conversation_id):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    return jsonify({"versions": [v.to_dict(include_contract=False) for v in deal.versions]})


@app.route("/api/conversations/<int:conversation_id>/deal/versions/<int:version_number>")
@login_required
def api_deal_version_detail(conversation_id, version_number):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    version = next((v for v in deal.versions if v.version_number == version_number), None)
    if not version:
        abort(404)
    log_deal_activity(deal, "viewed", detail=f"Version {version_number} viewed")
    db.session.commit()
    return jsonify({"version": version.to_dict()})


@app.route("/api/conversations/<int:conversation_id>/deal/negotiate", methods=["POST"])
@login_required
def api_negotiate_deal(conversation_id):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    if deal.status in ("Signed", "Completed", "Cancelled"):
        return jsonify({"error": f"This deal is already {deal.status.lower()} and can't be negotiated further."}), 400

    data = request.get_json(silent=True) or {}
    updates = data.get("terms") or {}
    if not updates:
        return jsonify({"error": "Provide at least one changed term."}), 400

    old_version = deal.current_version
    new_terms = _merge_terms(old_version.terms if old_version else {}, updates)
    next_number = (old_version.version_number if old_version else 0) + 1

    try:
        title, sections, clauses = _generate_contract_for_terms(deal, new_terms)
        change_result = ask_vision_ai_json(
            negotiation_change_summary_prompt(deal.deal_type_label, old_version.terms if old_version else {}, new_terms),
            context={"role": "deal_room_negotiation_summary"},
            max_tokens=800,
        )
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception:
        app.logger.exception("Deal negotiation generation failed")
        return jsonify({"error": "VISION AI couldn't process that negotiation just now — please try again."}), 502

    changes = change_result.get("changes") or []

    version = DealVersion(
        deal_id=deal.id,
        version_number=next_number,
        created_by_id=current_user.id,
        terms_json=_json.dumps(new_terms),
        contract_title=title,
        sections_json=_json.dumps(sections),
        clauses_json=_json.dumps(clauses),
        change_summary_json=_json.dumps(changes),
    )
    db.session.add(version)

    deal.title = title
    deal.current_version_number = next_number
    deal.status = "Negotiating"
    deal.investment_amount = _safe_float(new_terms.get("investment_amount"))
    deal.equity_percentage = _safe_float(new_terms.get("equity_percentage"))
    deal.valuation = _safe_float(new_terms.get("valuation"))
    # A new round means any prior signatures no longer apply to the new terms.
    deal.signatures_json = None
    # Fairness/risk were computed against the old version — clear until re-analyzed.
    deal.fairness_builder = deal.fairness_other = deal.fairness_overall = None
    deal.fairness_explanation = None
    deal.fairness_breakdown_json = None
    deal.risk_analysis_json = None

    log_deal_activity(deal, "negotiation_started", detail=f"Version {next_number} proposed")
    notify_deal_update(convo, f"{current_user.display_name} sent a new version (V{next_number}) of your deal.")
    db.session.commit()

    return jsonify({"deal": deal.to_summary_dict(), "version": version.to_dict()})


@app.route("/api/conversations/<int:conversation_id>/deal/versions/<int:version_number>/decision", methods=["POST"])
@login_required
def api_decide_deal_version(conversation_id, version_number):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    version = next((v for v in deal.versions if v.version_number == version_number), None)
    if not version:
        abort(404)

    decision = (request.get_json(silent=True) or {}).get("decision")
    if decision not in ("accept", "reject"):
        return jsonify({"error": "decision must be 'accept' or 'reject'."}), 400

    version.decision = "accepted" if decision == "accept" else "countered"
    version.decided_by_id = current_user.id
    version.decided_at = datetime.utcnow()

    if decision == "accept":
        deal.status = "Accepted"
        log_deal_activity(deal, "accepted", detail=f"Version {version_number} accepted")
        notify_deal_update(convo, f"{current_user.display_name} accepted version {version_number} of your deal.")
    else:
        deal.status = "Negotiating"
        log_deal_activity(deal, "rejected", detail=f"Version {version_number} rejected — awaiting a counter-offer")
        notify_deal_update(convo, f"{current_user.display_name} rejected version {version_number} — it needs a counter-offer.")

    db.session.commit()
    return jsonify({"deal": deal.to_summary_dict()})


@app.route("/api/conversations/<int:conversation_id>/deal/analyze", methods=["POST"])
@login_required
def api_analyze_deal(conversation_id):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    version = deal.current_version
    if not version:
        return jsonify({"error": "No contract to analyze yet."}), 400

    try:
        result = ask_vision_ai_json(
            risk_and_fairness_prompt(deal.deal_type_label, version.terms, version.sections),
            context={"role": "deal_room_risk_analysis"},
            max_tokens=2500,
        )
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception:
        app.logger.exception("Deal risk analysis failed")
        return jsonify({"error": "VISION AI couldn't analyze this deal just now — please try again."}), 502

    fairness = result.get("fairness") or {}
    deal.fairness_builder = _safe_int(fairness.get("builder"))
    deal.fairness_other = _safe_int(fairness.get("other_party"))
    deal.fairness_overall = _safe_int(fairness.get("overall"))
    deal.fairness_explanation = fairness.get("explanation")
    deal.fairness_breakdown_json = _json.dumps(fairness.get("breakdown") or {})
    deal.risk_analysis_json = _json.dumps({
        "good_for_you": result.get("good_for_you") or [],
        "warnings": result.get("warnings") or [],
        "missing_clauses": result.get("missing_clauses") or [],
    })

    log_deal_activity(deal, "analyzed", detail=f"AI analyzed version {version.version_number}")
    db.session.commit()

    return jsonify({
        "risk_analysis": _json.loads(deal.risk_analysis_json),
        "fairness": {
            "builder": deal.fairness_builder,
            "other_party": deal.fairness_other,
            "overall": deal.fairness_overall,
            "explanation": deal.fairness_explanation,
            "breakdown": fairness.get("breakdown") or {},
        },
    })


@app.route("/api/conversations/<int:conversation_id>/deal/clause-action", methods=["POST"])
@login_required
def api_deal_clause_action(conversation_id):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)

    data = request.get_json(silent=True) or {}
    clause_text = (data.get("clause_text") or "").strip()
    action = data.get("action") or "explain"
    question = data.get("question")
    if not clause_text:
        return jsonify({"error": "clause_text is required."}), 400

    try:
        reply = ask_vision_ai(
            clause_action_prompt(action, clause_text, deal.deal_type_label, context_note=question),
            context={"role": "deal_room_clause_action"},
        )
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception:
        app.logger.exception("Deal clause action failed")
        return jsonify({"error": "VISION AI couldn't respond just now — please try again."}), 502

    return jsonify({"reply": reply})


@app.route("/api/conversations/<int:conversation_id>/deal/sign", methods=["POST"])
@login_required
def api_sign_deal(conversation_id):
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    if deal.status != "Accepted" and deal.status != "Signed":
        return jsonify({"error": "Both parties need to accept the current version before signing."}), 400
    if deal.has_signed(current_user.id):
        return jsonify({"error": "You've already signed this version."}), 400

    signatures = deal.signatures
    signatures.append({
        "user_id": current_user.id,
        "name": current_user.display_name,
        "signed_at": datetime.utcnow().isoformat(),
    })
    deal.signatures_json = _json.dumps(signatures)

    log_deal_activity(deal, "signed", detail=f"{current_user.display_name} signed")
    if deal.is_fully_signed():
        deal.status = "Signed"
        log_deal_activity(deal, "fully_signed", detail="Contract locked — both parties signed")
        notify_deal_update(convo, "Your deal is fully signed and locked.")
    else:
        notify_deal_update(convo, f"{current_user.display_name} signed the deal — your signature is next.")

    db.session.commit()
    return jsonify({"deal": deal.to_summary_dict(), "signatures": deal.signatures})


@app.route("/api/conversations/<int:conversation_id>/deal/status", methods=["POST"])
@login_required
def api_update_deal_status(conversation_id):
    """Manual status moves that aren't tied to a specific version — e.g.
    marking a signed deal Completed, or Cancelling a stalled negotiation."""
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    new_status = (request.get_json(silent=True) or {}).get("status")
    if new_status not in ("Completed", "Cancelled"):
        return jsonify({"error": "status must be 'Completed' or 'Cancelled'."}), 400

    deal.status = new_status
    log_deal_activity(deal, new_status.lower(), detail=f"Marked {new_status} by {current_user.display_name}")
    notify_deal_update(convo, f"{current_user.display_name} marked your deal as {new_status}.")
    db.session.commit()
    return jsonify({"deal": deal.to_summary_dict()})


@app.route("/deal-room/<int:conversation_id>/print")
@login_required
def deal_room_print(conversation_id):
    """A clean, print-friendly full contract view — the 'Generate PDF'
    button opens this and the person uses the browser's Print > Save as PDF.
    Swapping in a server-side renderer (e.g. WeasyPrint) later is a drop-in
    replacement for this route without touching the rest of the feature."""
    convo = get_deal_conversation_or_403(conversation_id)
    deal = get_latest_deal_or_404(convo)
    version = deal.current_version
    if not version:
        abort(404)
    return render_template("deal_contract_print.html", deal=deal, version=version)


@app.route("/api/investment-proposal", methods=["POST"])
@login_required
def api_investment_proposal():
    """'Request Investment' — a Builder describes their raise and VISION AI
    turns it into a structured proposal message sent straight into a chat
    with the chosen investor."""
    if current_user.role != "builder":
        abort(403)

    data = request.get_json(silent=True) or {}
    investor_id = data.get("investor_id")
    investor = User.query.filter_by(id=investor_id, role="investor").first()
    if not investor:
        return jsonify({"error": "Choose a valid investor to send this to."}), 400

    pitch = {
        "amount_needed": data.get("amount_needed"),
        "stage": data.get("stage"),
        "use_of_funds": data.get("use_of_funds"),
        "equity_offered": data.get("equity_offered"),
        "milestones": data.get("milestones"),
        "pitch_summary": data.get("pitch_summary"),
    }

    try:
        result = ask_vision_ai_json(
            investment_proposal_prompt(pitch),
            context={"role": "investment_proposal"},
            max_tokens=800,
        )
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception:
        app.logger.exception("Investment proposal generation failed")
        return jsonify({"error": "VISION AI couldn't draft that proposal just now — please try again."}), 502

    proposal_text = result.get("proposal") or "I'd love to walk you through a potential investment opportunity — let's chat!"

    convo = get_or_create_conversation(current_user.id, investor.id)
    message = Message(conversation_id=convo.id, sender_id=current_user.id, content=proposal_text)
    db.session.add(message)
    notify_new_message(convo, current_user, message)
    db.session.commit()

    return jsonify({
        "conversation_id": convo.id,
        "message": {"id": message.id, "content": message.content, "created_at": message.created_at.isoformat()},
    })


def _safe_float(value):
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _safe_int(value):
    try:
        return int(round(float(value))) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # host="0.0.0.0" makes the server reachable from other devices on the
    # same Wi-Fi/LAN (e.g. your phone) at http://<your-computer-ip>:5000.
    # This block only runs for local `python app.py` — Render starts the
    # app via gunicorn (see Procfile), which never hits this branch.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)