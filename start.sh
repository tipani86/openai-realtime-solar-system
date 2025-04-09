#!/bin/bash

# Start the FastAPI backend
echo "Starting FastAPI backend..."
cd fastapi-backend
# Check if virtual environment exists, create if not
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
source venv/bin/activate || source venv/Scripts/activate

# Install dependencies
echo "Installing backend dependencies..."
pip install -r requirements.txt

# Start the backend in the background
echo "Starting backend server..."
python main.py &

# Store the PID of the backend process
BACKEND_PID=$!

# Return to the root directory
cd ..

# Start the Next.js frontend
echo "Starting Next.js frontend..."
npm run dev

# When the user terminates the script (Ctrl+C), kill the backend process
trap "kill $BACKEND_PID" EXIT

# Wait for the frontend to exit
wait 