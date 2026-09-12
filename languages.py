"""
Canonical list of programming languages offered at signup, plus the visual
styling (color + short abbreviation) used to render them as small monogram
badges next to a user's reputation badge.

We deliberately don't use the official brand logos for each language (many
are trademarked marks) — instead each language gets a colored circular chip
with a 2-3 letter abbreviation, in the same visual language as the existing
reputation-letter badges. If you have a licensed icon set (e.g. Devicon,
Simple Icons under their respective licenses) you can swap LANGUAGES below
for real logo assets later.

IMPORTANT: main.js has a matching `LANGUAGE_META` object used to render
these same badges client-side (e.g. on the signup checkboxes and inside the
notification/profile-modal JS). If you add/remove a language here, update
that object too so the two stay in sync.
"""

# (name, hex color, abbreviation shown in the badge)
LANGUAGES = [
    ("JavaScript", "#F7DF1E", "JS"),
    ("TypeScript", "#3178C6", "TS"),
    ("Python", "#3776AB", "PY"),
    ("Java", "#E76F00", "JV"),
    ("C", "#A8B9CC", "C"),
    ("C++", "#00599C", "C+"),
    ("C#", "#68217A", "C#"),
    ("Go", "#00ADD8", "GO"),
    ("Rust", "#DEA584", "RS"),
    ("Ruby", "#CC342D", "RB"),
    ("PHP", "#777BB4", "PHP"),
    ("Swift", "#F05138", "SW"),
    ("Kotlin", "#7F52FF", "KT"),
    ("Dart", "#0175C2", "DT"),
    ("HTML/CSS", "#E44D26", "HTML"),
    ("SQL", "#4479A1", "SQL"),
    ("Shell", "#89E051", "SH"),
    ("R", "#276DC3", "R"),
    ("Scala", "#DC322F", "SC"),
    ("Elixir", "#6E4A7E", "EX"),
]

LANGUAGE_LOOKUP = {name: {"color": color, "abbr": abbr} for name, color, abbr in LANGUAGES}

# software / hardware / both — shown as a small icon next to a builder's
# language badges. Rendered client-side (see main.js CATEGORY_ICON_PATHS);
# this dict is just the source-of-truth label/color pairing for templates.
BUILDER_TYPE_META = {
    "software": {"label": "Software", "color": "#6366F1"},
    "hardware": {"label": "Hardware", "color": "#F59E0B"},
    "both": {"label": "Software & Hardware", "color": "#10B981"},
}
