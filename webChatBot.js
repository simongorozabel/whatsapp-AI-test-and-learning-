require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Servir archivos estáticos (si tienes un frontend en el mismo proyecto)
app.use(express.static("public"));

// 📌 Memoria para conversaciones
const contextMemory = {};

// 📌 Función para actualizar el contexto del usuario
function updateUserContext(userId, userMessage) {
  if (!contextMemory[userId]) {
    contextMemory[userId] = { messages: [] };
  }
  contextMemory[userId].messages.push(userMessage);
}

// 📌 Función para obtener el contexto de la conversación de un usuario
function getUserContext(userId) {
  return contextMemory[userId] ? contextMemory[userId].messages.join(" ") : "";
}

// 📌 Obtener respuesta desde Gemini AI
async function getGeminiResponse(userMessage, userId) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Eres el asistente personal de Simón Gorozabel, un coach del ser.

                Hablas de forma natural, cercana y persuasiva, pero sin exagerar ni forzar ventas. 

                Si el usuario pregunta sobre los servicios de Simón, lo guías con confianza, explicando que ofrece 12 meses o 52 sesiones al año de coaching de alto rendimiento holístico por $1200, 
                y mentorías de 2 sesiones por $500. Les ayudarás con su nutrición de alto rendimient, su ser e identidad para ser sanos, su salud mental, espiritualidad y relación con la vida de alto rendimiento, así como con su entrenamiento. Cuando esté listo para comprar le dices que le mande un mensaje directo al whatsapp personal de simón "+593968032994".

                Si el usuario solo escribe "Hola", responde de forma corta como "¡Hola! ¿En qué puedo ayudarte?".

                Siempre recuerdas la conversación anterior para dar respuestas más personalizadas. Y si el usuario no te dice hola en la última conversación, no le digas hola. Responde siempre como si todo el conocimiento fuera intrínseco a ti. Tus respuestas serán cortas, directas y persuasivas.

                Si el usuario repercute con conductas y comporamientos que difamen o tengan daño directo, dejarás de responder tan amable y no le compartirás el número de Simón ni le ayudarás en nada.

                Si la conversación se desvía de la atención al cliente, comunica amablemente para que la conversación no se desvíe.Si existen objeciones, vas a vencerlas con amabilidad y sin forzar la venta, y si tienen razón se las darás e intentarás quedar bien.

                Elimina los ***.

                Historial de la conversación con este usuario: "${getUserContext(
                  userId
                )}"
                Último mensaje del usuario: "${userMessage}"`,
              },
            ],
          },
        ],
      }
    );
    return response.data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error("❌ Error con Gemini AI:", error);
    return "Lo siento, no pude procesar tu solicitud.";
  }
}

// 📌 WebSocket para comunicación en tiempo real
io.on("connection", (socket) => {
  console.log("🔗 Usuario conectado:", socket.id);

  socket.on("userMessage", async (data) => {
    console.log("📩 Mensaje recibido:", data);

    updateUserContext(socket.id, data.message);
    const aiResponse = await getGeminiResponse(data.message, socket.id);

    socket.emit("botMessage", { message: aiResponse });
  });

  socket.on("disconnect", () => {
    console.log("❌ Usuario desconectado:", socket.id);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
