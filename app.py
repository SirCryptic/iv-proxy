from flask import Flask, request
import requests
import os

app = Flask(__name__)

# Get Discord webhook URL from environment variable
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/your_webhook_id/your_webhook_token")

@app.route('/relay', methods=['GET'])
def relay():
    value1 = request.args.get('value1')  # Player name
    value2 = request.args.get('value2')  # Message
    if not value1 or not value2:
        return "Missing value1 or value2", 400

    try:
        response = requests.post(DISCORD_WEBHOOK_URL, json={
            "content": f"{value1} said: {value2}"
        })
        if response.status_code != 204:  # Discord webhooks return 204 on success
            print(f"Failed to send to Discord: {response.status_code}")
            return "Failed to send to Discord", response.status_code
        return "OK", 200
    except Exception as e:
        print(f"Error sending to Discord: {e}")
        return "Error", 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 3000)))
