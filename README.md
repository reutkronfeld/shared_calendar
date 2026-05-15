# Shared Calendar

A collaborative scheduling platform that helps groups find the perfect meeting time by synchronizing availabilities, respecting individual constraints, and leveraging AI for seamless coordination.

## 🚀 Key Features

- **Group Coordination**: Create or join groups using unique invite codes.
- **Smart Slot Finding**: Automatically find free time across all members, accounting for:
  - Time zones (IANA)
  - Group-wide constraints (lunch breaks, buffer times, minimum notice)
  - Individual weekly availability and one-off overrides.
- **Calendar Synchronization**: Bi-directional sync with Google Calendar.
- **Near-Miss Negotiation**: If no perfect slot exists, the system suggests "near misses" and facilitates shifting existing events.
- **AI Assistant**: A built-in chatbot to help you query availability, find slots, and manage your schedule using natural language.
- **Location Intelligence**: Integrated geocoding and travel time considerations for physical meetings.

## 🛠 Tech Stack

### Front-end
- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4, Shadcn/UI
- **Icons**: Lucide React
- **Validation**: Zod

### Back-end
- **Runtime**: Node.js
- **Framework**: Fastify
- **Database**: MongoDB (via Mongoose)
- **Auth**: Google OAuth 2.0, JWT
- **AI**: Vercel AI SDK (OpenAI-compatible)
- **Email**: Resend

### Chatbot (Experimental/AI Lab)
- **Engine**: Python, FastAPI, Streamlit
- **Integration**: Podman AI Lab, LangChain, Llama-cpp-python

## 📦 Project Structure

```text
├── back-end/      # Fastify API (TypeScript)
├── front-end/     # Next.js Application
├── chatbot/       # AI Lab Chatbot component (Python)
└── GEMINI.md      # Development instructions
```

## 🛠 Setup & Installation

### Prerequisites
- Node.js (v20+)
- MongoDB (Local or Atlas)
- Google Cloud Project (for OAuth and Calendar API)
- Resend Account (for emails)

### 1. Back-end Setup
```bash
cd back-end
npm install
```
Create a `.env` file in `back-end/` (refer to `src/config/env.ts` for required variables):
```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/shared-calendar
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

RESEND_API_KEY=your_resend_api_key
OPENROUTER_API_KEY=your_llm_api_key
```
Run the server:
```bash
npm run dev
```

### 2. Front-end Setup
```bash
cd front-end
npm install
```
Create a `.env.local` file in `front-end/`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```
Run the application:
```bash
npm run dev
```

### 3. Chatbot Setup (Optional)
The chatbot can be run using Podman AI Lab or manually:
```bash
cd chatbot/app
pip install -r requirements.txt
python main.py
```
*Note: Refer to `chatbot/README.md` for advanced Podman/Bootc deployment instructions.*

## 🧪 Development

- **Linting**: `npm run lint` (Front-end)
- **Type Checking**: `npm run typecheck` (Back-end)
- **Build**: `npm run build`

## 📄 License

Internal use / MIT (Check with project owner).
