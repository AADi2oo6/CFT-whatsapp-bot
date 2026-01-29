require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Telegraf } = require('telegraf');

const app = express();

const {
  PORT,
  GEMINI_API_KEY,
  TELEGRAM_BOT_TOKEN
} = process.env;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Using gemini-1.5-flash as requested
const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

// Initialize Telegram Bot
if (!TELEGRAM_BOT_TOKEN) {
  console.error('CRITICAL: TELEGRAM_BOT_TOKEN is missing in .env');
  process.exit(1);
}
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// --- GEMINI HELPER FUNCTION ---
async function analyzeWithGemini(inputParts) {
  const prompt = "You are a data extractor. Analyze the input and return ONLY a valid JSON object with keys: 'summary' (string), 'intent' (string), and 'details' (object). Do not use Markdown formatting.";
  const result = await model.generateContent([prompt, ...inputParts]);
  const response = await result.response;
  return response.text();
}

// --- TELEGRAM HANDLERS ---

// 1. Start Command
bot.start((ctx) => ctx.reply('Hello! I am your AI Assistant. Send me text, photos, or audio, and I will analyze them with Gemini 🤖.'));

// 2. Text Handler
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;
    console.log('Received Text:', text);
    await ctx.reply('Analyzing text...');

    // Gemini Analysis
    const analysis = await analyzeWithGemini([text]);

    // Reply with formatted JSON or raw text
    const senderInfo = `
----------------
👤 Verified Sender
🆔 ID: ${ctx.from.id}
wm Name: ${ctx.from.first_name}`;
    await ctx.reply(`📊 Analysis Result:\n\n${analysis}\n${senderInfo}`);

  } catch (error) {
    console.error('Error handling text:', error);
    await ctx.reply('⚠️ I had trouble analyzing that text.');
  }
});

// 3. Photo Handler
bot.on('photo', async (ctx) => {
  try {
    console.log('Received Photo');
    await ctx.reply('Downloading and analyzing photo...');

    // Get highest quality photo
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const fileLink = await bot.telegram.getFileLink(fileId);

    // Download Image
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const base64Data = Buffer.from(response.data).toString('base64');
    const mimeType = 'image/jpeg'; // Telegram photos are usually JPEGs

    // Gemini Analysis
    const analysis = await analyzeWithGemini([{
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    }]);

    const senderInfo = `
----------------
👤 Verified Sender
🆔 ID: ${ctx.from.id}
wm Name: ${ctx.from.first_name}`;
    await ctx.reply(`📊 Photo Analysis Result:\n\n${analysis}\n${senderInfo}`);

  } catch (error) {
    console.error('Error handling photo:', error);
    await ctx.reply('⚠️ I had trouble analyzing that photo.');
  }
});

// 4. Audio/Voice Handler
bot.on(['voice', 'audio'], async (ctx) => {
  try {
    console.log('Received Audio/Voice');
    await ctx.reply('Listening and analyzing audio...');

    const fileId = ctx.message.voice ? ctx.message.voice.file_id : ctx.message.audio.file_id;
    const fileLink = await bot.telegram.getFileLink(fileId);

    // Determine Mime Type (guess based on type, handle generic)
    // Telegram voice notes are usually .oga (OGG Opus)
    // Audio files can be mp3, etc. We'll rely on Gemini to handle common formats or default to generic.
    // Ideally we inspect response headers or file extension from url.
    const extension = fileLink.pathname.split('.').pop();
    let mimeType = 'audio/ogg'; // Default for voice
    if (extension === 'mp3') mimeType = 'audio/mp3';
    if (extension === 'wav') mimeType = 'audio/wav';

    // Download Audio
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const base64Data = Buffer.from(response.data).toString('base64');

    // Gemini Analysis
    const analysis = await analyzeWithGemini([{
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    }]);

    const senderInfo = `
----------------
👤 Verified Sender
🆔 ID: ${ctx.from.id}
wm Name: ${ctx.from.first_name}`;
    await ctx.reply(`📊 Audio Analysis Result:\n\n${analysis}\n${senderInfo}`);

  } catch (error) {
    console.error('Error handling audio:', error);
    await ctx.reply('⚠️ I had trouble analyzing that audio.');
  }
});

// --- SERVER SETUP ---

// Use webhookCallback to attach Telegraf to Express
// Hook path is arbitrary, but must match what we set with Telegram API
const params = {
  // If we are running locally with webhook, we use the path
  // If not, Telegraf can also poll, but request asked for Webhook Route.
};

// Route: Telegram Webhook
// We verify secret token if needed, but Telegraf handles basic logic.
app.use(bot.webhookCallback('/telegram-webhook'));

// Route: Health Check
app.get('/', (req, res) => {
  res.send('Telegram Bot is Running 🚀');
});

// --- VERCEL EXPORT ---
// Vercel serverless function requires exporting the app
module.exports = app;

// Start Server locally if not in Vercel environment (or simply allow direct execution)
if (require.main === module) {
  const port = PORT || 3000;
  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
    console.log('Make sure to set your Telegram Webhook to: <YOUR_URL>/telegram-webhook');
  });
}
