# VISION

**Don't let a good idea die just because nobody saw it.**

VISION is a social platform for projects and innovation — a place for builders to showcase projects at any stage (idea → live product), get discovered by investors and companies, collaborate with other builders, and negotiate real deals, all backed by an AI copilot (VISION AI) woven throughout the product.

---

## Tech stack

- **Backend:** Python 3.12 + Flask, SQLAlchemy (via Flask-SQLAlchemy), Flask-Login for auth
- **Database:** SQLite locally (zero setup), PostgreSQL in production
- **Frontend:** Server-rendered Jinja2 templates + vanilla JavaScript + hand-written CSS (no frontend framework)
- **AI:** [Groq](https://groq.com) API running `openai/gpt-oss-120b`
- **Server:** Gunicorn (production), Flask dev server (local)

---

## 1. Prerequisites

- Python **3.12.x** (see [Known gotchas](#known-gotchas--why-versions-are-pinned) below for why the version matters)
- pip
- A free [Groq API key](https://console.groq.com/keys) — required for every AI feature to work
- Git

---

## 2. Clone & set up a virtual environment

```bash
git clone https://github.com/logicraft1234567-del/Vision.git
cd Vision

python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

---

## 3. Configure environment variables

Create a file named `.env` in the project root (this is git-ignored — never commit it):

```env
# Required
GROQ_API_KEY=your_groq_api_key_here

# Recommended (the app falls back to an insecure default if omitted — fine for local dev, not for production)
VISION_SECRET_KEY=replace-this-with-a-long-random-string

# Optional — omit this locally and the app automatically uses a local SQLite file instead
DATABASE_URL=

# Optional — defaults to openai/gpt-oss-120b if omitted
GROQ_MODEL=openai/gpt-oss-120b
```

| Variable | Required? | Purpose |
|---|---|---|
| `GROQ_API_KEY` | **Yes** | Powers every VISION AI feature. Without it, AI actions return a clear error instead of crashing the app — everything else still works. |
| `VISION_SECRET_KEY` | Recommended | Flask session signing key. Set a real random value before deploying anywhere public. |
| `DATABASE_URL` | No (local) / **Yes** (production) | Postgres connection string. Leave unset locally to use SQLite (`vision.db`, created automatically). |
| `GROQ_MODEL` | No | Overrides the default Groq model if you want to experiment with a different one. |

---

## 4. Run it locally

```bash
python app.py
```

The app will be available at **http://localhost:5000**. On first run it creates `vision.db` (SQLite) automatically — no migration step needed for local development.

---

## 5. Project structure (high level)

```
Vision/
├── app.py                  # Routes / views
├── models.py                # SQLAlchemy models
├── database.py               # Shared db = SQLAlchemy() instance
├── config.py                 # Env-driven configuration
├── languages.py               # Signup language badge data
├── notifications.py            # Notification + badge-award logic
├── services/
│   ├── vision_ai.py            # All Groq calls go through here
│   ├── vision_ai_prompts.py      # Prompt builders for general AI features
│   └── deal_ai_prompts.py         # Prompt builders for the Deal Room
├── templates/                  # Jinja2 templates (base.html, dashboards, _macros)
├── static/
│   ├── css/                      # style.css, vision-ai.css, deal-room.css, chat-features.css
│   ├── js/                        # main.js, vision-ai.js, deal-room.js
│   └── uploads/                    # User-uploaded images/videos (see note below)
└── requirements.txt
```

---

## 6. Deploying (Render)

This project is set up to deploy on [Render](https://render.com) as a Python web service.

1. Create a **PostgreSQL** instance on Render first, and a **Web Service** pointing at this repo, in the **same region** as each other.
2. On the web service, set these environment variables in the Render dashboard:
   - `GROQ_API_KEY`
   - `VISION_SECRET_KEY` — generate a real random value
   - `DATABASE_URL` — copy the **Internal Database URL** from your Postgres instance's Connect tab
   - `PYTHON_VERSION` = `3.12.6` (**important** — see gotchas below)
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`

> **Note on file uploads in production:** profile pictures, project media, and chat attachments are currently stored under `static/uploads/`, which lives on Render's local disk. Render's filesystem is **not persistent** across deploys/restarts — uploaded files can be lost on redeploy. For anything beyond a demo, mount a [Render Persistent Disk](https://render.com/docs/disks) or move uploads to object storage (e.g. S3-compatible storage) instead.

---

## Known gotchas — why versions are pinned

These are real issues hit while deploying this exact project — saving future-you the debugging time:

- **Set `PYTHON_VERSION` in Render's dashboard, not just a `runtime.txt` file.** Render's native Python runtime treats the `PYTHON_VERSION` environment variable as authoritative; a `runtime.txt` file is not reliably respected. Without it, Render may default to whatever the newest available Python version is, which can be too new for compiled dependencies like `psycopg2` to have working prebuilt wheels for yet (surfaces as `undefined symbol: _PyInterpreterState_Get` at runtime).
- **`requirements.txt` must list each package exactly once.** A duplicate/conflicting version line (e.g. `psycopg2-binary==2.9.9` *and* `psycopg2-binary>=2.9.10` both present) causes an immediate, unrecoverable `pip` `ResolutionImpossible` error at build time.
- **The `groq` SDK version matters.** Older `groq` releases can be incompatible with whatever `httpx` version pip resolves at install time (`TypeError: Client.__init__() got an unexpected keyword argument 'proxies'`), and very old `groq` releases don't support newer API parameters like `reasoning_effort` (`TypeError: Completions.create() got an unexpected keyword argument 'reasoning_effort'`). Keep `groq` reasonably current rather than pinned to an old minor version.
- **Render hands out `postgres://` URLs**, but SQLAlchemy 1.4+/psycopg2 require `postgresql://`. `config.py` already rewrites this automatically — you shouldn't need to touch it, but it's worth knowing if you ever see a scheme-related connection error.
- **`could not translate host name "dpg-xxxxx-a"`** means the internal Postgres hostname was used from outside Render's private network, the database and web service are in different regions, or the database itself was deleted/expired (free-tier Postgres instances expire after 90 days). Re-copy the current Internal Database URL from the Postgres instance's Connect tab if this happens.

---

## License

Add your license of choice here (MIT, Apache-2.0, etc.) before making the repo public, if it isn't already licensed.
