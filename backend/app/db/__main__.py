"""Allow `python -m app.db.init_db` for docker entrypoint."""
from app.db.database import init_db

init_db()