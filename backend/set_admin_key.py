# backend/set_admin_key.py
from sqlalchemy.orm import Session
from database import SessionLocal, Settings, engine, Base
import getpass
from passlib.context import CryptContext

# Configuración para el cifrado de contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
Base.metadata.create_all(bind=engine)

def set_key():
    db: Session = SessionLocal()
    try:
        new_key = getpass.getpass("Por favor, introduce la nueva clave de API para el administrador: ")
        if not new_key:
            print("La clave no puede estar vacía.")
            return

        # Cifrar la clave antes de guardarla
        hashed_key = pwd_context.hash(new_key)

        setting = db.query(Settings).filter(Settings.key == "admin_api_key").first()
        
        if setting:
            print("Actualizando la clave de administrador existente...")
            setting.value = hashed_key
        else:
            print("Estableciendo la nueva clave de administrador...")
            setting = Settings(key="admin_api_key", value=hashed_key)
            db.add(setting)
        
        db.commit()
        print("\n¡Clave de administrador guardada de forma segura!")

    finally:
        db.close()

if __name__ == "__main__":
    set_key()