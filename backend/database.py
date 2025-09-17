# backend/database.py
import os
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, func
from sqlalchemy.orm import sessionmaker, declarative_base
import datetime

# Esta línea es la clave:
# 1. En Render, leerá la variable de entorno 'DATABASE_URL' que tú configures.
# 2. En tu computador local, al no encontrar la variable, usará un archivo 'chatbot_log.db'.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chatbot_log.db")

# El motor se crea de forma diferente si es postgresql o sqlite
if DATABASE_URL.startswith("postgres"):
    engine = create_engine(DATABASE_URL)
else:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class ConversationLog(Base):
    __tablename__ = "conversation_logs"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    mode = Column(String, default="normal")
    question = Column(String)
    answer = Column(String)
    prompt_tokens = Column(Integer)
    completion_tokens = Column(Integer)
    total_tokens = Column(Integer)
    prompt_cost = Column(Float)
    completion_cost = Column(Float)
    total_cost = Column(Float)

class Settings(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True, index=True)
    value = Column(String)

Base.metadata.create_all(bind=engine)