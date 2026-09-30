"""
Database layer.

Default: SQLite file (zero-setup local dev).
Production: set DATABASE_URL to a PostgreSQL DSN, e.g.
    postgresql://user:pass@host:5432/nirmaan
No code changes required elsewhere — SQLAlchemy abstracts the dialect.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nirmaan.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
