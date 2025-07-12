from flask import Flask, request
import requests

app = Flask(__name__)

# Replace with your Discord webhook URL
DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1393588541539487905/AddumHS-dNiQmFti17zi8ZaelHRUWRgiDh7w2TbSEdhkIHnkHMkbfd1tu37ImXHDQpCN"

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
    app.run(host="0.0.0.0", port=3000)