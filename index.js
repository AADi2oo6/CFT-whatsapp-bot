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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 3. Session Store (In-Memory)
const userSessions = {};

// --- MIDDLEWARE: AUTHENTICATION GATE ---
bot.use(async (ctx, next) => {
  // Skip for start command or if we are handling a contact message
  if (ctx.message && (ctx.message.text === '/start' || ctx.message.contact)) {
    return next();
  }

  const chatId = ctx.chat.id;

  // Check if user is logged in
  if (userSessions[chatId]) {
    return next();
  }

  // Not logged in: Request Contact
  await ctx.reply(
    "Welcome to the Carbon Tracker! 🌱\nTo link your profile, please tap the 'Share Contact' button below.",
    Markup.keyboard([
      Markup.button.contactRequest('📱 Share Contact')
    ]).oneTime().resize()
  );
});

// --- HANDLERS ---

// 1. Start Command
bot.start((ctx) => {
  ctx.reply("Welcome! Please share your contact to log in.");
});

// 2. Contact Handler (Login)
bot.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  let phoneNumber = contact.phone_number;

  // Normalize phone number (ensure it has '+' if missing, though standardizing depends on DB)
  // Telegram might send '919876543210' or '+919876543210'.
  // We will try to match loosely or assume DB has one format. 
  // For now, let's try to pass it as is or handle basic variations in SQL if needed.
  // Assuming DB stores with '+' or we query both.

  // Quick fix: Add '+' if missing for the query
  if (!phoneNumber.startsWith('+')) {
    phoneNumber = '+' + phoneNumber;
  }

  try {
    const res = await pool.query(
      'SELECT id, first_name FROM api_profile WHERE phone_no = $1 OR phone_no = $2',
      [phoneNumber, contact.phone_number] // Try both formats
    );

    console.log('Login attempt:', phoneNumber, 'Found:', res.rows.length);

    if (res.rows.length > 0) {
      const user = res.rows[0];
      userSessions[ctx.chat.id] = user.id; // Save User ID to session
      await ctx.reply(
        `Verified! ✅ Welcome back, ${user.first_name}.\nYou can now send me photos of waste, bills, or food to log them.`,
        Markup.removeKeyboard()
      );
      console.log(`User Logged In: ${user.id} (${phoneNumber})`);
    } else {
      await ctx.reply(
        "❌ Phone number not found in our records. Please register on the website first.",
        Markup.removeKeyboard()
      );
    }
  } catch (err) {
    console.error('DB Error on Login:', err);
    ctx.reply("⚠️ Application Error. Please try again later.");
  }
});

// 3. Message Handler (Text & Photo)
bot.on(['text', 'photo'], async (ctx) => {
  // Only proceed if we have a user_id (Middleware should catch this, but safe check)
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
