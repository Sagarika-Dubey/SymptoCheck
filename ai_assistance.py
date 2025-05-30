from flask import Flask, request, jsonify, render_template
import logging
from datetime import datetime, timedelta
import os
import json
import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from collections import defaultdict
import google.generativeai as genai
from functools import lru_cache
import hashlib
from dotenv import load_dotenv
from uuid import uuid4
import asyncio
from enum import Enum

load_dotenv()

# Enhanced configuration
GEMINI_API_KEY = os.environ.get("Gemini_API", "")
genai.configure(api_key=GEMINI_API_KEY)

app = Flask(__name__, template_folder="templates")
from flask_cors import CORS
CORS(app)

# Enhanced logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("medical_assistant.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("medical_assistant")

# In-memory conversation state
CONVERSATIONS = {}

class ConversationStage(Enum):
    GREETING = "greeting"
    SYMPTOM_COLLECTION = "symptom_collection"
    DETAILED_INQUIRY = "detailed_inquiry"
    PATIENT_HISTORY = "patient_history"
    ANALYSIS = "analysis"
    FOLLOW_UP = "follow_up"
    COMPLETED = "completed"

@dataclass
class SymptomDetail:
    symptom: str
    severity: int  # 1-10 scale
    duration: str
    frequency: str
    triggers: List[str]
    alleviating_factors: List[str]

@dataclass
class PatientProfile:
    age: Optional[int] = None
    gender: Optional[str] = None
    medical_history: List[str] = None
    current_medications: List[str] = None
    allergies: List[str] = None
    lifestyle_factors: Dict[str, Any] = None
    family_history: List[str] = None
    
    def __post_init__(self):
        if self.medical_history is None:
            self.medical_history = []
        if self.current_medications is None:
            self.current_medications = []
        if self.allergies is None:
            self.allergies = []
        if self.lifestyle_factors is None:
            self.lifestyle_factors = {}
        if self.family_history is None:
            self.family_history = []

@dataclass 
class ConversationState:
    session_id: str
    stage: ConversationStage
    symptoms: List[SymptomDetail]
    patient_profile: PatientProfile
    conversation_history: List[Dict[str, str]]
    extracted_info: Dict[str, Any]
    diagnosis_results: List[Any]
    follow_up_questions: List[str]
    created_at: datetime
    last_updated: datetime

class EnhancedMedicalChatbot:
    def __init__(self):
        self.model = genai.GenerativeModel('gemini-pro')
        self.symptom_extraction_prompt = self._build_symptom_extraction_prompt()
        self.analysis_prompt = self._build_analysis_prompt()
        
    def _build_symptom_extraction_prompt(self) -> str:
        return """
        You are an expert medical triage assistant. Your task is to extract structured information from patient conversations.
        
        Analyze the user's message and extract:
        1. Symptoms mentioned (with severity 1-10 if mentioned)
        2. Duration of symptoms
        3. Frequency/pattern
        4. Triggering factors
        5. What makes symptoms better/worse
        6. Patient demographics (age, gender if mentioned)
        7. Medical history
        8. Current medications
        9. Lifestyle factors (smoking, exercise, diet, stress levels)
        
        Return your analysis in this JSON format:
        {
            "symptoms": [
                {
                    "symptom": "specific symptom",
                    "severity": number_1_to_10,
                    "duration": "time period",
                    "frequency": "how often",
                    "triggers": ["trigger1", "trigger2"],
                    "alleviating_factors": ["factor1", "factor2"]
                }
            ],
            "patient_info": {
                "age": number_or_null,
                "gender": "string_or_null",
                "medical_history": ["condition1", "condition2"],
                "medications": ["med1", "med2"],
                "lifestyle": {
                    "smoking": "yes/no/unknown",
                    "exercise": "frequency",
                    "stress": "high/medium/low/unknown"
                }
            },
            "urgency_indicators": ["red_flag1", "red_flag2"],
            "missing_info": ["what_info_still_needed"]
        }
        """
    
    def _build_analysis_prompt(self) -> str:
        return """
        You are an expert medical AI providing explainable diagnostic analysis. 
        
        Given the patient information, provide:
        1. Differential diagnosis with confidence levels
        2. Detailed explanation of clinical reasoning
        3. How each symptom contributes to the diagnosis
        4. Possible underlying mechanisms/pathophysiology
        5. Risk factors that may contribute
        6. Recommended immediate actions
        7. When to seek urgent care
        8. Lifestyle modifications
        9. Monitoring recommendations
        
        IMPORTANT: Always explain your reasoning step by step. Use medical knowledge to explain:
        - WHY these symptoms occur together
        - WHAT body systems are likely involved
        - HOW the condition typically develops
        - WHAT complications to watch for
        
        Structure your response as a comprehensive medical assessment with clear explanations.
        """

    async def process_message(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """Process user message and return appropriate response"""
        conversation = self._get_or_create_conversation(session_id)
        
        # Add user message to history
        conversation.conversation_history.append({
            "role": "user", 
            "content": user_message,
            "timestamp": datetime.now().isoformat()
        })
        
        # Extract information from user message
        extracted_info = await self._extract_information(user_message, conversation)
        self._update_conversation_state(conversation, extracted_info)
        
        # Determine next action based on conversation stage
        response = await self._generate_response(conversation, user_message)
        
        # Add assistant response to history
        conversation.conversation_history.append({
            "role": "assistant",
            "content": response["message"],
            "timestamp": datetime.now().isoformat()
        })
        
        conversation.last_updated = datetime.now()
        CONVERSATIONS[session_id] = conversation
        
        return response
    
    def process_message_sync(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """Synchronous version of process_message for Flask compatibility"""
        conversation = self._get_or_create_conversation(session_id)
        
        # Add user message to history
        conversation.conversation_history.append({
            "role": "user", 
            "content": user_message,
            "timestamp": datetime.now().isoformat()
        })
        
        # Extract information from user message
        extracted_info = self._extract_information_sync(user_message, conversation)
        self._update_conversation_state(conversation, extracted_info)
        
        # Determine next action based on conversation stage
        response = self._generate_response_sync(conversation, user_message)
        
        # Add assistant response to history
        conversation.conversation_history.append({
            "role": "assistant",
            "content": response["message"],
            "timestamp": datetime.now().isoformat()
        })
        
        conversation.last_updated = datetime.now()
        CONVERSATIONS[session_id] = conversation
        
        return response
    
    def _get_or_create_conversation(self, session_id: str) -> ConversationState:
        """Get existing conversation or create new one"""
        if session_id not in CONVERSATIONS:
            CONVERSATIONS[session_id] = ConversationState(
                session_id=session_id,
                stage=ConversationStage.GREETING,
                symptoms=[],
                patient_profile=PatientProfile(),
                conversation_history=[],
                extracted_info={},
                diagnosis_results=[],
                follow_up_questions=[],
                created_at=datetime.now(),
                last_updated=datetime.now()
            )
        return CONVERSATIONS[session_id]
    
    async def _extract_information(self, message: str, conversation: ConversationState) -> Dict[str, Any]:
        """Extract structured information from user message using Gemini"""
        try:
            context = self._build_conversation_context(conversation)
            prompt = f"""
            {self.symptom_extraction_prompt}
            
            CONVERSATION CONTEXT:
            {context}
            
            CURRENT USER MESSAGE:
            {message}
            
            Extract and return structured information in JSON format:
            """
            
            response = self.model.generate_content(prompt)
            
            # Parse JSON response
            try:
                extracted_data = json.loads(response.text.strip())
                return extracted_data
            except json.JSONDecodeError:
                # Fallback: extract information using regex/keywords
                return self._fallback_extraction(message)
                
        except Exception as e:
            logger.error(f"Information extraction error: {str(e)}")
            return self._fallback_extraction(message)
    
    def _extract_information_sync(self, message: str, conversation: ConversationState) -> Dict[str, Any]:
        """Synchronous version of information extraction"""
        try:
            context = self._build_conversation_context(conversation)
            prompt = f"""
            {self.symptom_extraction_prompt}
            
            CONVERSATION CONTEXT:
            {context}
            
            CURRENT USER MESSAGE:
            {message}
            
            Extract and return structured information in JSON format:
            """
            
            response = self.model.generate_content(prompt)
            
            # Parse JSON response
            try:
                extracted_data = json.loads(response.text.strip())
                return extracted_data
            except json.JSONDecodeError:
                # Fallback: extract information using regex/keywords
                return self._fallback_extraction(message)
                
        except Exception as e:
            logger.error(f"Information extraction error: {str(e)}")
            return self._fallback_extraction(message)
    
    def _fallback_extraction(self, message: str) -> Dict[str, Any]:
        """Fallback extraction method using keywords"""
        symptoms = []
        patient_info = {}
        
        # Simple keyword-based extraction
        pain_keywords = ["pain", "ache", "hurt", "sore", "tender"]
        fever_keywords = ["fever", "temperature", "hot", "chills"]
        
        message_lower = message.lower()
        
        for keyword in pain_keywords:
            if keyword in message_lower:
                symptoms.append({
                    "symptom": f"{keyword} (extracted)",
                    "severity": 5,  # default
                    "duration": "unknown",
                    "frequency": "unknown",
                    "triggers": [],
                    "alleviating_factors": []
                })
                break
        
        for keyword in fever_keywords:
            if keyword in message_lower:
                symptoms.append({
                    "symptom": "fever",
                    "severity": 5,
                    "duration": "unknown", 
                    "frequency": "unknown",
                    "triggers": [],
                    "alleviating_factors": []
                })
                break
        
        return {
            "symptoms": symptoms,
            "patient_info": patient_info,
            "urgency_indicators": [],
            "missing_info": []
        }
    
    def _update_conversation_state(self, conversation: ConversationState, extracted_info: Dict[str, Any]):
        """Update conversation state with extracted information"""
        # Update symptoms
        for symptom_data in extracted_info.get("symptoms", []):
            symptom_detail = SymptomDetail(
                symptom=symptom_data.get("symptom", ""),
                severity=symptom_data.get("severity", 5),
                duration=symptom_data.get("duration", "unknown"),
                frequency=symptom_data.get("frequency", "unknown"),
                triggers=symptom_data.get("triggers", []),
                alleviating_factors=symptom_data.get("alleviating_factors", [])
            )
            conversation.symptoms.append(symptom_detail)
        
        # Update patient profile
        patient_info = extracted_info.get("patient_info", {})
        if patient_info.get("age"):
            conversation.patient_profile.age = patient_info["age"]
        if patient_info.get("gender"):
            conversation.patient_profile.gender = patient_info["gender"]
        if patient_info.get("medical_history"):
            conversation.patient_profile.medical_history.extend(patient_info["medical_history"])
        if patient_info.get("medications"):
            conversation.patient_profile.current_medications.extend(patient_info["medications"])
        
        # Update extracted info
        conversation.extracted_info.update(extracted_info)
        
        # Update conversation stage
        self._update_conversation_stage(conversation)
    
    def _update_conversation_stage(self, conversation: ConversationState):
        """Update conversation stage based on collected information"""
        if len(conversation.symptoms) == 0:
            conversation.stage = ConversationStage.SYMPTOM_COLLECTION
        elif len(conversation.symptoms) < 3:
            conversation.stage = ConversationStage.DETAILED_INQUIRY
        elif not conversation.patient_profile.age:
            conversation.stage = ConversationStage.PATIENT_HISTORY
        elif len(conversation.symptoms) >= 3 and conversation.patient_profile.age:
            conversation.stage = ConversationStage.ANALYSIS
        else:
            conversation.stage = ConversationStage.FOLLOW_UP
    
    async def _generate_response(self, conversation: ConversationState, user_message: str) -> Dict[str, Any]:
        """Generate appropriate response based on conversation stage"""
        if conversation.stage == ConversationStage.GREETING:
            return await self._generate_greeting_response()
        elif conversation.stage == ConversationStage.SYMPTOM_COLLECTION:
            return await self._generate_symptom_collection_response(conversation)
        elif conversation.stage == ConversationStage.DETAILED_INQUIRY:
            return await self._generate_detailed_inquiry_response(conversation)
        elif conversation.stage == ConversationStage.PATIENT_HISTORY:
            return await self._generate_patient_history_response(conversation)
        elif conversation.stage == ConversationStage.ANALYSIS:
            return await self._generate_analysis_response(conversation)
        else:
            return await self._generate_follow_up_response(conversation)
    
    async def _generate_greeting_response(self) -> Dict[str, Any]:
        """Generate greeting response"""
        return {
            "message": "Hello! I'm your AI medical assistant. I'm here to help understand your symptoms and provide guidance. Please describe what's bothering you today. Remember, I provide information only and cannot replace professional medical advice.",
            "stage": "greeting",
            "urgency": "none"
        }
    
    async def _generate_symptom_collection_response(self, conversation: ConversationState) -> Dict[str, Any]:
        """Generate response to collect more symptoms"""
        try:
            current_symptoms = [s.symptom for s in conversation.symptoms]
            
            prompt = f"""
            The patient has mentioned these symptoms: {current_symptoms}
            
            As a medical triage assistant, ask a follow-up question to gather more symptom information.
            Be empathetic and professional. Ask about:
            - Additional symptoms they might be experiencing
            - Severity of current symptoms
            - When symptoms started
            - What makes symptoms better or worse
            
            Keep the response conversational and supportive.
            """
            
            response = self.model.generate_content(prompt)
            
            return {
                "message": response.text,
                "stage": "symptom_collection",
                "current_symptoms": current_symptoms,
                "urgency": "low"
            }
            
        except Exception as e:
            logger.error(f"Symptom collection response error: {str(e)}")
            return {
                "message": "Can you tell me more about your symptoms? When did they start and how severe are they?",
                "stage": "symptom_collection",
                "urgency": "low"
            }
    
    async def _generate_detailed_inquiry_response(self, conversation: ConversationState) -> Dict[str, Any]:
        """Generate response for detailed symptom inquiry"""
        try:
            symptoms_summary = self._summarize_symptoms(conversation.symptoms)
            
            prompt = f"""
            Patient symptoms so far: {symptoms_summary}
            
            As a thorough medical assistant, ask specific follow-up questions about:
            - Timeline and progression of symptoms
            - Associated symptoms they might not have mentioned
            - Potential triggers or recent changes
            - Impact on daily activities
            
            Be specific and medically relevant in your questioning.
            """
            
            response = self.model.generate_content(prompt)
            
            return {
                "message": response.text,
                "stage": "detailed_inquiry",
                "symptoms_count": len(conversation.symptoms),
                "urgency": "low"
            }
            
        except Exception as e:
            logger.error(f"Detailed inquiry response error: {str(e)}")
            return {
                "message": "Can you tell me more about when these symptoms started and if anything specific triggers them?",
                "stage": "detailed_inquiry",
                "urgency": "low"
            }
    
    async def _generate_patient_history_response(self, conversation: ConversationState) -> Dict[str, Any]:
        """Generate response to collect patient history"""
        try:
            prompt = f"""
            We've discussed the patient's symptoms. Now I need to gather important background information.
            
            Ask about:
            - Age (if not provided)
            - Relevant medical history
            - Current medications
            - Allergies
            - Family history of similar conditions
            
            Keep it friendly and explain why this information helps with assessment.
            """
            
            response = self.model.generate_content(prompt)
            
            return {
                "message": response.text,
                "stage": "patient_history",
                "urgency": "low"
            }
            
        except Exception as e:
            logger.error(f"Patient history response error: {str(e)}")
            return {
                "message": "To better help you, could you share your age and any relevant medical history or medications you're currently taking?",
                "stage": "patient_history",
                "urgency": "low"
            }
    
    async def _generate_analysis_response(self, conversation: ConversationState) -> Dict[str, Any]:
        """Generate comprehensive medical analysis with explanations"""
        try:
            # Build comprehensive patient summary
            patient_summary = self._build_patient_summary(conversation)
            
            prompt = f"""
            {self.analysis_prompt}
            
            PATIENT INFORMATION:
            {patient_summary}
            
            Provide a comprehensive analysis including:
            
            1. DIFFERENTIAL DIAGNOSIS (with confidence levels)
            2. CLINICAL REASONING 
               - Explain how symptoms relate to each other
               - Describe likely pathophysiology
               - Explain body systems involved
            
            3. SYMPTOM ANALYSIS
               - How each symptom contributes to diagnosis
               - Typical progression patterns
               - Red flags to watch for
            
            4. RISK FACTORS & CONTRIBUTING FACTORS
               - Patient-specific risks
               - Lifestyle factors
               - Environmental considerations
            
            5. IMMEDIATE RECOMMENDATIONS
               - Urgency level assessment
               - When to seek care
               - Self-care measures
               - Warning signs
            
            6. EXPLANATION OF CONDITION
               - What causes this condition
               - How it typically develops
               - Why these symptoms occur
               - Expected course if untreated
            
            7. PREVENTION & MANAGEMENT
               - Lifestyle modifications
               - Long-term management
               - Follow-up recommendations
            
            Make your explanation educational and easy to understand while being medically accurate.
            """
            
            response = self.model.generate_content(prompt)
            
            # Determine urgency level
            urgency = self._assess_urgency(conversation.symptoms)
            
            return {
                "message": response.text,
                "stage": "analysis",
                "analysis_complete": True,
                "urgency": urgency,
                "patient_summary": patient_summary
            }
            
        except Exception as e:
            logger.error(f"Analysis response error: {str(e)}")
            return {
                "message": "I'm having trouble generating a complete analysis right now. Based on your symptoms, I'd recommend consulting with a healthcare provider for proper evaluation.",
                "stage": "analysis",
                "urgency": "moderate"
            }
    
    async def _generate_follow_up_response(self, conversation: ConversationState) -> Dict[str, Any]:
        """Generate follow-up response"""
        try:
            prompt = f"""
            The patient has received their analysis. Provide helpful follow-up by:
            - Asking if they have questions about the assessment
            - Offering to clarify any medical terms
            - Checking if they need guidance on next steps
            - Being supportive and reassuring
            
            Keep it brief and focused on their needs.
            """
            
            response = self.model.generate_content(prompt)
            
            return {
                "message": response.text,
                "stage": "follow_up",
                "urgency": "low"
            }
            
        except Exception as e:
            logger.error(f"Follow-up response error: {str(e)}")
            return {
                "message": "Do you have any questions about the analysis? I'm here to help clarify anything or discuss next steps.",
                "stage": "follow_up",
                "urgency": "low"
            }
    
    def _build_conversation_context(self, conversation: ConversationState) -> str:
        """Build context string for AI prompts"""
        context = []
        
        if conversation.symptoms:
            context.append(f"Current symptoms: {[s.symptom for s in conversation.symptoms]}")
        
        if conversation.patient_profile.age:
            context.append(f"Patient age: {conversation.patient_profile.age}")
            
        if conversation.patient_profile.medical_history:
            context.append(f"Medical history: {conversation.patient_profile.medical_history}")
            
        return " | ".join(context)
    
    def _summarize_symptoms(self, symptoms: List[SymptomDetail]) -> str:
        """Create summary of symptoms for AI processing"""
        summary = []
        for symptom in symptoms:
            summary.append(f"{symptom.symptom} (severity: {symptom.severity}/10, duration: {symptom.duration})")
        return " | ".join(summary)
    
    def _build_patient_summary(self, conversation: ConversationState) -> str:
        """Build comprehensive patient summary"""
        summary = []
        
        # Demographics
        if conversation.patient_profile.age:
            summary.append(f"Age: {conversation.patient_profile.age}")
        if conversation.patient_profile.gender:
            summary.append(f"Gender: {conversation.patient_profile.gender}")
        
        # Symptoms
        if conversation.symptoms:
            symptoms_detail = []
            for symptom in conversation.symptoms:
                detail = f"{symptom.symptom}"
                if symptom.severity:
                    detail += f" (severity: {symptom.severity}/10)"
                if symptom.duration and symptom.duration != "unknown":
                    detail += f" (duration: {symptom.duration})"
                symptoms_detail.append(detail)
            summary.append(f"Symptoms: {'; '.join(symptoms_detail)}")
        
        # Medical history
        if conversation.patient_profile.medical_history:
            summary.append(f"Medical history: {', '.join(conversation.patient_profile.medical_history)}")
        
        # Medications
        if conversation.patient_profile.current_medications:
            summary.append(f"Current medications: {', '.join(conversation.patient_profile.current_medications)}")
        
        # Lifestyle factors
        if conversation.patient_profile.lifestyle_factors:
            lifestyle = []
            for factor, value in conversation.patient_profile.lifestyle_factors.items():
                lifestyle.append(f"{factor}: {value}")
            summary.append(f"Lifestyle: {', '.join(lifestyle)}")
        
        return " | ".join(summary)
    
    def _assess_urgency(self, symptoms: List[SymptomDetail]) -> str:
        """Assess urgency based on symptoms"""
        high_urgency_keywords = [
            "chest pain", "difficulty breathing", "severe headache", 
            "loss of consciousness", "severe bleeding", "stroke symptoms"
        ]
        
        moderate_urgency_keywords = [
            "fever", "persistent pain", "vision changes", "severe nausea"
        ]
        
        symptom_texts = [s.symptom.lower() for s in symptoms]
        high_severity_count = sum(1 for s in symptoms if s.severity >= 8)
        
        # Check for high urgency symptoms
        for symptom_text in symptom_texts:
            for urgent_symptom in high_urgency_keywords:
                if urgent_symptom in symptom_text:
                    return "high"
        
        # Check severity scores
        if high_severity_count >= 2:
            return "high"
        elif high_severity_count >= 1:
            return "moderate"
        
        # Check for moderate urgency symptoms
        for symptom_text in symptom_texts:
            for moderate_symptom in moderate_urgency_keywords:
                if moderate_symptom in symptom_text:
                    return "moderate"
        
        return "low"

# Global chatbot instance
medical_chatbot = EnhancedMedicalChatbot()

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Enhanced AI Medical Chatbot with Explainable AI v4.0",
        "features": [
            "Conversational symptom collection",
            "Explainable AI analysis",
            "Comprehensive medical reasoning",
            "Patient-specific recommendations",
            "Multi-stage conversation flow",
            "Urgency assessment"
        ],
        "status": "active"
    })

@app.route("/chat", methods=["POST"])
def enhanced_chat():
    try:
        data = request.json
        session_id = data.get("session_id") or str(uuid4())
        user_message = data.get("message", "").strip()
        
        if not user_message:
            return jsonify({
                "error": "No message provided",
                "session_id": session_id
            }), 400
        
        logger.info(f"Processing message for session {session_id}: {user_message[:100]}...")
        
        # Process message with enhanced chatbot (synchronous version)
        response = medical_chatbot.process_message_sync(session_id, user_message)
        
        # Get conversation state
        conversation = CONVERSATIONS.get(session_id)
        
        response_data = {
            "session_id": session_id,
            "response": response["message"],
            "stage": response["stage"],
            "urgency": response["urgency"],
            "timestamp": datetime.now().isoformat()
        }
        
        # Add additional context based on stage
        if conversation:
            response_data["conversation_summary"] = {
                "symptoms_count": len(conversation.symptoms),
                "has_patient_info": bool(conversation.patient_profile.age),
                "conversation_length": len(conversation.conversation_history)
            }
            
            if response["stage"] == "analysis":
                response_data["analysis_complete"] = True
                response_data["patient_summary"] = response.get("patient_summary", "")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Enhanced chat error: {str(e)}")
        return jsonify({
            "error": "I'm having trouble processing your message right now. Could you please try again?",
            "session_id": session_id,
            "technical_error": str(e) if app.debug else None
        }), 500

@app.route("/conversation/<session_id>", methods=["GET"])
def get_conversation(session_id: str):
    """Get conversation history"""
    conversation = CONVERSATIONS.get(session_id)
    
    if not conversation:
        return jsonify({"error": "Conversation not found"}), 404
    
    return jsonify({
        "session_id": session_id,
        "stage": conversation.stage.value,
        "created_at": conversation.created_at.isoformat(),
        "last_updated": conversation.last_updated.isoformat(),
        "conversation_history": conversation.conversation_history,
        "symptoms": [asdict(s) for s in conversation.symptoms],
        "patient_profile": asdict(conversation.patient_profile),
        "diagnosis_results": conversation.diagnosis_results
    })

@app.route("/conversation/<session_id>/reset", methods=["POST"])
def reset_conversation(session_id: str):
    """Reset conversation"""
    if session_id in CONVERSATIONS:
        del CONVERSATIONS[session_id]
    
    return jsonify({
        "message": "Conversation reset successfully",
        "session_id": session_id
    })

@app.route("/health-check", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "version": "4.0-enhanced-chatbot",
        "timestamp": datetime.now().isoformat(),
        "active_conversations": len(CONVERSATIONS),
        "ai_enabled": bool(GEMINI_API_KEY)
    })

@app.route("/chat-ui", methods=["GET"])
def chat_ui():
    return render_template("enhanced_chat.html")

def cleanup_old_conversations():
    """Remove conversations older than 24 hours"""
    cutoff_time = datetime.now() - timedelta(hours=24)
    sessions_to_remove = []
    
    for session_id, conversation in CONVERSATIONS.items():
        if conversation.last_updated < cutoff_time:
            sessions_to_remove.append(session_id)
    
    for session_id in sessions_to_remove:
        del CONVERSATIONS[session_id]
    
    logger.info(f"Cleaned up {len(sessions_to_remove)} old conversations")

# Add cleanup middleware
@app.before_request
def before_request():
    """Cleanup old conversations before each request"""
    import random
    # Only run cleanup 5% of the time to avoid overhead
    if random.random() < 0.05:
        cleanup_old_conversations()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting Enhanced Medical Chatbot v4.0 on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)