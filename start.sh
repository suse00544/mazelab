#!/bin/bash

echo "Starting Maze Lab services..."

# Start XHS Crawler in background
echo "Starting XHS Crawler..."
cd crawler && python main.py &
CRAWLER_PID=$!

# Wait for crawler to be ready
sleep 5

# Start Express server (foreground)
echo "Starting Backend Server..."
cd /home/runner/workspace
NODE_ENV=production node server/index.js
