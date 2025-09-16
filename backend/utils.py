# backend/utils.py
import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv

def regenerate_index():
    load_dotenv()
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("La variable de entorno OPENAI_API_KEY no está configurada.")
    knowledge_folder = "knowledge"
    if not os.path.exists(knowledge_folder): return f"La carpeta '{knowledge_folder}' no existe."
    pdf_files = [f for f in os.listdir(knowledge_folder) if f.endswith('.pdf')]
    if not pdf_files: return "No se encontraron archivos PDF en la carpeta 'knowledge'."
    all_pages = []
    for file_name in pdf_files:
        file_path = os.path.join(knowledge_folder, file_name)
        try:
            loader = PyPDFLoader(file_path)
            all_pages.extend(loader.load())
        except Exception as e:
            print(f"Error al cargar '{file_name}': {e}")
            continue
    if not all_pages: raise ValueError("No se pudo cargar ninguna página de los documentos PDF.")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    docs = text_splitter.split_documents(all_pages)
    embeddings = OpenAIEmbeddings()
    db = FAISS.from_documents(docs, embeddings)
    db.save_local("faiss_index")
    return f"Índice regenerado con éxito a partir de {len(pdf_files)} documento(s)."