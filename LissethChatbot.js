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
- "pedido" si el usuario pregunta sobre pedidos de productos, asistencia del pedido de su producto, saber cómo va el envío de su producto, etc.
- "ofertas" si el usuario quiere comprar, pregunta por cómo pagar, descuentos, promociones, etc.
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
  updateUserContext(from, "mensaje del usuario:" + userMessage);
  const intent = await getIntent(userMessage);
  // 🧠 Clasificamos la intención

  if (intent === "pedido") {
    saveUserChoice(from, "pedido");
    sendInteractiveMessage(
      from,
      "Te ayudo a llevar el registro de tu pedido. Confirmame si deseas continuar con el proceso, ya que te pediré el número de tu pedido para continuar.",
      [
        { id: "pedido_si", title: "Si" },
        { id: "pedido_no", title: "No" },
      ]
    );
    return;
  }

  if (intent === "ofertas") {
    saveUserChoice(from, "ofertas");
    sendInteractiveMessage(
      from,
      "Contamos con Arroz Flor y Carnes Mocorita para ti. ¿Cuál te interesa agregar al carrito?",
      [
        { id: "oferta_arroz", title: "Arroz" },
        { id: "oferta_carne", title: "Carne" },
      ]
    );
    return;
  }
  // 🚀 Si no es tracking de pedido ni ofertas, seguimos con la IA normal
  // 🤖 ENVIAMOS EL MENSAJE Y REMITENTE A GEMINI
  const aiResponse = await getGeminiResponse(userMessage, from);
  // GUARDAMOS LA RESPUESTA DE GEMINI EN EL CONTEXTO
  updateUserContext(from, "tu repuesta:" + aiResponse);
  // 🤖 ENVIAMOS LA RESPUESTA DE GEMINI AL USUARIO
  await sendTextMessage(from, aiResponse);
}

// ✅ Ruta para recibir mensajes de WhatsApp
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log(
    "Respuesta del body de whatsapp webhook en línea 195 del código en la ruta para revibir mensajes de whatsapp:",
    body.entry?.[0]?.changes
  );

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
          // ✅ RESPUESTA BASADO EN INTENCIÓN (TRACKING PEDIDO, COMPRA, OTROS)
          handleMessage(from, userMessage);
        }
      } else if (buttonReply === "pedido") {
        // ✅ OPCIÓN PEDIDO
        saveUserChoice(from, "pedido");
        await sendInteractiveMessage(
          from,
          "Te ayudo a llevar el registro de tu pedido. Confirmame si deseas continuar con el proceso, ya que te pediré el número de tu pedido para continuar.",
          [
            { id: "pedido_si", title: "Si" },
            { id: "pedido_no", title: "No" },
          ]
        );
      } else if (buttonReply === "pedido_si") {
        // ✅ TRACKING PEDIDO → SI
        saveUserChoice(from, "pedido_si");
        await sendTextMessage(
          from,
          "Dame tu número de pedido, y te diré cómo va el proceso."
        );
      } else if (buttonReply === "pedido_no") {
        // ✅ TRACKING PEDIDO → NO
        saveUserChoice(from, "pedido_no");
        await sendTextMessage(
          from,
          "Bueno, ¿Hay algo más en lo que puedo ayudarte?"
        );
      } else if (buttonReply === "proceso_de_pago") {
        // ✅ OPCIÓN PROCESO DE PAGO
        saveUserChoice(from, "proceso_de_pago");
        await sendInteractiveMessage(
          from,
          "Para continuar con tu compra, elige un método de pago.",
          [
            { id: "pago_efectivo", title: "Efectivo" },
            { id: "pago_transferencia", title: "Transferencia" },
          ]
        );
      } else if (buttonReply === "pago_efectivo") {
        // ✅ OPCIÓN PROCESO DE PAGO EN EFECTIVO
        saveUserChoice(from, "pago_efectivo");
        await sendTextMessage(
          from,
          "Dame tu nombre y dirección del envío. Te haremos llegar tu pedido lo antes posible."
        );
      } else if (buttonReply === "ofertas") {
        // ✅ OPCIÓN OFERTAS
        saveUserChoice(from, "ofertas");
        await sendInteractiveMessage(
          from,
          "Contamos con Arroz Flor y Carnes Mocorita para ti. ¿Cuál te interesa agregar al carrito?",
          [
            { id: "oferta_arroz", title: "Arroz" },
            { id: "oferta_carne", title: "Carne" },
          ]
        );
      } else if (buttonReply === "oferta_arroz") {
        // ✅ OFERTAS → ARROZ
        saveUserChoice(from, "oferta_arroz");
        await sendInteractiveMessage(
          from,
          "Tenemos 2 presentaciones: en quintal, o un saco de 10kg. ¿Cuál prefieres?",
          [
            { id: "arroz_quintal", title: "Quintal" },
            { id: "arroz_10kg", title: "10kg" },
          ]
        );
      } else if (buttonReply === "arroz_quintal") {
        // ✅ OFERTAS → ARROZ_QUINTAL
        saveUserChoice(from, "arroz_quintal");
        await sendInteractiveMessage(from, "Genial. ¿Quieres uno o más?", [
          { id: "arroz_quintal_1", title: "1" },
          { id: "arroz_quintal_más", title: "Más de 1" },
        ]);
      } else if (buttonReply === "arroz_quintal_1") {
        // ✅ OFERTAS → ARROZ_QUINTAL_1
        saveUserChoice(from, "arroz_quintal_1");
        await sendInteractiveMessage(
          from,
          "Tu producto fue añadido al carrito de compras! ¿Deseas comprar algo más? ¿O continuamos con el pago?",
          [
            { id: "comprar_más", title: "Más" },
            { id: "proceso_de_pago", title: "Pagar" },
          ]
        );
      } else if (buttonReply === "oferta_carne") {
        // ✅ OFERTAS → NEGOCIO
        saveUserChoice(from, "oferta_carne");
        await sendInteractiveMessage(
          from,
          "Tenemos 2 tipos de carne: en quintal, o un saco de 10kg. ¿Cuál prefieres?",
          [
            { id: "carne_pollo", title: "Pollo" },
            { id: "carne_cerdo", title: "Cerdo" },
          ]
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
                text: `
Eres el asistente personal de Mercado En Línea EC, un mercado en línea de productos naturales que van del campo a la mesa, ubicado en Portoviejo, Manabí, Ecuador.     
Hablas de forma natural, cercana y persuasiva, pero sin exagerar ni forzar ventas.                 

Si el usuario pregunta sobre los productos, lo guías con confianza, explicando que ofreces Arroz Flor y Carnes Mocorita.
El Arroz Flor es de alta calidad, y viene en diferentes presentaciones:
- 1 quintal de 100 libras al precio de $40
- 1 saco de 25 libras al precio de $10Los horarios de atención son flexibles y se adaptan a las necesidades del cliente.

Si el usuario solo escribe "Hola", responde de forma corta como "¡Hola! ¿En qué puedo ayudarte?". Y si el usuario no te dice hola en la última conversación, no le digas hola. Y si el usuario no te dice hola en la última conversación, no le digas hola.Siempre recuerdas la conversación anterior para dar respuestas más personalizadas.

Responde siempre como si todo el conocimiento fuera intrínseco a ti. Tus respuestas serán cortas y espaciadas por cada párrafo.

Si la conversación se desvía de la atención al cliente, comunica amablemente para que la conversación no se desvíe.Si existen objeciones, vas a vencerlas con amabilidad y sin forzar la venta, y si tienen razón se las darás e intentarás quedar bien.

Si está interesado en comprar, diles que escriban "quiero comprar" para asistirles en el pedido.

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
