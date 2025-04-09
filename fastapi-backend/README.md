# OpenAI Realtime API Backend

This is a simple FastAPI service that handles fetching ephemeral session tokens from OpenAI's Realtime API.

## Setup

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Create a `.env` file:
   ```
   cp .env.example .env
   ```

3. Add your OpenAI API key to the `.env` file.

## Usage

Run the FastAPI server:
```
python main.py
```

The server will be available at http://localhost:8000

### API Endpoints

- `GET /`: Health check
- `GET /session`: Get an ephemeral session token from OpenAI 