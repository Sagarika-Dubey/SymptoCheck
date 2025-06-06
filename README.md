# AI Medical Assistant

An intelligent medical chatbot that uses Google's Gemini API for natural language processing and Deepgram API for speech-to-text capabilities. The chatbot can help users understand their symptoms, provide general health advice, and recommend when to seek professional medical help.

## Features

- Text-based chat interface
- Voice input support
- Emergency situation detection
- Conversation history tracking
- Responsive and modern UI
- Real-time medical advice and guidance

## Prerequisites

- Python 3.8 or higher
- Google Gemini API key
- Deepgram API key
- Modern web browser with microphone support

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd medical-chatbot
```

2. Create a virtual environment and activate it:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the root directory with your API keys:
```
GEMINI_API_KEY=your_gemini_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

5. Start the Flask server:
```bash
python medical_chatbot.py
```

6. Open your browser and navigate to:
```
http://localhost:5000
```

## Usage

1. **Text Input**:
   - Type your symptoms or health concerns in the text input field
   - Press Enter or click the send button to submit

2. **Voice Input**:
   - Click the microphone button to start recording
   - Speak your symptoms or concerns
   - Click the button again to stop recording and send

3. **Emergency Detection**:
   - The chatbot automatically detects emergency keywords
   - Emergency alerts will be displayed prominently
   - Always seek professional medical help for serious conditions

## Important Notes

- This is an AI assistant for general health information only
- Always consult healthcare professionals for medical advice
- The chatbot cannot diagnose conditions or prescribe medications
- Emergency situations should be handled by calling emergency services

## Security

- API keys are stored in environment variables
- HTTPS is recommended for production deployment
- User data is not stored permanently
- Conversations are cleared after 24 hours


## License

This project is licensed under the MIT License - see the LICENSE file for details.
