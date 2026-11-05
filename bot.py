from multiprocessing import Process
import time
import asyncio
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ModuleNotFoundError as error:
    raise SystemExit(
        "Faltan las dependencias del bot. Instálalas con: "
        "python -m pip install -r requirements-bot.txt"
    ) from error

from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from google import genai
import requests


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

apiGoogle = os.getenv("apiGoogle") or os.getenv("GEMINI_API_KEY")
if not apiGoogle:
    raise SystemExit("Falta apiGoogle en el archivo .env.")

# Paso 1. Configurar Gemini
cliente = genai.Client(api_key=apiGoogle)
modelo = "gemini-3.5-flash-lite"
optimizacionGemini = asyncio.Semaphore(3)


# Paso 2. Cargar la información de conocimiento
def cargarInformacion():
    try:
        with (BASE_DIR / "chat" / "informacion.txt").open(
            "r", encoding="utf-8"
        ) as archivo:
            return archivo.read()
    except FileNotFoundError:
        return ""


contexto = cargarInformacion()  # Contexto cargado una sola vez


def reenviarRespuestaSoporte(update: Update):
    """Reenvía al chat web las respuestas del grupo de soporte."""
    mensaje = update.effective_message
    chatTelegram = update.effective_chat
    chatSoporte = os.getenv("chatIdTelegram") or os.getenv("TELEGRAM_CHAT_ID", "")

    if not mensaje or not chatTelegram or str(chatTelegram.id) != str(chatSoporte):
        return False

    # En soporte, el agente responde usando Telegram > Responder.
    if not mensaje.reply_to_message or not mensaje.text:
        return True

    secreto = os.getenv("CHAT_BRIDGE_SECRET", "").strip()
    if not secreto:
        print("Falta CHAT_BRIDGE_SECRET; no se pudo reenviar la respuesta.")
        return True

    urlApp = os.getenv("APP_BASE_URL", "http://127.0.0.1:5000").rstrip("/")
    try:
        respuesta = requests.post(
            f"{urlApp}/internal/telegram-reply",
            headers={"X-Chat-Bridge-Secret": secreto},
            json={
                "chat_id": chatTelegram.id,
                "reply_to_message_id": mensaje.reply_to_message.message_id,
                "texto": mensaje.text.strip(),
            },
            timeout=10,
        )
        respuesta.raise_for_status()
    except requests.RequestException as error:
        print("Error al reenviar la respuesta de Telegram al portal:", error)

    return True


async def responder(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    # El grupo de soporte responde a mensajes web; no los procesa Gemini.
    if reenviarRespuestaSoporte(update):
        return

    pregunta = update.message.text
    if not contexto.strip():
        await update.message.reply_text("Error al activar la base de conocimiento...")
        return

    pregunta = pregunta[:1000]
    try:
        indicacion = f"""
            Debes responder de forma cordial las consultas de los usuarios
            Solo debes utilizar como fuente principal el siguiente archivo:
            {contexto}

            Reglas:
            1. Responde solo basandote en el material proporcianado
            2. Si no tienes informacion suficiente puedes buscarlo en tu base de datos
            pero sin salir del tema especifico para tu busqueda
            3. Usa mensajes cortos, respondiendo los mas humano posible como un asistente de atencion al cliente
            4. recepciona y solicita datos para registro de los interesados puedes ser persuasvio
            5. No utilizar ** para el uso de negrita, usar un texto plano
            6. Agrega empojis en tus respuestas. solo uno o dos por mensaje

            Pregunta del usuario: {pregunta}
        """

        async with optimizacionGemini:
            respuesta = await asyncio.to_thread(
                cliente.models.generate_content,
                model=modelo,
                contents=indicacion,
            )

        texto = respuesta.text or "Error al procesar"
        for inicio in range(0, len(texto), 2000):
            await update.message.reply_text(texto[inicio : inicio + 2000])
    except Exception as error:
        print("Error al conectar", error)
        await update.message.reply_text("No pude responder ahora. Inténtalo de nuevo.")


async def imagenEnviar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ruta = BASE_DIR / "telegram.jpg"
    if not ruta.is_file():
        await update.message.reply_text("No se encontró telegram.jpg.")
        return
    with ruta.open("rb") as imagen:
        await update.message.reply_photo(photo=imagen)


async def pdfEnviar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ruta = BASE_DIR / "practica.pdf"
    if not ruta.is_file():
        await update.message.reply_text("No se encontró practica.pdf.")
        return
    with ruta.open("rb") as pdf:
        await update.message.reply_document(document=pdf)


async def audioEnviar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ruta = BASE_DIR / "musica.mp3"
    if not ruta.is_file():
        await update.message.reply_text("No se encontró musica.mp3.")
        return
    with ruta.open("rb") as musica:
        await update.message.reply_audio(audio=musica)


def simulacion():
    print("Proceso iniciado...")
    for i in range(1, 11):
        print(f"Proceso {i} iniciado")
        time.sleep(1)
    print("Proceso finalizado")


async def procesar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    proceso = Process(target=simulacion)
    proceso.start()
    await update.message.reply_text(
        "✅ Proceso iniciado correctamente.\n"
        f"PID del proceso: {proceso.pid}"
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 Hola, bienvenido al bot.\n\n"
        "Comandos disponibles:\n"
        "/procesar - Iniciar un proceso\n"
        "/productos - Ver productos\n"
        "/imagen - Enviar una imagen\n"
        "/practica - Enviar un PDF\n"
        "/musica - Enviar un audio"
    )


async def productos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🛒 PRODUCTOS\n\n"
        "1. Laptop\n"
        "2. Mouse\n"
        "3. Teclado\n"
        "4. Monitor"
    )


def main():
    token = os.getenv("tokenTelegram") or os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("Falta tokenTelegram en el archivo .env.")

    app = ApplicationBuilder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("procesar", procesar))
    app.add_handler(CommandHandler("productos", productos))
    app.add_handler(CommandHandler("imagen", imagenEnviar))
    app.add_handler(CommandHandler("practica", pdfEnviar))
    app.add_handler(CommandHandler("musica", audioEnviar))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, responder))

    print("Bot iniciado...")
    print("Esperando comandos...")
    app.run_polling()


if __name__ == "__main__":
    main()
