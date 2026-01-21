require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(bodyParser.json());

const {
  PORT,
  WEBHOOK_VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  GEMINI_API_KEY,
  SUPABASE_URL,
  SUPABASE_KEY,
} = process.env;

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Route 1: Health Check
app.get('/', (req, res) => {
  res.send('WhatsApp Bot is Running & Healthy 🚀');
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
  try {
    const body = req.body;

    console.log('Webhook Received');

    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const sender = message.from;
        const type = message.type;

        console.log(`Message Type Detected: [${type}]`);

        let geminiInputParts = [];

        // Hander Text
        if (type === 'text') {
          geminiInputParts.push(message.text.body);
        } 
        // Handle Media (Image/Audio)
        else if (type === 'image' || type === 'audio') {
          const mediaId = type === 'image' ? message.image.id : message.audio.id;
          console.log('Downloading Media...');
          
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
        } else {
            console.log(`Unsupported message type: ${type}`);
            return res.sendStatus(200);
        }

        // Gemini Analysis
        console.log('Sending to Gemini for analysis...');
        const prompt = "You are a data extractor. Analyze the input and return ONLY a valid JSON object with keys: 'summary' (string), 'intent' (string), and 'details' (object). Do not use Markdown formatting.";
        
        const result = await model.generateContent([prompt, ...geminiInputParts]);
        const response = await result.response;
        const text = response.text();
        
        console.log('Gemini Analysis Complete');
        
        let analysisJson;
        try {
             // Cleanup potential markdown code blocks if Gemini ignores instruction
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            analysisJson = JSON.parse(cleanedText);
        } catch (e) {
            console.error("Failed to parse Gemini response as JSON", text);
            analysisJson = { error: "Failed to parse JSON", raw: text };
        }

        // Supabase Insert
        const { data, error } = await supabase
          .from('whatsapp_logs')
          .insert([
            {
              sender: sender,
              type: type,
              raw_analysis: analysisJson,
              summary: analysisJson.summary || "No summary available",
            },
          ]);

        if (error) {
            console.error('Supabase Insert Error:', error);
        } else {
            console.log('Supabase Insert Success');
        }

      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    if(error.response) console.error('Error Details:', error.response.data);
    res.sendStatus(500);
  }
});

app.listen(PORT || 3000, () => {
  console.log(`Server is listening on port ${PORT || 3000}`);
});
