#!/bin/sh
# Saba Yehuda 80 - play the exported show on a Mac (uses the built-in python3).
cd "$(dirname "$0")/player" || exit 1
PORT=47880
python3 -m http.server "$PORT" --bind 127.0.0.1 &
SERVER=$!
sleep 1
open "http://127.0.0.1:$PORT/show/"
echo "The show is running. Keep this window open; press Ctrl+C to stop."
wait "$SERVER"
