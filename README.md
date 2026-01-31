# 🤖 Gemini AI Telegram Chatbot

A powerful Telegram Bot powered by **Google Gemini 1.5 Flash** (via the API) that can analyze **Text**, **Images**, and **Audio** in real-time. The bot processes inputs to extract structured data (Summary, Intent, Details) and provides verifiable sender information with every response.

---

## 🚀 How It Works

### 1. Data Processing Pipeline
The bot operates as a stateless middleware between Telegram and Google Gemini.

*   **Step 1: Input**
    *   User sends a message (Text, Photo, or Voice Note) to the Telegram Bot.
    *   Telegram sends the data payload to our Node.js server via a **Webhook**.

*   **Step 2: Media Handling**
    *   **Text**: Passed directly to the AI model.
    *   **Images & Audio**:
        1.  The bot requests a download link from the Telegram API.
        2.  The file is downloaded securely into the server's **Temporary Memory (RAM)** as a binary buffer.
        3.  It is immediately converted to a **Base64** string.
        4.  This Base64 string is packaged into a "multimodal" prompt.

*   **Step 3: AI Analysis (Gemini)**
    *   The processed data (Text or Base64 Media) is sent to the **Google Gemini API**.
    *   **System Instruction**: "Analyze the input and return ONLY a valid JSON object with keys: 'summary', 'intent', and 'details'."
    *   The model processes the input and returns the structured textual analysis.

*   **Step 4: Response**
    *   The bot formats the JSON result into a readable message.
    *   It appends a **Verifier Footer** (User ID & Name) to ensure authenticity.
    *   The reply is sent back to the user on Telegram.

### 2. Data Storage & Privacy
*   **Storage**: This bot is **Stateless**.
    *   **NO Database**: No user messages, images, or audio files are saved to a persistent database (SQL/NoSQL).
    *   **Ephemeral Processing**: Files exist in the server's RAM only for the few seconds required to process the request. Once the response is sent, the data is garbage collected.
*   **Third-Party Processing**: Data is sent to Google's Gemini API for inference.

---

## 🛠️ Features

*   **📝 Text Analysis**: Understands intent and summarizes long texts.
*   **📷 Image Vision**: Describes photos, extracts text (OCR), and identifies objects.
*   **🎙️ Audio Listening**: Transcribes and summarizes voice notes and audio files.
*   **👤 Sender Verification**: Every response includes the sender's Telegram ID and Name for security/verification.

---

## ⚙️ Tech Stack

*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Telegram Library**: `telegraf`
*   **AI Model**: Google Gemini (`gemini-3-flash-preview` / `gemini-1.5-flash`)
*   **Utilities**: `axios` (HTTP requests), `dotenv` (Security)

---

## 🚀 How to Run This Project

Follow these steps to fork, set up, and run the bot on your local machine.

### Prerequisites
*   [Node.js](https://nodejs.org/) installed (v18 or higher recommended).
*   A **Telegram Account**.
*   A **Google Gemini API Key** (Get it from [Google AI Studio](https://aistudio.google.com/)).

### Step 1: Clone the Repository
1.  Fork this repository to your own GitHub account.
2.  Clone it to your machine:
    ```bash
    git clone https://github.com/YOUR_USERNAME/CFT-whatsapp-bot.git
    cd CFT-whatsapp-bot
    ```

### Step 2: Install Dependencies
Install the required Node.js libraries:
```bash
npm install
```

### Step 3: Configure Environment
1.  Create a file named `.env` in the root folder.
2.  Add the following keys:
    ```env
    # Server Port
    PORT=3000

    # Get from @BotFather on Telegram
    TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

    # Get from Google AI Studio
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

### Step 4: Start the Server
Run the bot locally:
```bash
npm start
```
You should see: `Server is listening on port 3000`

### Step 5: Expose to Internet (Webhook)
Since Telegram needs to send data to your laptop, you need a tunnel.
1.  Install and run [ngrok](https://ngrok.com/):
    ```bash
    ngrok http 3000
    ```
2.  Copy the HTTPS URL provided by ngrok (e.g., `https://1234-abcd.ngrok-free.app`).

### Step 6: Connect the Webhook
Tell Telegram to send messages to your ngrok URL. Open your browser and visit:
```
https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=<YOUR_NGROK_URL>/telegram-webhook
```
*Replace `<YOUR_TELEGRAM_BOT_TOKEN>` and `<YOUR_NGROK_URL>` with your actual values.*

### Step 7: Test!
Open your bot in Telegram and send:
*   "Hello, who are you?"
*   A photo of a landscape.
*   A voice note.

---

## 🤝 Contributing
Feel free to submit issues and pull requests to improve the bot!

## 📄 License
[Add your License here, e.g., MIT]
