# 📱 PlanGenie – Intelligent Telecom Plan Assistant

PlanGenie is a smart chatbot that helps users discover the best mobile recharge plans based on their needs. Powered by Dialogflow + Node.js webhook + GPT integration, it provides human-like responses and personalized suggestions for Jio, Airtel, and Vi.

---

## 🔧 Features

- 🔍 Find plans by operator (Jio, Airtel, Vi)
- 💬 Conversational responses for greetings & help
- 📊 Filters: budget, validity, OTT, international roaming, voice-only
- 🔁 Pagination support (“Show more” functionality)
- 🧠 GPT-powered suggestions for best-value plans (optional)
- ⚡ Real-time plan fetching from GitHub JSON
- 🛑 Rate limiting and response caching for speed
- ✅ Hosted on Node.js Express server

---

## 🛠️ Tech Stack

- ⚙️ Node.js + Express
- 🤖 Dialogflow CX/ES (Google)
- 🧠 OpenAI GPT API (optional)
- 🌐 JSON plan data hosted on GitHub
- 🚀 Deployed via Replit / GitHub / Render

---

## 🚀 Setup Instructions

### 1. Clone this Repo

```bash
git clone https://github.com/nh652/PlanGenie.git
cd PlanGenie
```
2. Install Dependencies
```bash
npm install
```
3. Setup Environment
```bash
Create a .env file (if using GPT):
OPENAI_API_KEY=your_api_key_here
PORT=3000
(Or skip GPT by commenting out GPT-related code in gptHelper.js and index.js)
```
4. Start Local Server
```bash
node index.js
```
🤖 Integrate with Dialogflow

Create a Dialogflow ES agent

Enable webhook in the intent (e.g. "Plan Suggestion")

Use your deployed webhook URL (Replit / Render / Railway)

Enable parameters: operator, budget, duration, etc.


🧠 GPT Integration (Optional)

Enable smarter replies using OpenAI GPT (gpt-3.5-turbo or gpt-4)

Add your API key in .env file

If quota exceeds, it gracefully disables GPT fallback


📂 Project Structure
```bash

├── index.js              # Main Express server
├── gptHelper.js          # GPT response logic
├── .env                  # Environment variables (not committed)
├── /public               # Optional static assets
├── /data                 # Telecom JSON data (remote or local)
└── README.md
```
📦 API Preview
```bash
GET    /health
POST   /webhook
```
🙋‍♂️ Author
👨‍💻 Nikhil Harwani

📜 License
This project is open-source and free to use under the MIT License.
