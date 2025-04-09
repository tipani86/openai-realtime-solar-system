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
python main.py