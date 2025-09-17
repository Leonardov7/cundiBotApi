# backend/api.py
from fastapi import FastAPI, HTTPException, File, UploadFile, Header, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os, shutil, io, csv, json
from dotenv import load_dotenv

from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationalRetrievalChain, LLMChain
from langchain_community.callbacks import get_openai_callback
from langchain.prompts import PromptTemplate
from passlib.context import CryptContext

# --- IMPORTACIONES CORREGIDAS ---
from sqlalchemy.orm import Session
from sqlalchemy import func # 'func' se importa desde aquí
from database import SessionLocal, ConversationLog, Settings, engine
import database
from utils import regenerate_index

# Precios de OpenAI para GPT-4o (puedes actualizarlos si cambian)
PRICE_INPUT_GPT4O = 5.0 / 1_000_000  # $5 por millón de tokens
PRICE_OUTPUT_GPT4O = 15.0 / 1_000_000 # $15 por millón de tokens

database.Base.metadata.create_all(bind=engine); load_dotenv()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
app = FastAPI(title="CundiBot API Unificada", version="5.1.0_final")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])

conversation_chain = None
def get_db(): db = SessionLocal();_ = (yield db); db.close()

@app.on_event("startup")
def load_chain_on_startup():
    global conversation_chain
    if not os.path.exists("faiss_index"):
        print("ADVERTENCIA: Índice FAISS no encontrado.")
    else:
        try:
            system_prompt = """Eres CundiBot, un asistente de IA de la Universidad de Cundinamarca. Tu comportamiento se guiará por las instrucciones detalladas incluidas en cada pregunta del usuario.
            Utiliza el historial de la conversación y el contexto de los documentos recuperados para dar la mejor respuesta posible en cada turno."""
            
            QA_PROMPT = PromptTemplate.from_template(system_prompt + "\n\nContexto de documentos:\n{context}\n\nHistorial del chat:\n{chat_history}\n\nInstrucciones y Pregunta del usuario:\n{question}\n\nRespuesta:")
            
            embeddings = OpenAIEmbeddings()
            vectorstore = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
            retriever = vectorstore.as_retriever()
            
            # --- CAMBIO CLAVE: Se ha eliminado el objeto 'ConversationBufferMemory' ---
            # La cadena ahora no tiene estado y dependerá 100% del historial que envíe el frontend.
            
            conversation_chain = ConversationalRetrievalChain.from_llm(
                llm=ChatOpenAI(model_name="gpt-4o", temperature=0.7),
                retriever=retriever,
                # El parámetro 'memory=memory' ha sido eliminado
                return_source_documents=False,
                combine_docs_chain_kwargs={"prompt": QA_PROMPT}
            )
            print("CHAT API - Cadena conversacional SIN ESTADO cargada exitosamente.")
        except Exception as e:
            print(f"CHAT API - Error al cargar la cadena: {e}")

class ChatRequest(BaseModel): 
    full_prompt: str
    raw_question: str
    chat_history: list = []
    mode: str = "normal"
    conversation_id: str
class ChatResponse(BaseModel): answer: str
class ChangePasswordRequest(BaseModel): new_password: str

#------------------------------- Chat---------------

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    if not conversation_chain: raise HTTPException(503, "Base de conocimiento no inicializada.")
    with get_openai_callback() as cb:
        try:
            # La IA usa el prompt completo
            result = conversation_chain.invoke({
                "question": request.full_prompt, 
                "chat_history": request.chat_history
            })
            answer = result["answer"]
            
            # Guardamos la pregunta limpia y el ID en la BBDD
            log_entry = ConversationLog(
                conversation_id=request.conversation_id,
                question=request.raw_question, # <-- Pregunta limpia
                answer=answer,
                mode=request.mode,
                prompt_tokens=cb.prompt_tokens,
                completion_tokens=cb.completion_tokens,
                total_tokens=cb.total_tokens,
                prompt_cost=(cb.prompt_tokens / 1_000_000) * 5.0,
                completion_cost=(cb.completion_tokens / 1_000_000) * 15.0,
                total_cost=cb.total_cost
            )
            db.add(log_entry); db.commit()
            return ChatResponse(answer=answer)
        except Exception as e: raise HTTPException(500, str(e))



def verify_admin_key(x_admin_api_key: str = Header(None), db: Session = Depends(get_db)):
    if not x_admin_api_key: raise HTTPException(401, "Clave de API no proporcionada.")
    stored_key_obj = db.query(Settings).filter(Settings.key == "admin_api_key").first()
    if not stored_key_obj or not pwd_context.verify(x_admin_api_key, stored_key_obj.value):
        raise HTTPException(401, "Clave de API inválida.")

@app.post("/admin/change-password", dependencies=[Depends(verify_admin_key)])
async def change_password(request: ChangePasswordRequest, db: Session = Depends(get_db)):
    if not request.new_password or len(request.new_password) < 4:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 4 caracteres.")
    hashed_password = pwd_context.hash(request.new_password)
    setting = db.query(Settings).filter(Settings.key == "admin_api_key").first()
    setting.value = hashed_password
    db.commit()
    return {"message": "Contraseña actualizada con éxito."}

@app.post("/admin/upload-and-regenerate", dependencies=[Depends(verify_admin_key)])
async def admin_upload(files: List[UploadFile] = File(...)):
    try:
        knowledge_folder = "knowledge"; shutil.rmtree(knowledge_folder, ignore_errors=True); os.makedirs(knowledge_folder)
        for file in files:
            file_path = os.path.join(knowledge_folder, file.filename)
            with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        result_message = regenerate_index(); load_chain_on_startup()
        return {"message": "Base de conocimiento regenerada.", "details": result_message}
    except Exception as e: raise HTTPException(500, f"Error en la carga: {str(e)}")

@app.get("/admin/stats", dependencies=[Depends(verify_admin_key)])
async def get_stats(db: Session = Depends(get_db), start_date: str = None, end_date: str = None):
    query = db.query(ConversationLog)
    if start_date: query = query.filter(ConversationLog.timestamp >= datetime.fromisoformat(start_date))
    if end_date: query = query.filter(ConversationLog.timestamp <= datetime.fromisoformat(end_date))
    mode_counts = query.with_entities(ConversationLog.mode, func.count(ConversationLog.mode)).group_by(ConversationLog.mode).all()
    modes = {mode: count for mode, count in mode_counts}
    stats = query.with_entities(func.count(ConversationLog.id), func.sum(ConversationLog.total_tokens), func.sum(ConversationLog.total_cost)).first()
    total_conversations, total_tokens, total_cost = stats[0] or 0, stats[1] or 0, stats[2] or 0.0
    return {"total_conversations": total_conversations, "total_tokens": total_tokens, "total_cost": f"{total_cost:.6f}", "normal_mode_count": modes.get("normal", 0), "tutor_mode_count": modes.get("tutor", 0)}

@app.get("/admin/conversations", dependencies=[Depends(verify_admin_key)])
async def get_conversations(db: Session = Depends(get_db)):
    return db.query(ConversationLog).order_by(ConversationLog.timestamp.desc()).limit(100).all()

@app.delete("/admin/clear-logs", dependencies=[Depends(verify_admin_key)])
async def clear_logs(db: Session = Depends(get_db)):
    db.query(ConversationLog).delete(); db.commit()
    return {"message": "Historial de logs eliminado."}


@app.get("/admin/conversations/csv", dependencies=[Depends(verify_admin_key)])
async def get_conversations_csv(db: Session = Depends(get_db)):
    """
    Este endpoint genera un reporte CSV detallado de cada conversación registrada.
    """
    logs = db.query(ConversationLog).order_by(ConversationLog.timestamp.asc()).all()
    
    stream = io.StringIO()
    writer = csv.writer(stream)
    
    # Escribir los encabezados correctos y completos
    writer.writerow([
        "ID Conversacion", "Fecha", "Modo", "Pregunta Usuario", "Respuesta Bot",
        "Tokens Entrada", "Costo Entrada (USD)", "Tokens Salida", "Costo Salida (USD)",
        "Tokens Totales", "Costo Total (USD)"
    ])
    
    # Escribir los datos de cada conversación
    for log in logs:
        # Reemplazamos saltos de línea para evitar filas corruptas en el CSV
        clean_question = log.question.replace('\n', ' ').replace('\r', ' ')
        clean_answer = log.answer.replace('\n', ' ').replace('\r', ' ')
        
        writer.writerow([
            log.conversation_id,
            log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            log.mode,
            clean_question,
            clean_answer,
            log.prompt_tokens,
            f"{log.prompt_cost:.8f}" if log.prompt_cost is not None else "0.0",
            log.completion_tokens,
            f"{log.completion_cost:.8f}" if log.completion_cost is not None else "0.0",
            log.total_tokens,
            f"{log.total_cost:.8f}" if log.total_cost is not None else "0.0"
        ])
    
    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=reporte_conversaciones_cundibot.csv"
    
    return response

