#!/bin/bash

WORKDIR="/home/runner/workspace"
cd "$WORKDIR"

echo "Starting Maze Lab services..."

# Start XHS Crawler in background
echo "Starting XHS Crawler on port 8000..."
cd "$WORKDIR/crawler"
python main.py &
CRAWLER_PID=$!

# Wait for crawler to be ready
sleep 5

# Start Express server (foreground)
echo "Starting Backend Server on port 5000..."
cd "$WORKDIR"
NODE_ENV=production node server/index.js
