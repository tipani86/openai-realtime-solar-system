from fastapi import FastAPI, HTTPException, Request, Response
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
BASE_URL = "https://api.openai.com/v1/realtime"

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

@app.post("/sdp")
async def negotiate_sdp(request: Request):
    """Handle SDP negotiation with OpenAI's realtime API"""
    
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not found")
    
    # Get the SDP offer from the request body
    sdp_offer = await request.body()
    sdp_offer_text = sdp_offer.decode("utf-8")
    
    try:
        async with httpx.AsyncClient() as client:
            # Make the request to OpenAI's realtime API
            response = await client.post(
                f"{BASE_URL}?model={MODEL}",
                content=sdp_offer_text,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/sdp",
                },
                timeout=10.0
            )
            
            if response.status_code not in [200, 201]:
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=f"Error from OpenAI API: {response.text}"
                )
            
            # Return the SDP answer
            return Response(content=response.content, media_type="application/sdp")
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
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=False) 