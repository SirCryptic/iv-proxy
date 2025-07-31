# proxy.py
from flask import Flask, request
import requests

app = Flask(__name__)

@app.route('/')
def proxy():
    webhook = request.args.get('webhook')
    post_data = request.args.get('postData')
    if not webhook or not post_data:
        return {"error": "Missing webhook or postData"}, 400
    try:
        response = requests.post(webhook, json={'content': post_data}, headers={'Content-Type': 'application/json'})
        return response.text, response.status_code
    except Exception as e:
        return {"error": str(e)}, 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
