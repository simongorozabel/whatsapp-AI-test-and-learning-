require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// ✅ Ruta para verificar el Webhook con Meta
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log("✅ Webhook verificado con éxito.");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Verificación fallida.");
    res.sendStatus(403);
  }
});

// ✅ Función para enviar mensajes interactivos (botones)
async function sendInteractiveMessage(to, bodyText, buttons) {
  try {
    const response = await axios.post(
      process.env.FACEBOOK_API_URL,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: buttons.map((btn) => ({
              type: "reply",
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Mensaje enviado:", response.data);
  } catch (error) {
    console.error(
      "❌ Error al enviar mensaje:",
      error.response ? error.response.data : error.message
    );
  }
}

// ✅ Función para enviar mensajes de texto
async function sendTextMessage(to, text) {
  try {
    const response = await axios.post(
      process.env.FACEBOOK_API_URL,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Mensaje enviado:", response.data);
  } catch (error) {
    console.error(
      "❌ Error al enviar mensaje:",
      error.response ? error.response.data : error.message
    );
  }
}

// 🗂️ Guardamos la memoria de las conversaciones en un objeto (como una libreta de apuntes)
const contextMemory = {};

// 📌 Función para guardar el mensaje del usuario y su contexto
function updateUserContext(userId, userMessage) {
  if (!contextMemory[userId]) {
    contextMemory[userId] = { messages: [], choices: [] }; // Si es un usuario nuevo, le damos una libreta vacía
  }

  // 📝 Guardamos lo que dijo el usuario
  contextMemory[userId].messages.push(userMessage);
}

// 📌 Función para obtener el contexto de la conversación de un usuario
function getUserContext(userId) {
  return contextMemory[userId] ? contextMemory[userId].messages.join(" ") : "";
}

// 📌 Función para recordar las elecciones del usuario
function saveUserChoice(userId, choice) {
  if (!contextMemory[userId]) {
    contextMemory[userId] = { choices: [] };
  }

  contextMemory[userId].choices.push(choice);
}

// 📌 Función para obtener la intención de un mensaje
async function getIntent(userMessage) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [
            {
              text: `
Eres un clasificador de intenciones. 
Clasifica el siguiente mensaje en una de estas tres categorías: 
- "educación" si el usuario pregunta sobre aprender, cursos, habilidades, formación, etc.
- "ofertas" si el usuario pregunta por precios, descuentos, promociones, servicios disponibles, etc.
- "otro" si el mensaje no encaja en ninguna de las anteriores.

Mensaje del usuario: "${userMessage}"
Devuelve solo una de las palabras: educación, ofertas, otro.`,
            },
          ],
        },
      ],
    }
  );
  console.log(
    "👉🏼La intención del mensaje es: " +
      response.data.candidates[0].content.parts[0].text.trim()
  );
  return response.data.candidates[0].content.parts[0].text.trim();
}

// 📌 Función para responder mensajes basado en intención de usuario
async function handleMessage(from, userMessage) {
  // 💿 GUARDAMOS EL CONTEXTO DEL MENSAJE
  updateUserContext(from, userMessage);
  const intent = await getIntent(userMessage);
  // 🧠 Clasificamos la intención

  if (intent === "educación") {
    saveUserChoice(from, "educación");
    sendInteractiveMessage(
      from,
      "Saludos estimado(a) humano(a), soy un robot diseñado para asistirte en la búsqueda de información educativa. ¿Con qué deseas empezar?",
      [
        { id: "ser", title: "Ser" },
        { id: "tecnologia", title: "Tecnología" },
      ]
    );
    return;
  }

  if (intent === "ofertas") {
    saveUserChoice(from, "ofertas");
    sendInteractiveMessage(
      from,
      "Saludos estimado(a) humano(a), aquí están las ofertas disponibles de Simón. ¿Cuál te interesa?",
      [
        { id: "oferta_ser", title: "Ser" },
        { id: "oferta_negocio", title: "Negocio" },
      ]
    );
    return;
  }
  // 🚀 Si no es educación ni ofertas, seguimos con la IA normal
  // 🤖 ENVIAMOS EL MENSAJE Y REMITENTE A GEMINI
  const aiResponse = await getGeminiResponse(userMessage, from);
  // 🤖 ENVIAMOS LA RESPUESTA DE GEMINI AL USUARIO
  await sendTextMessage(from, aiResponse);
}

// ✅ Ruta para recibir mensajes de WhatsApp
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const changes = body.entry?.[0]?.changes?.[0]?.value;
    const messages = changes?.messages;

    if (messages) {
      const message = messages[0];
      const from = message.from;
      const buttonReply = message.interactive?.button_reply?.id; // Captura la respuesta de los botones

      console.log(
        `📩 Mensaje recibido de ${from}: ${buttonReply || message.text?.body}`
      );

      // 📌 Lógica para responder según la opción elegida
      if (!buttonReply) {
        // ✅ MENSAJE RECIBIDO DEL USUARIO
        const userMessage = message.text?.body;

        if (userMessage) {
          // ✅ RESPUESTA BASADO EN INTENCIÓN (EDUCACIÓN, COMPRA, OTROS)
          handleMessage(from, userMessage);
        }
      } else if (buttonReply === "educacion") {
        // ✅ OPCIÓN EDUCACIÓN
        saveUserChoice(from, "educación");
        await sendInteractiveMessage(
          from,
          "Gran elección, viajero(a) misterioso(a), bienvenido al mundo de los retos. ¿Qué te gustaría aprender hoy?",
          [
            { id: "ser", title: "Ser" },
            { id: "tecnologia", title: "Tecnología" },
          ]
        );
      } else if (buttonReply === "ser") {
        // ✅ EDUCACIÓN → SER
        saveUserChoice(from, "ser");
        await sendTextMessage(
          from,
          "📺 Aquí tienes un video para aprender sobre el SER: https://www.youtube.com/watch?v=4cvQxqFZTIQ"
        );
      } else if (buttonReply === "tecnologia") {
        // ✅ EDUCACIÓN → TECNOLOGÍA
        saveUserChoice(from, "tecnología");
        await sendTextMessage(
          from,
          "📺 Aquí tienes un video para aprender sobre TECNOLOGÍA: https://www.youtube.com/watch?v=4cvQxqFZTIQ"
        );
      } else if (buttonReply === "ofertas") {
        // ✅ OPCIÓN OFERTAS
        saveUserChoice(from, "ofertas");
        await sendInteractiveMessage(
          from,
          "Vaya, parece que tenemos a un viajero(a) comprometido(a). ¿Quieres alcanzar tus metas del ser holístico? ¿O quieres libertad de tiempo en tu negocio?",
          [
            { id: "oferta_ser", title: "Ser" },
            { id: "oferta_negocio", title: "Negocio" },
          ]
        );
      } else if (buttonReply === "oferta_ser") {
        // ✅ OFERTAS → SER
        saveUserChoice(from, "oferta_ser");
        await sendTextMessage(
          from,
          "🌟 ¡Oferta especial! Suscripción anual para desarrollo del SER: 💰 $1200 al año 🎯 ¡Inscríbete hoy!"
        );
      } else if (buttonReply === "oferta_negocio") {
        // ✅ OFERTAS → NEGOCIO
        saveUserChoice(from, "oferta_negocio");
        await sendTextMessage(
          from,
          "📅 ¡Agenda una llamada 1-1 para conocer más sobre nuestro programa de negocios! 👉 https://meetings.hubspot.com/invitacion-negocio"
        );
      }
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

async function getGeminiResponse(userMessage, userId) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Eres el asistente personal de Simón Gorozabel, un coach del ser & consultor de negocios con inteligencia artificial. 
                Hablas de forma natural, cercana y persuasiva, pero sin exagerar ni forzar ventas. 
                Si el usuario pregunta sobre los servicios de Simón, lo guías con confianza, explicando que ofrece 12 meses o 52 sesiones al año de coaching por $1200, 
                y consultoría de negocios de 4 sesiones por $222. 
                Si el usuario solo escribe "Hola", responde de forma corta como "¡Hola! ¿En qué puedo ayudarte?".
                Siempre recuerdas la conversación anterior para dar respuestas más personalizadas. Y si el usuario no te dice hola en la última conversación, no le digas hola. Responde siempre como si todo el conocimiento fuera intrínseco a ti. Tus respuestas serán cortas y espaciadas por cada parrafo.

                Historial de la conversación con este usuario: ${getUserContext(
                  userId
                )}
                Último mensaje del usuario: ${userMessage}`,
              },
            ],
          },
        ],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    // Extraer la respuesta de Gemini
    return (
      response.data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Lo siento, no entendí tu mensaje."
    );
  } catch (error) {
    console.error(
      "❌ Error en la API de Gemini:",
      error.response ? error.response.data : error.message
    );
    return "Hubo un error al procesar tu solicitud.";
  }
}

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`)
);
