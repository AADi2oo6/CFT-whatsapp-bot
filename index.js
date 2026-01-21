require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(bodyParser.json());

const {
  PORT,
  WEBHOOK_VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  GEMINI_API_KEY,
  PHONE_NUMBER_ID,
  MY_PHONE_NUMBER,
} = process.env;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// UPDATED MODEL as requested by user
const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

// Route 1: Health Check
app.get('/', (req, res) => {
  res.send('WhatsApp Bot is Running & Healthy 🚀 (Testing Mode)');
});

// Route 2: Webhook Verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Route 3: Handle Incoming Messages
app.post('/webhook', async (req, res) => {
  // 1. Detailed Logging: Log exact payload from Meta
  console.log('Incoming Webhook Body:', JSON.stringify(req.body, null, 2));

  try {
    const body = req.body;

    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const type = message.type;
        const from = message.from;
        const messageId = message.id;

        console.log(`Message Type Detected: [${type}]`);

        // --- REPLY TO USER ---
        try {
          await axios.post(
            `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: from,
              text: { body: "🤖 I received your message! Analysis starting..." },
              context: { message_id: messageId }
            },
            {
              headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
              }
            }
          );
          console.log("Reply sent successfully.");
        } catch (replyError) {
          console.error("Failed to send reply:", replyError.message);
          if (replyError.response) console.error("Reply Error Details:", JSON.stringify(replyError.response.data, null, 2));
        }
        // ---------------------

        let geminiInputParts = [];

        // Hander Text
        if (type === 'text') {
          geminiInputParts.push(message.text.body);
        }
        // Handle Media (Image/Audio)
        else if (type === 'image' || type === 'audio') {
          const mediaId = type === 'image' ? message.image.id : message.audio.id;
          console.log('Downloading Media...');

          try {
            // 1. Get Media URL
            const mediaUrlResponse = await axios.get(
              `https://graph.facebook.com/v18.0/${mediaId}`,
              {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
              }
            );
            const mediaUrl = mediaUrlResponse.data.url;

            // 2. Download Binary Data
            const mediaDataResponse = await axios.get(mediaUrl, {
              responseType: 'arraybuffer',
              headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
            });

            const base64Data = Buffer.from(mediaDataResponse.data).toString('base64');
            const mimeType = type === 'image' ? (message.image.mime_type || 'image/jpeg') : (message.audio.mime_type || 'audio/ogg');

            geminiInputParts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            });
          } catch (mediaError) {
            console.error("Error downloading media:", mediaError.message);
            if (mediaError.response) console.error('Media Download Error Details:', JSON.stringify(mediaError.response.data, null, 2));
            geminiInputParts.push("Error downloading media. Analyze what you have.");
          }
        } else {
          console.log(`Unsupported message type: ${type}`);
          // Do not return here, let it fall through to send 200 properly
        }

        // Gemini Analysis
        if (geminiInputParts.length > 0) {
          console.log('Sending to Gemini for analysis...');
          const prompt = "You are a data extractor. Analyze the input and return ONLY a valid JSON object with keys: 'summary' (string), 'intent' (string), and 'details' (object). Do not use Markdown formatting.";

          const result = await model.generateContent([prompt, ...geminiInputParts]);
          const response = await result.response;
          const text = response.text();

          console.log('Gemini Analysis Complete');

          let analysisJson;
          try {
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            analysisJson = JSON.parse(cleanedText);
          } catch (e) {
            console.error("Failed to parse Gemini response as JSON", text);
            analysisJson = { error: "Failed to parse JSON", raw: text };
          }

          console.log('---------------------------------------------------');
          console.log('ANALYSIS RESULT:', JSON.stringify(analysisJson, null, 2));
          console.log('---------------------------------------------------');
        }
      }
    }
  } catch (error) {
    // Catch ALL errors to prevent server crash
    console.error('CRITICAL ERROR in Webhook Handler:', error);
    if (error.response) console.error('Error Response Data:', JSON.stringify(error.response.data, null, 2));
  } finally {
    // ALWAYS return 200 OK to Meta
    if (!res.headersSent) {
      res.sendStatus(200);
    }
  }
});

// Route 4: Send Test Message
app.get('/test-hello', async (req, res) => {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID || !MY_PHONE_NUMBER) {
    return res.status(500).send('Missing Environment Variables: WHATSAPP_TOKEN, PHONE_NUMBER_ID, or MY_PHONE_NUMBER');
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to: MY_PHONE_NUMBER,
      type: 'text',
      text: {
        body: 'Hello World! The Bot is Ready 🤖'
      }
    };

    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    res.send(`Message sent successfully! Message ID: ${response.data.messages[0].id}`);
  } catch (error) {
    console.error('Error sending test message:', error.message);
    if (error.response) {
      console.error('Facebook API Error:', error.response.data);
      res.status(500).send(`Failed to send message: ${JSON.stringify(error.response.data)}`);
    } else {
      res.status(500).send('Failed to send message.');
    }
  }
});

app.listen(PORT || 3000, () => {
  console.log(`Server is listening on port ${PORT || 3000}`);
});
