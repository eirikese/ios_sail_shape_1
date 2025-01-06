from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64

app = Flask(__name__)
CORS(app)  # Enable CORS for cross-origin requests

@app.route('/')
def home():
    return "Video Grayscale API is running!"

@app.route('/process_frame', methods=['POST'])
def process_frame():
    try:
        # Get the frame data from the request
        frame = request.data
        if not frame:
            return jsonify({'error': 'No frame received'}), 400

        # Decode the frame into an image
        np_arr = np.frombuffer(frame, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        # Process the image (convert to grayscale)
        gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Encode the processed image to JPEG and Base64
        _, buffer = cv2.imencode('.jpg', gray_img)
        processed_img_base64 = base64.b64encode(buffer).decode('utf-8')

        # Return the processed image
        return jsonify({'processed_frame': processed_img_base64})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Bind to 0.0.0.0 to make the server accessible on the local network
    app.run(host='0.0.0.0', port=5000)
