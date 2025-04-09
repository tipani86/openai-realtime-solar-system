from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables
load_dotenv()

# Get API key from environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-4o-mini-realtime-preview"  # Same as the one used in the frontend
VOICE = "coral"  # Same as the one used in the frontend

app = FastAPI(title="OpenAI Realtime API Backend")

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "OpenAI Realtime API Backend is running"}

@app.get("/session")
async def get_session():
    """Get an ephemeral session token from OpenAI's realtime API"""
    
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not found")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "voice": VOICE,
                },
                timeout=10.0
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=f"Error from OpenAI API: {response.text}"
                )
                
            return response.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Error making request to OpenAI: {str(e)}")

@app.get("/turn")
async def get_turn_servers():
    """Get TURN server iceServers from Metered"""
    
    turn_domain = os.getenv("TURN_DOMAIN")
    turn_api_key = os.getenv("TURN_API_KEY")
    
    if not turn_domain or not turn_api_key:
        raise HTTPException(status_code=500, detail="TURN server configuration missing")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://{turn_domain}/api/v1/turn/credentials",
                params={"apiKey": turn_api_key},
                timeout=10.0
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Error from TURN server: {response.text}"
                )
                
            return response.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Error making request to TURN server: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True) 