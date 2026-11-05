"""Bot independiente de Telegram para MediSync."""

import asyncio
import logging
import os
import time
from multiprocessing import Process
from pathlib import Path

from dotenv import load_dotenv
from google import genai
import requests
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)


BASE_DIR = Path(__file__).resolve().parent
KNOWLEDGE_FILE = BASE_DIR / "chat" / "informacion.txt"
MODEL = "gemini-3.5-flash-lite"
MAX_QUESTION_LENGTH = 1000
MAX_REPLY_LENGTH = 2000
GEMINI_SEMAPHORE = asyncio.Semaphore(3)

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

load_dotenv(BASE_DIR / ".env")


def cargar_informacion():
    """Carga la base de conocimiento del bot."""
    try:
        return KNOWLEDGE_FILE.read_text(encoding="utf-8")
    except OSError:
        logger.exception("No se pudo leer %s", KNOWLEDGE_FILE)
        return ""


CONTEXTO = cargar_informacion()


def obtener_cliente_gemini():
    api_key = os.getenv("apiGoogle") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit(
            "Falta apiGoogle en .env (también se acepta GEMINI_API_KEY)."
        )
    return genai.Client(api_key=api_key)


cliente = obtener_cliente_gemini()


def reenviar_respuesta_de_soporte(update: Update):
    """Envía al portal una respuesta de Telegram al mensaje reenviado."""
    message = update.effective_message
    telegram_chat = update.effective_chat
    support_chat_id = os.getenv("chatIdTelegram") or os.getenv("TELEGRAM_CHAT_ID", "")

    if not message or not telegram_chat or str(telegram_chat.id) != str(support_chat_id):
        return False

    # En el chat de soporte, solo se reenvían respuestas hechas con la opción
    # "Responder" sobre un mensaje originado desde el portal.
    if not message.reply_to_message or not message.text:
        return True

    bridge_secret = os.getenv("CHAT_BRIDGE_SECRET", "").strip()
    if not bridge_secret:
        logger.error("Falta CHAT_BRIDGE_SECRET; no se puede reenviar la respuesta web.")
        return True

    app_base_url = os.getenv("APP_BASE_URL", "http://127.0.0.1:5000").rstrip("/")
    try:
        response = requests.post(
            f"{app_base_url}/internal/telegram-reply",
            headers={"X-Chat-Bridge-Secret": bridge_secret},
            json={
                "chat_id": telegram_chat.id,
                "reply_to_message_id": message.reply_to_message.message_id,
                "texto": message.text.strip(),
            },
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException:
        logger.error("No se pudo reenviar la respuesta de Telegram al portal.")
    return True


async def responder(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    if reenviar_respuesta_de_soporte(update):
        return

    pregunta = update.message.text.strip()[:MAX_QUESTION_LENGTH]
    if not CONTEXTO.strip():
        await update.message.reply_text(
            "No pude cargar la información del bot. Inténtalo más tarde."
        )
        return

    indicacion = f"""Debes responder cordialmente las consultas de los usuarios.
Usa como fuente principal la siguiente información:
<informacion>
{CONTEXTO}
</informacion>

Reglas:
1. Basa la respuesta en el material proporcionado. Si falta información, dilo con claridad.
2. Responde de forma breve y natural, como asistente de atención al cliente.
3. No solicites ni repitas datos personales o médicos sensibles.
4. No diagnostiques, no prescribas ni recomiendes dosis o cambios de medicamentos.
5. Usa texto plano y agrega como máximo uno o dos emojis.

Pregunta del usuario: {pregunta}
"""

    try:
        async with GEMINI_SEMAPHORE:
            respuesta = await asyncio.to_thread(
                cliente.models.generate_content,
                model=MODEL,
                contents=indicacion,
            )

        texto = (respuesta.text or "No pude preparar una respuesta.").strip()
        for inicio in range(0, len(texto), MAX_REPLY_LENGTH):
            await update.message.reply_text(texto[inicio : inicio + MAX_REPLY_LENGTH])
    except Exception:
        logger.exception("Error al generar una respuesta de Gemini.")
        await update.message.reply_text(
            "No pude responder ahora. Inténtalo de nuevo en un momento."
        )


async def enviar_archivo(update: Update, nombre_archivo: str, tipo: str):
    ruta = BASE_DIR / nombre_archivo
    if not ruta.is_file():
        await update.message.reply_text(f"El archivo {nombre_archivo} no está disponible.")
        return

    try:
        with ruta.open("rb") as archivo:
            if tipo == "foto":
                await update.message.reply_photo(photo=archivo)
            elif tipo == "documento":
                await update.message.reply_document(document=archivo)
            else:
                await update.message.reply_audio(audio=archivo)
    except Exception:
        logger.exception("No se pudo enviar el archivo %s.", nombre_archivo)
        await update.message.reply_text("No pude enviar el archivo. Inténtalo más tarde.")


async def imagen_enviar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await enviar_archivo(update, "telegram.jpg", "foto")


async def pdf_enviar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await enviar_archivo(update, "practica.pdf", "documento")


async def audio_enviar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await enviar_archivo(update, "musica.mp3", "audio")


def simulacion():
    print("Proceso iniciado...")
    for numero in range(1, 11):
        print(f"Proceso {numero} iniciado")
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
        "/imagen - Recibir una imagen\n"
        "/practica - Recibir un PDF\n"
        "/musica - Recibir un audio"
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
        raise SystemExit(
            "Falta tokenTelegram en .env (también se acepta TELEGRAM_BOT_TOKEN)."
        )

    application = ApplicationBuilder().token(token).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("procesar", procesar))
    application.add_handler(CommandHandler("productos", productos))
    application.add_handler(CommandHandler("imagen", imagen_enviar))
    application.add_handler(CommandHandler("practica", pdf_enviar))
    application.add_handler(CommandHandler("musica", audio_enviar))
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, responder)
    )

    logger.info("Bot de Telegram iniciado; esperando mensajes.")
    application.run_polling()


if __name__ == "__main__":
    main()
