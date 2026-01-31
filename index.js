const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pool } = require('pg');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Database Connection
const pool = new Pool({
  user: 'postgres.gzdrfihkqjdffojuwcmm',
  host: 'aws-1-ap-southeast-1.pooler.supabase.com',
  database: 'postgres',
  password: '202510',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

// 2. AI & Bot Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 3. Session Store (In-Memory)
const userSessions = {};

// --- MIDDLEWARE: AUTHENTICATION GATE ---
bot.use(async (ctx, next) => {
  // Ignore updates that don't have a message or sender (e.g. edits, system messages if needed)
  if (!ctx.message || !ctx.from) return next();

  const chatId = ctx.chat.id;
  const firstName = ctx.from.first_name;

  // 1. Check if already logged in
  if (userSessions[chatId]) {
    return next();
  }

  // 2. Try Auto-Login by First Name
  try {
    console.log(`Attempting login for: ${firstName}`);
    const res = await pool.query(
      'SELECT id, first_name FROM api_profile WHERE first_name = $1',
      [firstName]
    );

    if (res.rows.length > 0) {
      const user = res.rows[0];
      userSessions[chatId] = user.id; // Save User ID to session
      await ctx.reply(`👋 Welcome back, ${user.first_name}! You are verified.`);
      console.log(`User Logged In: ${user.id} (${firstName})`);
      return next();
    } else {
      console.log(`Login failed for: ${firstName}`);
      await ctx.reply(`❌ Access Denied. Your Telegram name "${firstName}" was not found in our records.`);
      // Do NOT call next(), execution stops here for unverified users.
    }
  } catch (err) {
    console.error('DB Error on Auto-Login:', err);
    await ctx.reply("⚠️ Service Error. Please try again later.");
  }
});

// --- HANDLERS ---

// 1. Start Command
bot.start((ctx) => {
  // Middleware handles the greeting/login logic now, but we can have a specific start message if needed.
  // If execution reached here, user is logged in.
  ctx.reply("I am ready to track your carbon footprint! 🌿\nSend me text or photos.");
});

// 2. Message Handler (Text & Photo)
bot.on(['text', 'photo'], async (ctx) => {
  // Extra safety, though middleware should block
  const userId = userSessions[ctx.chat.id];
  if (!userId) return;

  try {
    let geminiInput = [];

    // HANDLE TEXT
    if (ctx.message.text) {
      geminiInput.push(ctx.message.text);
      await ctx.reply("Thinking... 💭");
    }

    // HANDLE PHOTO
    if (ctx.message.photo) {
      await ctx.reply("Analyzing photo... 📸");
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const fileLink = await bot.telegram.getFileLink(fileId);

      const imageResp = await axios.get(fileLink.href, { responseType: 'arraybuffer' });

      geminiInput.push({
        inlineData: {
          data: Buffer.from(imageResp.data).toString('base64'),
          mimeType: 'image/jpeg',
        },
      });
      // Add a prompt context if it's just a photo, or if there's caption
      if (ctx.message.caption) {
        geminiInput.push(ctx.message.caption);
      }
    }

    // SYSTEM INSTRUCTION
    const systemInstruction = `
You are a Carbon Footprint Tracker AI. Your goal is to extract structured data from the user's input for the database.
**Rules:**
1. **Category:** MUST be strictly one of: 'waste', 'consumption', 'food', 'energy', 'transport'.
2. **Carbon Footprint:** Estimate the kg CO2e (Carbon Footprint) based on the item and quantity.
3. **Output:** Return ONLY a raw JSON object (no markdown) with this structure:
{
  "category": "string",
  "description": "string",
  "value": number,
  "unit": "string",
  "carbon_footprint_kg": number,
  "reply_to_user": "A friendly, encouraging message with emojis confirming what was logged."
}`;

    // CALL GEMINI
    const result = await model.generateContent([systemInstruction, ...geminiInput]);
    const responseText = result.response.text();

    // CLEAN JSON
    const jsonString = responseText.replace(/```json|```/g, '').trim();
    const data = JSON.parse(jsonString);

    // INSERT INTO DB
    const insertQuery = `
            INSERT INTO api_activity (user_id, category, description, value, unit, carbon_footprint_kg, source, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `;

    await pool.query(insertQuery, [
      userId,
      data.category,
      data.description,
      data.value,
      data.unit,
      data.carbon_footprint_kg,
      'chatbot_pending'
    ]);

    // REPLY TO USER
    await ctx.reply(`${data.reply_to_user}\n\n✅ Successfully logged to database!`);

  } catch (error) {
    console.error('Error processing message:', error);
    await ctx.reply("⚠️ Error: Could not verify or save your activity. Please try again.");
  }
});

// --- SERVER & WEBHOOK ---
// Handle Telegram Webhook
app.use(bot.webhookCallback('/telegram-webhook'));

// Health Check
app.get('/', (req, res) => res.send('Carbon Tracker Bot Active 🌍'));

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
