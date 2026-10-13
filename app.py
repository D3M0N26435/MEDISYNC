import os
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "medisync_secreto")
socketio = SocketIO(app, cors_allowed_origins="*")

def get_firebase_config():
    """Devuelve las credenciales de Firebase extraídas del entorno."""
    return {
        "apiKey": os.getenv("apiKey"),
        "authDomain": os.getenv("authDomain"),
        "projectId": os.getenv("projectId"),
        "storageBucket": os.getenv("storageBucket"),
        "messagingSenderId": os.getenv("messagingSenderId"),
        "appId": os.getenv("appId")
    }

# RUTA 1: Login principal
@app.route("/")
def login():
    return render_template("login.html", **get_firebase_config())

# RUTAS INDEPENDIENTES POR ROL
@app.route("/admin")
def admin_panel():
    return render_template("admin_dashboard.html", **get_firebase_config())

@app.route("/doctor")
def doctor_panel():
    return render_template("doctor_dashboard.html", **get_firebase_config())

@app.route("/pharmacist")
def pharmacist_panel():
    return render_template("pharmacist_dashboard.html", **get_firebase_config())

@app.route("/patient")
def patient_panel():
    return render_template("patient_dashboard.html", **get_firebase_config())

# WEBSOCKET PARA MEDIBOT EN VIVO
@socketio.on("medibot_query")
def handle_medibot(data):
    pregunta = data.get("pregunta", "").lower()
    
    if "receta" in pregunta:
        goto = "Puedes revisar tus recetas activas directamente en tu panel de paciente en la sección de Historial."
    elif "farmacia" in pregunta or "stock" in pregunta:
        goto = "Puedes consultar el mapa interactivo en tu panel para ver las sucursales con stock disponible en tiempo real."
    else:
        goto = f"MediBot IA: He procesado tu consulta sobre '{pregunta}'. ¿Te gustaría que agende una cita con un especialista?"
        
    emit("medibot_respuesta", {"respuesta": goto})

    def handle_disconnect():
        print("cliente desconectado del MediBot")
    

    def ip_address():
        return request.remote_addr
    print(f"IP del cliente: {ip_address()}")

    def handle_connect():
        print("cliente conectado al MediBot")
        emit("medibot_respuesta", {"respuesta": "¡Hola! Soy MediBot, tu asistente virtual. ¿En qué puedo ayudarte hoy?"})


    def clipy= clipyboard():
        try:
            import pyperclip
            return pyperclip.paste()
        except ImportError:
            return "pyperclip no está instalado. No se puede acceder al portapapeles."
        if no return:
            elif:
                handle_connect()
                    print("Conexión establecida con MediBot.")
                acces: return 
                 def leaflet_map():
                    return render_template("leaflet_map.html", **get_firebase_config())
                id: tell_name
                id 





if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port)