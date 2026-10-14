#!/bin/zsh
# Double-click to run Seedance Prompter. Starts the local server if needed and opens the browser.
# Close this Terminal window (or press Ctrl+C) to stop the server.

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# The project folder: this script's parent directory. If you copy this file
# elsewhere (e.g. your Desktop), set APP_DIR to the project's absolute path.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=5182
URL="http://localhost:$PORT"

cd "$APP_DIR" || { echo "App folder not found: $APP_DIR"; read -k1; exit 1; }

if curl -s -o /dev/null "$URL"; then
  echo "Seedance Prompter is already running. Opening $URL"
  open "$URL"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies..."
  npm install
fi

echo "Starting Seedance Prompter at $URL"
echo "Keep this window open while you use the app. Close it to stop."
echo

# Open the browser once the server answers.
( for i in {1..40}; do sleep 0.5; curl -s -o /dev/null "$URL" && { open "$URL"; exit 0; }; done ) &

exec npx vite --port "$PORT" --strictPort
