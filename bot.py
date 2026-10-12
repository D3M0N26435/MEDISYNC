import os
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "medisync_secret_key")
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

# WebSocket para mensajería en tiempo real y MediBot
@socketio.on("mensaje_chat")
def handle_chat_message(data):
    # data contiene { user, mensaje, rol }
    emit("responder_chat", data, broadcast=True)

@socketio.on("medibot_query")
def handle_medibot(data):
    pregunta = data.get("pregunta", "")
    # Aquí puedes integrar la lógica del modelo Gemini de tu bot.py de forma síncrona/asíncrona
    respuesta_ia = f"MediBot IA: He procesado tu consulta sobre '{pregunta}'. (Conectado a Gemini)"
    emit("medibot_respuesta", {"respuesta": respuesta_ia})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port)