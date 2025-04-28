require("dotenv").config(); // Cargar variables de entorno
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const sendMessage = async () => {
    try {
        const response = await axios.post(
            process.env.FACEBOOK_API_URL,
            {
                messaging_product: "whatsapp",
                to: process.env.WHATSAPP_PHONE_NUMBER,
                type: "template",
                template: {
                    name: "hello_world",
                    language: { code: "en_US" },
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("Mensaje enviado:", response.data);
    } catch (error) {
        console.error("Error al enviar el mensaje:", error.response ? error.response.data : error.message);
    }
};

const sendTextMessage = async () => {
    try {
        const response = await axios.post(
            process.env.FACEBOOK_API_URL,
            {
                messaging_product: "whatsapp",
                to: process.env.WHATSAPP_PHONE_NUMBER,
                type: "text",
                text: {
                    body:"Saludos de parte de Simón BOT"
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("Mensaje enviado:", response.data);
    } catch (error) {
        console.error("Error al enviar el mensaje:", error.response ? error.response.data : error.message);
    }
};

const sendMediaMessage = async () => {
    try {
        const response = await axios.post(
            process.env.FACEBOOK_API_URL,
            {
                messaging_product: "whatsapp",
                to: process.env.WHATSAPP_PHONE_NUMBER,
                type: "image",
                image: {
                    // link:"https://dummyimage.com/600x400/000/fff.png&text=el filósofo del código",
                    id: "1154315443031492",
                    caption:"Podemos compartir imágenes de todas partes."
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("Mensaje enviado:", response.data);
    } catch (error) {
        console.error("Error al enviar el mensaje:", error.response ? error.response.data : error.message);
    }
};

// sendMessage();

// sendTextMessage();

// sendMediaMessage();

async function uploadImage() {
    try {
        // Crear FormData correctamente
        const data = new FormData();
        data.append("messaging_product", "whatsapp"); // ✅ Asegurar que se envía este parámetro
        data.append("file", fs.createReadStream(process.cwd() + "/logo.jpg")); // ✅ Asegurar que el archivo existe
        data.append("type", "image/jpeg");

        // Enviar petición a la API
        const response = await axios.post(process.env.FACEBOOK_API_MEDIA_URL, data, {
            headers: {
                Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
                ...data.getHeaders(), // ✅ Agregar encabezados dinámicamente
            },
        });

        console.log("✅ Imagen subida con éxito:", response.data);
    } catch (error) {
        console.error("❌ Error al subir la imagen:", error.response ? error.response.data : error.message);
    }
}

// uploadImage();


async function sendInteractiveMessage(to) {
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
                    body: {
                        text: "¿Quieres recibir una rutina personalizada?"
                    },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "yes", title: "Sí" } },
                            { type: "reply", reply: { id: "no", title: "No" } }
                        ]
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ Mensaje enviado:", response.data);
    } catch (error) {
        console.error("❌ Error al enviar el mensaje:", error.response ? error.response.data : error.message);
    }
}

// Llamar la función con el número del usuario
sendInteractiveMessage("593998499963");