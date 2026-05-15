from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_community.callbacks import StreamlitCallbackHandler
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain.memory import ConversationBufferWindowMemory
import streamlit as st
import requests
import time
import json
import os 
from dotenv import load_dotenv

# Try to load environment variables
script_dir = os.path.dirname(__file__)
for env_file in ['.env', 'token.env']:
    env_path = os.path.join(script_dir, env_file)
    if os.path.exists(env_path):
        load_dotenv(env_path)

# --- Streamlit Config ---
st.set_page_config(page_title="עוזר תזמון חכם", layout="wide")

# --- Context Logic ---
@st.cache_data(ttl=300) # Cache for 5 minutes
def fetch_group_context(group_id: str):
    try:
        resp = requests.get(f"http://localhost:4001/internal/groups/{group_id}/context", timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        st.error(f"שגיאה בחיבור לשרת: {e}")
        return None

group_id = st.query_params.get("groupId")
group_context = fetch_group_context(group_id) if group_id else None

if group_context:
    CURRENT_CALENDARS = group_context.get("calendars", {})
    MEMBER_NAMES = [m["name"] for m in group_context.get("members", [])]
else:
    MEMBER_NAMES = ["Alice", "Bob", "Charlie"]
    CURRENT_CALENDARS = {
        "Alice": [{"title": "Meeting", "start": "2026-05-15T09:00:00", "end": "2026-05-15T10:00:00", "flexible": False}],
        "Bob": [],
        "Charlie": []
    }

# --- Tools ---
@tool
def get_calendar(user_name: str) -> str:
    """Get the calendar events for a specific user by their name."""
    events = CURRENT_CALENDARS.get(user_name, [])
    return json.dumps(events, indent=2) if events else f"No events found for {user_name}."

@tool
def get_group_availability() -> str:
    """Get a summary of when everyone in the group is busy."""
    return json.dumps(CURRENT_CALENDARS, indent=2)

@tool
def propose_reschedule(user_name: str, event_id: str, suggested_new_time: str) -> str:
    """Proposes to move a flexible meeting. Use only if a group meeting is blocked."""
    return f"שלחנו הודעה ל-{user_name} לבדוק אם אפשר להזיז את האירוע {event_id} לזמן {suggested_new_time}."

tools = [get_calendar, get_group_availability, propose_reschedule]

# --- AI Setup ---
model_service = os.getenv("MODEL_ENDPOINT", "https://openrouter.ai/api/v1")
model_service_bearer = os.getenv("MY_TOKEN")
model_name = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")

llm = ChatOpenAI(
    base_url=model_service, 
    api_key=model_service_bearer,
    model=model_name,
    streaming=True,
)

prompt_template = ChatPromptTemplate.from_messages([
    ("system", f"אתה עוזר תזמון חכם עבור הקבוצה: {', '.join(MEMBER_NAMES)}.\n"
               "התפקיד שלך הוא למצוא זמן שמתאים לכולם.\n"
               "אסטרטגיה:\n"
               "1. תמיד תתחיל בבדיקת 'get_group_availability'.\n"
               "2. אם מצאת זמן פנוי לכולם, תציע אותו.\n"
               "3. אם יש אירועים 'גמישים' (flexible: true) שמפריעים, תשתמש ב-'propose_reschedule'.\n"
               "4. תענה תמיד בעברית בצורה מקצועית ותמציתית."),
    MessagesPlaceholder(variable_name="chat_history"),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

@st.cache_resource()
def get_memory():
    return ConversationBufferWindowMemory(return_messages=True, k=10, memory_key="chat_history")

agent = create_openai_tools_agent(llm, tools, prompt_template)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, memory=get_memory(), handle_parsing_errors=True)

# --- UI Layout ---
st.title("📅 עוזר תזמון קבוצתי")

if group_context:
    st.sidebar.success(f"מחובר לקבוצה עם {len(MEMBER_NAMES)} חברים")
    for name in MEMBER_NAMES:
        st.sidebar.text(f"• {name}")
else:
    st.sidebar.warning("מצב דמו - נתונים פיקטיביים")

if "messages" not in st.session_state:
    st.session_state.messages = [{"role": "assistant", "content": f"שלום! אני עוזר התזמון של {', '.join(MEMBER_NAMES)}. איך אוכל לעזור היום?"}]

# Display chat history
for msg in st.session_state.messages:
    st.chat_message(msg["role"]).write(msg["content"])

# Chat input
if user_input := st.chat_input():
    st.session_state.messages.append({"role": "user", "content": user_input})
    st.chat_message("user").write(user_input)
    
    with st.chat_message("assistant"):
        container = st.container()
        st_callback = StreamlitCallbackHandler(container)
        try:
            # We don't use st.write directly inside the thinking block to avoid rerun conflicts
            response = agent_executor.invoke({"input": user_input}, {"callbacks": [st_callback]})
            output = response["output"]
            st.session_state.messages.append({"role": "assistant", "content": output})
            st.write(output)
        except Exception as e:
            st.error(f"שגיאה: {e}")
    
    # Force refresh to update the history properly
    st.rerun()
