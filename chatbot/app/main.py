from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import json
import os
import asyncio
import httpx
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain.memory import ConversationBufferWindowMemory
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

# Load environment variables
script_dir = os.path.dirname(__file__)
for env_file in ['.env', 'token.env']:
    env_path = os.path.join(script_dir, env_file)
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print(f"Loaded env from {env_file}")

app = FastAPI()

# --- Global Context ---
class ChatContext:
    def __init__(self):
        self.calendars = {}
        self.members = []
        self.constraints = {}
        self.auth_token = ""
        self.session_id = ""

current_context = ChatContext()

NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:4000")

# --- Tools ---
@tool
def get_calendar(user_name: str) -> str:
    """Get the calendar events for a specific user by their name."""
    events = current_context.calendars.get(user_name, [])
    if not events:
        return f"No calendar found for {user_name}."
    return json.dumps(events, indent=2)

@tool
def get_group_availability() -> str:
    """Get a summary of when the whole group is busy."""
    return json.dumps(current_context.calendars, indent=2)

@tool
def move_event(event_id: str, new_start: str, new_end: str) -> str:
    """Moves a flexible event to a new time. Use this when the user agrees to move their meeting."""
    headers = {"Authorization": current_context.auth_token}
    try:
        with httpx.Client() as client:
            resp = client.post(
                f"{NODE_BACKEND_URL}/calendar/move-event",
                json={"eventId": event_id, "start": new_start, "end": new_end},
                headers=headers
            )
            if resp.status_code == 200:
                return "Event moved successfully."
            else:
                return f"Failed to move event: {resp.text}"
    except Exception as e:
        return f"Error calling backend: {str(e)}"

@tool
def finalize_negotiation() -> str:
    """Finalizes the group meeting scheduling after all blockers are resolved."""
    if not current_context.session_id:
        return "No active negotiation session found to finalize."
    headers = {"Authorization": current_context.auth_token}
    try:
        with httpx.Client() as client:
            resp = client.post(
                f"{NODE_BACKEND_URL}/negotiate/{current_context.session_id}/finalize",
                headers=headers
            )
            if resp.status_code == 200:
                return "Group meeting scheduled successfully for everyone!"
            else:
                return f"Failed to finalize: {resp.text}"
    except Exception as e:
        return f"Error calling backend: {str(e)}"

@tool
def reject_negotiation() -> str:
    """Marks the current meeting time as rejected and tells the system to find an alternative time for the group."""
    if not current_context.session_id:
        return "No active negotiation session found to reject."
    headers = {"Authorization": current_context.auth_token}
    try:
        with httpx.Client() as client:
            resp = client.post(
                f"{NODE_BACKEND_URL}/negotiate/{current_context.session_id}/reject",
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "scheduled":
                    return f"Rejected. Found another perfect slot and scheduled it: {data.get('slot')}"
                elif data.get("status") == "negotiating":
                    return "Rejected. Found another potential slot and sent emails to relevant members."
                return "Rejected successfully."
            else:
                return f"Failed to reject: {resp.text}"
    except Exception as e:
        return f"Error calling backend: {str(e)}"

tools = [get_calendar, get_group_availability, move_event, finalize_negotiation, reject_negotiation]

# --- Model Setup ---
model_service = os.getenv("MODEL_ENDPOINT", "https://openrouter.ai/api/v1")
model_service_bearer = os.getenv("MY_TOKEN")
model_name = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")

llm = ChatOpenAI(
    base_url=model_service,
    api_key=model_service_bearer or "sk-no-key-required",
    model=model_name,
    streaming=True,
    default_headers={
        "HTTP-Referer": "http://localhost:4000",
        "X-Title": "Calendar Assistant"
    }
)

prompt_template = ChatPromptTemplate.from_messages([
    ("system", "אתה עוזר תזמון אישי בשיחה פרטית.\n\n"
               "CONTEXT:\n"
               "אתה נמצא בשיחה עם משתמש שיש לו אירוע גמיש שחוסם פגישה קבוצתית. פרטי האירוע החוסם והפגישה הקבוצתית מופיעים בהודעת המערכת הראשונה.\n\n"
               "STRATEGY:\n"
               "1. Always start by calling 'get_group_availability' to see the current state.\n"
               "2. If the user says YES (or any agreement like 'כן') to moving their event:\n"
               "   a. Call 'move_event' with the event ID from the context.\n"
               "   b. Call 'finalize_negotiation' immediately after.\n"
               "   c. Reply ONLY with: 'מעולה! תודה רבה, הפגישה הקבוצתית נקבעה.' (followed by the time of the group meeting if you know it).\n"
               "3. If the user says NO:\n"
               "   a. Call 'reject_negotiation'.\n"
               "   b. Reply ONLY with: 'אוקיי, אני אנסה למצוא זמן אחר.'\n\n"
               "Rules:\n"
               "- Never use a tool to 'send a message' to someone else. Just move the event or reject the negotiation.\n"
               "- Be concise and professional in Hebrew.\n"
               "- Use Asia/Jerusalem timezone."),
    MessagesPlaceholder(variable_name="chat_history"),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_openai_tools_agent(llm, tools, prompt_template)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True)

# --- API Models ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Dict[str, Any]

@app.post("/chat")
async def chat_endpoint(request: Request):
    body = await request.json()
    
    # Update global context
    ctx = body.get("context", {})
    current_context.calendars = ctx.get("calendars", {})
    current_context.members = ctx.get("members", [])
    current_context.constraints = ctx.get("constraints", {})
    current_context.auth_token = request.headers.get("Authorization", "")
    current_context.session_id = ctx.get("sessionId", "")

    messages = body.get("messages", [])
    
    # Extract conversation history
    history = []
    for msg in messages[:-1]:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            history.append(HumanMessage(content=content))
        elif role == "assistant":
            history.append(AIMessage(content=content))
        elif role == "system":
            history.append(SystemMessage(content=content))
    
    user_input = messages[-1].get("content", "") if messages else ""

    async def generate():
        try:
            # Run the agent in a thread since it's synchronous
            response = await asyncio.to_thread(
                agent_executor.invoke, 
                {"input": user_input, "chat_history": history}
            )
            output = response.get("output", "")
            
            if output:
                yield f"0:{json.dumps(output)}\n"
            
            finish_data = {
                "finishReason": "stop",
                "usage": {"promptTokens": 0, "completionTokens": 0}
            }
            yield f"e:{json.dumps(finish_data)}\n"
            
        except Exception as e:
            yield f"3:{json.dumps(str(e))}\n"

    return StreamingResponse(generate(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
