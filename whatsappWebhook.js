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
        console.error("❌ Error al enviar mensaje:", error.response ? error.response.data : error.message);
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
        console.error("❌ Error al enviar mensaje:", error.response ? error.response.data : error.message);
    }
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

            console.log(`📩 Mensaje recibido de ${from}: ${buttonReply || message.text?.body}`);

            // 📌 Lógica para responder según la opción elegida
            if (!buttonReply) {
                // ✅ MENSAJE INICIAL
                await sendInteractiveMessage(
                    from,
                    "Saludos estimado(a) humano(a), soy un robot diseñado para asistirte en la búsqueda de información educativa, o la propuesta de ofertas disponibles de Simón. ¿Con qué deseas empezar?",
                    [
                        { id: "educacion", title: "Educación" },
                        { id: "ofertas", title: "Ofertas" },
                    ]
                );
            } else if (buttonReply === "educacion") {
                // ✅ OPCIÓN EDUCACIÓN
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
                await sendTextMessage(from, "📺 Aquí tienes un video para aprender sobre el SER: https://www.youtube.com/watch?v=4cvQxqFZTIQ");
            } else if (buttonReply === "tecnologia") {
                // ✅ EDUCACIÓN → TECNOLOGÍA
                await sendTextMessage(from, "📺 Aquí tienes un video para aprender sobre TECNOLOGÍA: https://www.youtube.com/watch?v=4cvQxqFZTIQ");
            } else if (buttonReply === "ofertas") {
                // ✅ OPCIÓN OFERTAS
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
                await sendTextMessage(from, "🌟 ¡Oferta especial! Suscripción anual para desarrollo del SER: 💰 $1200 al año 🎯 ¡Inscríbete hoy!");
            } else if (buttonReply === "oferta_negocio") {
                // ✅ OFERTAS → NEGOCIO
                await sendTextMessage(from, "📅 ¡Agenda una llamada 1-1 para conocer más sobre nuestro programa de negocios! 👉 https://meetings.hubspot.com/invitacion-negocio");
            }
        }

        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});


// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`));
