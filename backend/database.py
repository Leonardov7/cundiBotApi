# backend/database.py
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
import datetime

DATABASE_URL = "sqlite:///./chatbot_log.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class ConversationLog(Base):
    __tablename__ = "conversation_logs"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String, index=True) # <-- COLUMNA AÑADIDA
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    mode = Column(String, default="normal")
    question = Column(String) # Aquí irá la pregunta limpia del usuario
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