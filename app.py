import os
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "medisync_secreto")
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route("/")
def login():
    return render_template("login.html", 
        apiKey=os.getenv("apiKey"),
        authDomain=os.getenv("authDomain"),
        projectId=os.getenv("projectId"),
        storageBucket=os.getenv("storageBucket"),
        messagingSenderId=os.getenv("messagingSenderId"),
        appId=os.getenv("appId")
    )

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html",
        apiKey=os.getenv("apiKey"),
        authDomain=os.getenv("authDomain"),
        projectId=os.getenv("projectId"),
        storageBucket=os.getenv("storageBucket"),
        messagingSenderId=os.getenv("messagingSenderId"),
        appId=os.getenv("appId")
    )

# WebSocket para el MediBot integrado en la web
@socketio.on("medibot_query")
def handle_medibot(data):
    pregunta = data.get("pregunta", "").lower()
    
    # Respuesta inteligente simulada / integrada con lógica de IA
    if "receta" in pregunta:
        goto = "Puedes revisar tus recetas activas directamente en tu panel de paciente en la sección de Historial."
    elif "farmacia" in pregunta or "stock" in pregunta:
        goto = "Puedes consultar el mapa interactivo en tu panel para ver las sucursales con stock disponible en tiempo real."
    else:
        goto = f"MediBot IA: He procesado tu consulta sobre '{pregunta}'. ¿Te gustaría que agende una cita con un especialista?"
        
    emit("medibot_respuesta", {"respuesta": goto})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port)