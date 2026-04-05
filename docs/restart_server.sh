#!/bin/bash

PORT=8080

echo "Checking for existing server on port $PORT..."
PID=$(lsof -ti :$PORT)

if [ ! -z "$PID" ]; then
  echo "Found server running with PID $PID. Killing it..."
  kill -9 $PID
  sleep 1 # Wait for process to terminate
else
  echo "No process found running on port $PORT."
fi

echo "Restarting the server in the background..."
# Using nohup to keep it running even if the terminal is closed
nohup npm start > server.log 2>&1 &

NEW_PID=$!
echo "Server restarted successfully! (PID $NEW_PID)"
echo "Logs are being written to server.log"
