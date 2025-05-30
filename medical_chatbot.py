from dotenv import load_dotenv
from flask import Flask, request, jsonify, Response
import os
import google.generativeai as genai
import requests
import uuid
import io
from werkzeug.utils import secure_filename

# Load environment variables
load_dotenv()

# Set up API keys
GENAI_API_KEY = os.getenv("Gemini_API")
DEEPGRAM_API_KEY = os.getenv("Deepgram_API")

# Configure Gemini
genai.configure(api_key=GENAI_API_KEY)

# Flask App Setup
app = Flask(__name__)
from flask_cors import CORS
CORS(app)

# Configuration
ALLOWED_AUDIO_EXTENSIONS = {'wav', 'mp3', 'm4a', 'flac', 'webm', 'ogg'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Store audio responses temporarily in memory
audio_cache = {}

def allowed_file(filename):
    """Check if the uploaded file has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_AUDIO_EXTENSIONS

def deepgram_speech_to_text(audio_file):
    """
    Use Deepgram API to convert speech to text.
    """
    url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true"
    
    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
    }
    
    files = {
        'audio': audio_file
    }
    
    try:
        response = requests.post(url, headers=headers, files=files)
        response.raise_for_status()
        
        result = response.json()
        
        # Extract transcript from Deepgram response
        if 'results' in result and 'channels' in result['results']:
            alternatives = result['results']['channels'][0]['alternatives']
            if alternatives and len(alternatives) > 0:
                return alternatives[0]['transcript']
        
        return ""
        
    except requests.exceptions.RequestException as e:
        raise Exception(f"Deepgram STT failed: {str(e)}")
    except KeyError as e:
        raise Exception(f"Unexpected Deepgram response format: {str(e)}")

def get_medical_response(user_question):
    """
    Generate medical AI response from Gemini with improved prompt.
    """
    prompt = """
    You are a responsible and helpful medical AI assistant. Follow these guidelines:
    
    1. Provide clear, accurate general health information
    2. Use simple, understandable language
    3. Always emphasize that this is general information, not personalized medical advice
    4. Strongly recommend consulting healthcare professionals for:
       - Serious symptoms
       - Persistent conditions
       - Emergency situations
       - Medication questions
       - Diagnosis or treatment decisions
    5. For emergency symptoms, immediately advise seeking emergency medical care
    6. Be empathetic and supportive while maintaining professional boundaries
    7. Keep responses concise but comprehensive (aim for 2-3 paragraphs)
    
    If the question is not medical-related, politely redirect to medical topics.
    """
    
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content([prompt, user_question])
        return response.text
    except Exception as e:
        raise Exception(f"Failed to generate medical response: {str(e)}")

def deepgram_text_to_speech(text):
    """
    Use Deepgram TTS API to convert text to speech and return audio stream.
    """
    url = "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mp3"

    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": text
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        
        # Verify we got audio content
        if len(response.content) == 0:
            raise Exception("Received empty audio response from Deepgram TTS")
        
        print(f"🔊 Generated audio: {len(response.content)} bytes")
        return response.content
        
    except requests.exceptions.RequestException as e:
        raise Exception(f"Deepgram TTS failed: {str(e)}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "Medical Chatbot"}), 200

@app.route('/medical_bot', methods=['POST'])
def medical_bot():
    """
    Accepts medical question (text or audio) and returns response with audio.
    """
    try:
        question = None
        
        # Check if audio file is uploaded
        if 'audio' in request.files:
            audio_file = request.files['audio']
            
            if audio_file.filename == '':
                return jsonify({"error": "No audio file selected"}), 400
            
            if not allowed_file(audio_file.filename):
                return jsonify({"error": f"Unsupported audio format. Allowed: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}"}), 400
            
            # Check file size
            audio_file.seek(0, os.SEEK_END)
            file_size = audio_file.tell()
            audio_file.seek(0)
            
            if file_size > MAX_FILE_SIZE:
                return jsonify({"error": "Audio file too large. Maximum size: 10MB"}), 400
            
            print("📤 Converting speech to text...")
            question = deepgram_speech_to_text(audio_file)
            
            if not question.strip():
                return jsonify({"error": "Could not extract text from audio. Please try again with clearer audio."}), 400
                
        # Check for text question
        elif request.form.get("question"):
            question = request.form.get("question").strip()
        elif request.json and request.json.get("question"):
            question = request.json.get("question").strip()
        
        if not question:
            return jsonify({"error": "Please provide a medical question (text or audio)"}), 400

        print(f"📝 Processing question: {question[:100]}...")
        
        # Generate medical response
        print("📤 Generating medical response...")
        response_text = get_medical_response(question)

        # Generate audio response
        print("🔊 Generating audio response...")
        audio_content = deepgram_text_to_speech(response_text)
        
        # Create unique session ID for this interaction
        session_id = str(uuid.uuid4())
        
        # Store audio in cache
        audio_cache[session_id] = {
            'audio_content': audio_content,
            'response_text': response_text,
            'question': question
        }

        print("✅ Response ready")
        return jsonify({
            "session_id": session_id,
            "question": question,
            "response_text": response_text,
            "audio_url": f"{request.host_url}get_audio/{session_id}",
            "audio_size": len(audio_content)
        })

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"error": str(e)}), 500
from flask_cors import cross_origin
@app.route('/get_audio/<session_id>', methods=['GET'])
@cross_origin()
def get_audio(session_id):
    """
    Stream the cached audio response.
    """
    try:
        if session_id not in audio_cache:
            return jsonify({"error": "Audio not found or expired"}), 404
        
        cached_data = audio_cache[session_id]
        audio_content = cached_data['audio_content']
        
        # Clean up cache after serving (optional - you might want to keep it longer)
        # del audio_cache[session_id]
        
        return Response(
            audio_content,
            mimetype="audio/mpeg",
            headers={
                "Content-Disposition": f"inline; filename=medical_response_{session_id}.mp3",
                "Content-Length": str(len(audio_content)),
                "Cache-Control": "no-cache",
                "Accept-Ranges": "bytes"
            }
        )
        
    except Exception as e:
        print(f"❌ Audio streaming error: {e}")
        return jsonify({"error": "Failed to serve audio response"}), 500

@app.route('/medical_bot_stream', methods=['POST'])
def medical_bot_stream():
    """
    Alternative endpoint that returns audio directly as a stream.
    """
    try:
        question = None
        
        # Handle audio input
        if 'audio' in request.files:
            audio_file = request.files['audio']
            if audio_file and allowed_file(audio_file.filename):
                print("📤 Converting speech to text...")
                question = deepgram_speech_to_text(audio_file)
        
        # Handle text input
        if not question:
            question = request.form.get("question") or (request.json and request.json.get("question"))
        
        if not question or not question.strip():
            return jsonify({"error": "Please provide a medical question"}), 400

        print(f"📝 Processing question: {question[:100]}...")
        
        # Generate response
        print("📤 Generating medical response...")
        response_text = get_medical_response(question.strip())
        
        print("🔊 Generating audio response...")
        audio_content = deepgram_text_to_speech(response_text)
        
        return Response(
            audio_content,
            mimetype="audio/mpeg",
            headers={
                "X-Response-Text": response_text.replace('\n', ' ')[:500],  # Truncated for header
                "X-Question": question[:200],
                "Content-Disposition": "inline; filename=medical_response.mp3",
                "Content-Length": str(len(audio_content)),
                "Cache-Control": "no-cache"
            }
        )
        
    except Exception as e:
        print(f"❌ Streaming error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/test_tts', methods=['POST'])
def test_tts():
    """
    Test endpoint for TTS functionality.
    """
    try:
        test_text = request.json.get('text', 'Hello, this is a test of the text to speech system.')
        
        print(f"🧪 Testing TTS with text: {test_text}")
        audio_content = deepgram_text_to_speech(test_text)
        
        return Response(
            audio_content,
            mimetype="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=test_tts.mp3",
                "Content-Length": str(len(audio_content)),
                "Cache-Control": "no-cache"
            }
        )
        
    except Exception as e:
        print(f"❌ TTS Test error: {e}")
        return jsonify({"error": str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    # Validate API keys
    if not GENAI_API_KEY:
        print("❌ ERROR: Gemini_API environment variable not set")
        exit(1)
    
    if not DEEPGRAM_API_KEY:
        print("❌ ERROR: Deepgram_API environment variable not set")
        exit(1)
    
    print("🚀 Starting Enhanced Medical Chatbot on http://127.0.0.1:5000/")
    print("📋 Available endpoints:")
    print("   POST /medical_bot - Main chatbot endpoint (text/audio input)")
    print("   POST /medical_bot_stream - Stream audio response directly")
    print("   POST /test_tts - Test TTS functionality")
    print("   GET  /health - Health check")
    print("   GET  /get_audio/<session_id> - Get audio response")
    
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)