from flask import Flask, request, jsonify, send_from_directory, make_response, abort

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from functools import wraps
import magic
import hashlib
from pathlib import Path
import boto3
import json
import os
from werkzeug.utils import secure_filename
from PIL import Image
import io
import requests

app = Flask(__name__, static_folder='static')



# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Security configurations
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max file size
app.config['UPLOAD_EXTENSIONS'] = ['.jpg', '.jpeg', '.png']
app.config['UPLOAD_PATH'] = 'uploads'

def security_headers(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        response = make_response(f(*args, **kwargs))
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'"
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response
    return decorated_function
app.config['UPLOAD_FOLDER'] = 'uploads'

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global rekognition client
rekognition_client = None

def init_rekognition(access_key, secret_key, region='us-east-1'):
    global rekognition_client
    try:
        rekognition_client = boto3.client(
            'rekognition',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )
        # Test the connection
        rekognition_client.list_collections(MaxResults=1)
        return True, ""
    except Exception as e:
        error_message = str(e)
        print(f"Error initializing Rekognition: {error_message}")
        return False, error_message

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

@app.route('/health')
def health_check():
    try:
        # Check internet connectivity
        requests.get('https://aws.amazon.com', timeout=5)
        
        # Check AWS credentials if set
        if rekognition_client:
            rekognition_client.list_collections(MaxResults=1)
            aws_status = "connected"
        else:
            aws_status = "not_configured"
            
        return jsonify({
            "status": "ok",
            "internet": True,
            "aws_status": aws_status
        })
    except requests.RequestException:
        return jsonify({
            "status": "error",
            "message": "No internet connection",
            "internet": False
        }), 503
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/set-credentials', methods=['POST'])
def set_credentials():
    data = request.json
    access_key = data.get('accessKey')
    secret_key = data.get('secretKey')
    region = data.get('region', 'us-east-1')
    
    if not access_key or not secret_key:
        return jsonify({"error": "Missing credentials", "detail": "Both Access Key and Secret Key are required"}), 400
    
    success, error_message = init_rekognition(access_key, secret_key, region)
    if success:
        return jsonify({"message": "Credentials set successfully"})
    else:
        return jsonify({"error": "Invalid credentials", "detail": error_message}), 401

@app.route('/api/collections', methods=['GET'])
def list_collections():
    if not rekognition_client:
        return jsonify({"error": "AWS credentials not configured", "detail": "Please set your AWS credentials first"}), 401
    
    try:
        response = rekognition_client.list_collections()
        return jsonify(response)
    except Exception as e:
        return jsonify({"error": "Failed to list collections", "detail": str(e)}), 500

@app.route('/api/collections', methods=['POST'])
def create_collection():
    if not rekognition_client:
        return jsonify({"error": "AWS credentials not configured", "detail": "Please set your AWS credentials first"}), 401
    
    data = request.json
    collection_id = data.get('collectionId')
    
    if not collection_id:
        return jsonify({"error": "Missing collection ID", "detail": "Collection ID is required"}), 400
    
    # Validate collection ID (alphanumeric with hyphens)
    import re
    if not re.match(r'^[a-zA-Z0-9\-_]+$', collection_id):
        return jsonify({
            "error": "Invalid collection ID format", 
            "detail": "Collection ID must contain only alphanumeric characters, hyphens, and underscores"
        }), 400
    
    try:
        # Check if collection already exists
        try:
            rekognition_client.describe_collection(CollectionId=collection_id)
            return jsonify({
                "error": "Collection already exists", 
                "detail": f"Collection '{collection_id}' already exists"
            }), 409
        except rekognition_client.exceptions.ResourceNotFoundException:
            # Collection doesn't exist, so we can create it
            response = rekognition_client.create_collection(CollectionId=collection_id)
            return jsonify({
                "message": "Collection created successfully",
                "collectionId": collection_id,
                "collectionArn": response.get('CollectionArn'),
                "statusCode": response.get('StatusCode')
            })
    except Exception as e:
        return jsonify({"error": "Failed to create collection", "detail": str(e)}), 500

@app.route('/api/collections/<collection_id>', methods=['GET'])
def describe_collection(collection_id):
    if not rekognition_client:
        return jsonify({"error": "AWS credentials not configured"}), 401
    
    try:
        response = rekognition_client.describe_collection(CollectionId=collection_id)
        return jsonify(response)
    except rekognition_client.exceptions.ResourceNotFoundException:
        return jsonify({"error": "Collection not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/search-faces', methods=['POST'])
@limiter.limit("10 per minute")
def search_faces():
    if not rekognition_client:
        return jsonify({"error": "AWS credentials not configured", "detail": "Please set your AWS credentials first"}), 401
    
    if 'image' not in request.files:
        return jsonify({"error": "No image provided", "detail": "Please select an image to upload"}), 400
        
    file = request.files['image']
    is_valid, error = validate_file(file)
    if not is_valid:
        return jsonify({"error": error, "detail": error}), 400
    
    collection_id = request.form.get('collectionId')
    if not collection_id:
        return jsonify({"error": "No collection ID provided", "detail": "Please select a collection ID"}), 400
    
    try:
        # First check if the collection exists
        try:
            rekognition_client.describe_collection(CollectionId=collection_id)
        except rekognition_client.exceptions.ResourceNotFoundException:
            return jsonify({
                "error": "Collection not found", 
                "detail": f"Collection '{collection_id}' does not exist in your AWS account"
            }), 404
        
        file = request.files['image']
        image_bytes = file.read()
        
        response = rekognition_client.search_faces_by_image(
            CollectionId=collection_id,
            Image={'Bytes': image_bytes},
            MaxFaces=10
        )
        return jsonify(response)
    except rekognition_client.exceptions.InvalidImageFormatException:
        return jsonify({"error": "Invalid image format", "detail": "The image format is not supported by AWS Rekognition"}), 400
    except rekognition_client.exceptions.InvalidParameterException as e:
        return jsonify({"error": "Invalid parameter", "detail": str(e)}), 400
    except rekognition_client.exceptions.ProvisionedThroughputExceededException:
        return jsonify({"error": "AWS throttling", "detail": "AWS Rekognition request rate limit exceeded. Please try again later."}), 429
    except Exception as e:
        return jsonify({"error": "Search faces failed", "detail": str(e)}), 500

def validate_file(file):
    # Check if file exists
    if not file:
        return False, "No file provided"
    
    # Check file extension
    filename = file.filename
    file_ext = Path(filename).suffix.lower()
    if file_ext not in app.config['UPLOAD_EXTENSIONS']:
        return False, "Invalid file extension"
    
    # Read file content
    content = file.read()
    file.seek(0)  # Reset file pointer
    
    # Check file type using magic numbers
    mime = magic.from_buffer(content, mime=True)
    if not mime.startswith('image/'):
        return False, "File must be an image"
    
    # Check file size
    if len(content) > app.config['MAX_CONTENT_LENGTH']:
        return False, "File too large"
    
    return True, None

@app.route('/api/detect-labels', methods=['POST'])
@limiter.limit("10 per minute")
def detect_labels():
    if not rekognition_client:
        return jsonify({"error": "AWS credentials not configured"}), 401
    
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    try:
        file = request.files['image']
        image_bytes = file.read()
        
        response = rekognition_client.detect_labels(
            Image={'Bytes': image_bytes},
            MaxLabels=10
        )
        return jsonify(response)
    except rekognition_client.exceptions.InvalidImageFormatException:
        return jsonify({"error": "Invalid image format"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5003)
