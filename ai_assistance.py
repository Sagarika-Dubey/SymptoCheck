from flask import Flask, request, jsonify
import logging
from datetime import datetime, timedelta
import os
import json
import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from collections import defaultdict
import google.generativeai as genai
from functools import lru_cache
import hashlib
from dotenv import load_dotenv
load_dotenv()

# Enhanced configuration
GEMINI_API_KEY = os.environ.get("Gemini_API", "")
genai.configure(api_key=GEMINI_API_KEY)

app = Flask(__name__)
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

@dataclass
class DiagnosisResult:
    condition: str
    confidence: float
    matched_symptoms: List[str]
    pathognomonic_symptoms: List[str]
    severity: str
    severity_score: int
    action: str
    info: str
    risk_factors: List[str]
    specificity_score: float

@dataclass
class PatientProfile:
    age: Optional[int]
    gender: Optional[str]
    medical_history: List[str]
    current_medications: List[str]
    allergies: List[str]

# Enhanced medical database with more flexible matching
MEDICAL_DATA = {
    "heart attack": {
        "symptoms": {
            "chest pain": {"weight": 0.9, "specificity": 0.7},
            "crushing chest pain": {"weight": 1.0, "specificity": 0.9},
            "chest pressure": {"weight": 0.85, "specificity": 0.75},
            "pain radiating to left arm": {"weight": 0.95, "specificity": 0.85},
            "pain radiating to jaw": {"weight": 0.9, "specificity": 0.8},
            "shortness of breath": {"weight": 0.7, "specificity": 0.5},
            "sweating": {"weight": 0.6, "specificity": 0.4},
            "nausea": {"weight": 0.5, "specificity": 0.3},
            "dizziness": {"weight": 0.4, "specificity": 0.3},
            "fatigue": {"weight": 0.35, "specificity": 0.25}
        },
        "key_symptoms": ["chest pain", "crushing chest pain", "chest pressure"],
        "severity": "critical",
        "action": "Call emergency services immediately. Sit and rest. Take aspirin if available and not allergic.",
        "info": "Heart attacks require immediate medical attention - time is critical",
        "risk_factors": ["smoking", "high blood pressure", "diabetes", "family history"],
        "minimum_confidence": 0.3
    },
    
    "stroke": {
        "symptoms": {
            "face drooping": {"weight": 1.0, "specificity": 0.95},
            "arm weakness": {"weight": 1.0, "specificity": 0.9},
            "speech difficulty": {"weight": 1.0, "specificity": 0.9},
            "sudden confusion": {"weight": 0.9, "specificity": 0.85},
            "severe headache": {"weight": 0.8, "specificity": 0.7},
            "vision problems": {"weight": 0.7, "specificity": 0.6},
            "dizziness": {"weight": 0.4, "specificity": 0.3},
            "loss of balance": {"weight": 0.6, "specificity": 0.5}
        },
        "key_symptoms": ["face drooping", "arm weakness", "speech difficulty"],
        "severity": "critical",
        "action": "Call emergency services immediately. Note time of symptom onset.",
        "info": "FAST: Face drooping, Arm weakness, Speech difficulty, Time to call emergency",
        "risk_factors": ["high blood pressure", "diabetes", "smoking", "age over 65"],
        "minimum_confidence": 0.35
    },
    
    "asthma attack": {
        "symptoms": {
            "wheezing": {"weight": 1.0, "specificity": 0.85},
            "shortness of breath": {"weight": 0.8, "specificity": 0.6},
            "chest tightness": {"weight": 0.75, "specificity": 0.65},
            "coughing": {"weight": 0.7, "specificity": 0.5},
            "difficulty breathing": {"weight": 0.85, "specificity": 0.7}
        },
        "key_symptoms": ["wheezing", "shortness of breath", "difficulty breathing"],
        "severity": "severe",
        "action": "Use rescue inhaler immediately. Sit upright. Seek emergency care if no improvement.",
        "info": "Asthma attacks can be life-threatening without proper treatment",
        "risk_factors": ["allergies", "respiratory infections", "exercise", "cold air"],
        "minimum_confidence": 0.25
    },
    
    "pneumonia": {
        "symptoms": {
            "persistent cough": {"weight": 0.8, "specificity": 0.6},
            "fever": {"weight": 0.75, "specificity": 0.5},
            "chest pain": {"weight": 0.7, "specificity": 0.5},
            "shortness of breath": {"weight": 0.65, "specificity": 0.4},
            "fatigue": {"weight": 0.5, "specificity": 0.3},
            "chills": {"weight": 0.6, "specificity": 0.4},
            "cough with phlegm": {"weight": 0.85, "specificity": 0.7}
        },
        "key_symptoms": ["persistent cough", "fever", "chest pain"],
        "severity": "moderate",
        "action": "See doctor within 24 hours. Rest and drink fluids.",
        "info": "Pneumonia requires antibiotic treatment and can be serious",
        "risk_factors": ["age over 65", "smoking", "chronic diseases"],
        "minimum_confidence": 0.2
    },
    
    "urinary tract infection": {
        "symptoms": {
            "burning urination": {"weight": 1.0, "specificity": 0.85},
            "frequent urination": {"weight": 0.8, "specificity": 0.7},
            "cloudy urine": {"weight": 0.75, "specificity": 0.65},
            "strong smelling urine": {"weight": 0.7, "specificity": 0.6},
            "pelvic pain": {"weight": 0.65, "specificity": 0.55},
            "blood in urine": {"weight": 0.8, "specificity": 0.75},
            "urgency": {"weight": 0.6, "specificity": 0.5}
        },
        "key_symptoms": ["burning urination", "frequent urination"],
        "severity": "moderate",
        "action": "Schedule doctor appointment. Drink plenty of water.",
        "info": "UTIs require antibiotic treatment to prevent kidney infection",
        "risk_factors": ["female gender", "sexual activity", "pregnancy"],
        "minimum_confidence": 0.25
    },
    
    "common cold": {
        "symptoms": {
            "runny nose": {"weight": 0.8, "specificity": 0.6},
            "sneezing": {"weight": 0.75, "specificity": 0.5},
            "congestion": {"weight": 0.7, "specificity": 0.45},
            "sore throat": {"weight": 0.65, "specificity": 0.4},
            "mild cough": {"weight": 0.6, "specificity": 0.35},
            "mild headache": {"weight": 0.4, "specificity": 0.3},
            "low grade fever": {"weight": 0.5, "specificity": 0.35}
        },
        "key_symptoms": ["runny nose", "sneezing", "congestion"],
        "severity": "mild",
        "action": "Rest, fluids, over-the-counter symptom relief as needed.",
        "info": "Usually resolves in 7-10 days without treatment",
        "risk_factors": ["close contact with infected persons", "stress"],
        "minimum_confidence": 0.15
    },
    
    "migraine": {
        "symptoms": {
            "severe headache": {"weight": 0.9, "specificity": 0.7},
            "throbbing headache": {"weight": 0.95, "specificity": 0.8},
            "light sensitivity": {"weight": 0.8, "specificity": 0.75},
            "sound sensitivity": {"weight": 0.75, "specificity": 0.7},
            "nausea": {"weight": 0.7, "specificity": 0.5},
            "vomiting": {"weight": 0.65, "specificity": 0.6},
            "visual disturbances": {"weight": 0.8, "specificity": 0.8}
        },
        "key_symptoms": ["severe headache", "throbbing headache"],
        "severity": "moderate",
        "action": "Rest in dark, quiet room. Use prescribed migraine medication if available.",
        "info": "Migraines can be debilitating but are not life-threatening",
        "risk_factors": ["stress", "hormonal changes", "certain foods", "family history"],
        "minimum_confidence": 0.2
    },
    
    "tension headache": {
        "symptoms": {
            "dull headache": {"weight": 0.8, "specificity": 0.6},
            "pressure in head": {"weight": 0.75, "specificity": 0.65},
            "tight band feeling": {"weight": 0.7, "specificity": 0.7},
            "neck tension": {"weight": 0.6, "specificity": 0.5},
            "mild headache": {"weight": 0.65, "specificity": 0.4}
        },
        "key_symptoms": ["dull headache", "pressure in head"],
        "severity": "mild",
        "action": "Rest, over-the-counter pain relievers, stress management.",
        "info": "Most common type of headache, usually responds well to simple treatments",
        "risk_factors": ["stress", "lack of sleep", "dehydration"],
        "minimum_confidence": 0.15
    }
}

# Enhanced symptom mapping with more alternatives
SYMPTOM_MAPPING = {
    "chest pain": ["chest discomfort", "chest pressure", "heart pain", "chest ache", "chest burning"],
    "shortness of breath": ["difficulty breathing", "breathlessness", "dyspnea", "hard to breathe", "can't breathe"],
    "headache": ["head pain", "head pressure", "head ache"],
    "dizziness": ["lightheadedness", "unsteady", "vertigo", "spinning"],
    "nausea": ["feeling sick", "queasy", "upset stomach", "sick to stomach"],
    "fatigue": ["tiredness", "exhaustion", "no energy", "tired", "weakness"],
    "fever": ["high temperature", "elevated temperature", "febrile", "hot", "temperature"],
    "cough": ["coughing", "hacking"],
    "runny nose": ["nasal discharge", "stuffy nose", "nose running"],
    "sore throat": ["throat pain", "scratchy throat", "throat ache"],
    "burning urination": ["painful urination", "burning when urinating", "pain urinating"]
}

class EnhancedMedicalAssistant:
    def __init__(self):
        self.diagnosis_cache = {}
        
    def normalize_symptom(self, symptom: str) -> List[str]:
        """Enhanced symptom normalization with fuzzy matching"""
        symptom_lower = symptom.lower().strip()
        normalized = [symptom_lower]
        
        # Direct mapping
        for main_symptom, alternatives in SYMPTOM_MAPPING.items():
            if symptom_lower == main_symptom or symptom_lower in alternatives:
                normalized.append(main_symptom)
                break
            # Partial matching for better coverage
            for alt in alternatives:
                if alt in symptom_lower or symptom_lower in alt:
                    normalized.append(main_symptom)
                    break
        
        return list(set(normalized))
    
    def calculate_flexible_confidence(self, condition: str, matched_symptoms: Dict[str, float], 
                                    patient_profile: PatientProfile) -> Tuple[float, float]:
        """More flexible confidence calculation"""
        condition_data = MEDICAL_DATA[condition]
        condition_symptoms = condition_data["symptoms"]
        key_symptoms = condition_data.get("key_symptoms", [])
        
        # Check for key symptoms (not strictly required)
        key_symptom_bonus = 0.0
        for key_symptom in key_symptoms:
            for matched_sym in matched_symptoms.keys():
                if self._flexible_symptom_match(key_symptom, matched_sym):
                    key_symptom_bonus += 0.2
                    break
        
        # Calculate base confidence
        total_weight = sum(data["weight"] for data in condition_symptoms.values())
        matched_weight = 0.0
        specificity_sum = 0.0
        matched_count = 0
        
        for symptom, symptom_data in condition_symptoms.items():
            for matched_sym in matched_symptoms.keys():
                if self._flexible_symptom_match(symptom, matched_sym):
                    matched_weight += symptom_data["weight"]
                    specificity_sum += symptom_data["specificity"]
                    matched_count += 1
                    break
        
        if total_weight == 0 or matched_count == 0:
            return 0.0, 0.0
        
        base_confidence = matched_weight / total_weight
        base_confidence += key_symptom_bonus  # Bonus for key symptoms
        
        # Specificity score
        specificity_score = specificity_sum / matched_count if matched_count > 0 else 0.0
        
        # Patient factors (conservative boost)
        multiplier = 1.0
        if patient_profile.medical_history:
            risk_factors = condition_data.get("risk_factors", [])
            matching_risks = set(patient_profile.medical_history).intersection(set(risk_factors))
            if matching_risks:
                multiplier += len(matching_risks) * 0.1
        
        # Age considerations
        if patient_profile.age:
            if condition in ["heart attack", "stroke"] and patient_profile.age > 50:
                multiplier += 0.1
        
        final_confidence = min(0.95, base_confidence * multiplier)
        
        return final_confidence, specificity_score
    
    def _flexible_symptom_match(self, condition_symptom: str, user_symptom: str) -> bool:
        """More flexible symptom matching"""
        condition_words = set(condition_symptom.lower().split())
        user_words = set(user_symptom.lower().split())
        
        # Check for direct substring matches
        if condition_symptom.lower() in user_symptom.lower() or user_symptom.lower() in condition_symptom.lower():
            return True
        
        # Check for word overlap (50% threshold instead of 70%)
        if condition_words and user_words:
            overlap = len(condition_words.intersection(user_words))
            return overlap / max(len(condition_words), len(user_words)) >= 0.5
        
        return False
    
    def diagnose(self, symptoms: List[str], patient_profile: PatientProfile) -> List[DiagnosisResult]:
        """Enhanced diagnosis with more flexible matching"""
        if not symptoms:
            return []
        
        # Normalize symptoms
        normalized_symptoms = {}
        for symptom in symptoms:
            normalized = self.normalize_symptom(symptom)
            for norm_sym in normalized:
                normalized_symptoms[norm_sym] = symptom
        
        results = []
        
        for condition, condition_data in MEDICAL_DATA.items():
            confidence, specificity = self.calculate_flexible_confidence(
                condition, normalized_symptoms, patient_profile
            )
            
            # Use minimum confidence from data
            min_confidence = condition_data.get("minimum_confidence", 0.15)
            
            if confidence >= min_confidence:
                # Find matched symptoms
                matched_symptoms = []
                pathognomonic_symptoms = []
                
                for condition_symptom, symptom_data in condition_data["symptoms"].items():
                    for user_symptom in normalized_symptoms.keys():
                        if self._flexible_symptom_match(condition_symptom, user_symptom):
                            matched_symptoms.append(condition_symptom)
                            if symptom_data["specificity"] >= 0.8:
                                pathognomonic_symptoms.append(condition_symptom)
                            break
                
                if matched_symptoms:
                    # Calculate severity score
                    base_scores = {"critical": 95, "severe": 75, "moderate": 50, "mild": 25}
                    severity_score = int(base_scores[condition_data["severity"]] * (1 + confidence * 0.3))
                    
                    result = DiagnosisResult(
                        condition=condition,
                        confidence=round(confidence, 3),
                        matched_symptoms=matched_symptoms,
                        pathognomonic_symptoms=pathognomonic_symptoms,
                        severity=condition_data["severity"],
                        severity_score=severity_score,
                        action=condition_data["action"],
                        info=condition_data["info"],
                        risk_factors=condition_data.get("risk_factors", []),
                        specificity_score=round(specificity, 3)
                    )
                    results.append(result)
        
        # Sort by combined score and return top 5
        results.sort(key=lambda x: (x.confidence * x.specificity_score, x.severity_score), reverse=True)
        
        return results[:5]

# Global assistant instance
medical_assistant = EnhancedMedicalAssistant()

def get_enhanced_gemini_analysis(symptoms: List[str], patient_profile: PatientProfile, 
                               top_diagnoses: List[DiagnosisResult]) -> Optional[str]:
    """Enhanced Gemini analysis"""
    if not GEMINI_API_KEY or not top_diagnoses:
        return None
    
    try:
        model = genai.GenerativeModel('gemini-pro')
        
        medical_history_str = ", ".join(patient_profile.medical_history) if patient_profile.medical_history else "None"
        symptoms_str = ", ".join(symptoms)
        top_conditions = [f"{d.condition} (confidence: {d.confidence:.1%})" for d in top_diagnoses[:3]]
        
        prompt = f"""
        Medical Analysis Request:
        
        PATIENT SYMPTOMS: {symptoms_str}
        TOP DIAGNOSES: {', '.join(top_conditions)}
        
        PATIENT INFO:
        - Age: {patient_profile.age or 'Not provided'}
        - Medical History: {medical_history_str}
        
        Please provide:
        1. Clinical reasoning for the top diagnosis
        2. Key warning signs to watch for
        3. Recommended next steps
        4. When to seek immediate care
        
        Keep response concise and medically sound.
        """
        
        response = model.generate_content(prompt)
        return response.text
    
    except Exception as e:
        logger.error(f"Gemini API error: {str(e)}")
        return None

def get_confidence_level(confidence: float) -> str:
    """Convert confidence score to descriptive level"""
    if confidence >= 0.8:
        return "Very High"
    elif confidence >= 0.6:
        return "High"
    elif confidence >= 0.4:
        return "Moderate"
    elif confidence >= 0.2:
        return "Low-Moderate"
    else:
        return "Low"

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Enhanced AI Medical Assistant API v3.1",
        "features": [
            "Flexible symptom matching",
            "Balanced confidence scoring",
            "Top 5 differential diagnosis",
            "Patient-specific analysis",
            "Reduced false negatives"
        ],
        "status": "active"
    })

@app.route("/diagnose", methods=["POST"])
def enhanced_diagnose():
    try:
        data = request.json
        symptoms = data.get("symptoms", [])
        
        # Patient profile
        patient_profile = PatientProfile(
            age=data.get("age"),
            gender=data.get("gender"),
            medical_history=data.get("medical_history", []),
            current_medications=data.get("current_medications", []),
            allergies=data.get("allergies", [])
        )
        
        if not symptoms:
            return jsonify({
                "error": "No symptoms provided",
                "suggestion": "Please provide at least one symptom for analysis"
            }), 400
        
        logger.info(f"Enhanced diagnosis - Symptoms: {symptoms} | Age: {patient_profile.age}")
        
        # Get diagnoses
        diagnoses = medical_assistant.diagnose(symptoms, patient_profile)
        
        # Always provide some analysis, even if confidence is low
        if not diagnoses:
            return jsonify({
                "message": "Unable to match symptoms to known conditions",
                "provided_symptoms": symptoms,
                "recommendation": "Consider consulting a healthcare provider for proper evaluation",
                "general_advice": "Monitor symptoms and seek medical attention if they worsen or persist"
            })
        
        # Get AI analysis
        gemini_analysis = get_enhanced_gemini_analysis(symptoms, patient_profile, diagnoses)
        
        # Prepare comprehensive response
        response = {
            "timestamp": datetime.now().isoformat(),
            "analysis_version": "3.1-enhanced",
            "input_symptoms": symptoms,
            "total_matches": len(diagnoses),
            "diagnoses": []
        }
        
        for i, d in enumerate(diagnoses, 1):
            diagnosis_info = {
                "rank": i,
                "condition": d.condition.title(),
                "confidence_percentage": f"{d.confidence:.1%}",
                "confidence_level": get_confidence_level(d.confidence),
                "matched_symptoms": d.matched_symptoms,
                "key_indicators": d.pathognomonic_symptoms,
                "severity": d.severity.upper(),
                "recommended_action": d.action,
                "additional_info": d.info,
                "risk_factors": d.risk_factors[:5]  # Limit to top 5
            }
            response["diagnoses"].append(diagnosis_info)
        
        # Set urgency based on top diagnosis
        top_diagnosis = diagnoses[0]
        if top_diagnosis.severity == "critical":
            response["urgency_level"] = "EMERGENCY"
            response["immediate_action"] = "Seek emergency medical care immediately"
        elif top_diagnosis.severity == "severe":
            response["urgency_level"] = "URGENT"
            response["immediate_action"] = "Seek medical attention today"
        elif top_diagnosis.severity == "moderate":
            response["urgency_level"] = "MODERATE"
            response["immediate_action"] = "Schedule medical consultation soon"
        else:
            response["urgency_level"] = "LOW"
            response["immediate_action"] = "Monitor symptoms, consult if worsening"
        
        # Add AI analysis if available
        if gemini_analysis:
            response["ai_analysis"] = gemini_analysis
        
        # Medical disclaimer
        response["disclaimer"] = "This analysis is for informational purposes only and does not replace professional medical advice"
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Enhanced diagnosis error: {str(e)}")
        return jsonify({
            "error": "Analysis temporarily unavailable",
            "recommendation": "Please consult a healthcare provider",
            "emergency_note": "For severe symptoms, seek immediate medical attention"
        }), 500

@app.route("/health-check", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "version": "3.1-enhanced",
        "timestamp": datetime.now().isoformat(),
        "database_conditions": len(MEDICAL_DATA),
        "ai_enabled": bool(GEMINI_API_KEY)
    })

@app.route("/conditions", methods=["GET"])
def list_conditions():
    conditions_summary = {}
    for condition, data in MEDICAL_DATA.items():
        conditions_summary[condition] = {
            "severity": data["severity"],
            "symptom_count": len(data["symptoms"]),
            "key_symptoms": data.get("key_symptoms", [])[:3]
        }
    
    return jsonify({
        "conditions": conditions_summary,
        "total": len(conditions_summary)
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting Enhanced Medical Assistant API v3.1 on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)