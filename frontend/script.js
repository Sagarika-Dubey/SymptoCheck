// Enhanced AI Medical Assistant JavaScript
class MedicalAssistant {
    constructor() {
        this.apiUrl = 'http://127.0.0.1:5000'; // Update with your backend URL
        this.currentSymptoms = [];
        this.currentHistory = [];
        this.currentTab = 'chatbot';
        this.conversationHistory = [];
        this.confidenceChart = null;
        this.isFirstMessage = true;
        this.isAnalyzing = false;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.isAnalyzing = false;
        this.isFirstMessage = true;
        document.getElementById('chatInput').value = ''; // Clear autofill
        this.initializeChat();
        this.hideLoading(); 
        

    }
    
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Chat functionality
        document.getElementById('sendMessage').addEventListener('click', () => {
            this.sendChatMessage();
        });
        
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // Quick symptom buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // prevent unintended submit
                const symptom = e.target.dataset.symptom;
                if (!symptom || symptom.length < 3) return;
        
                const input = document.getElementById('chatInput');
                input.value = symptom;
        
                // Manually focus and require explicit action
                input.focus();
                setTimeout(() => this.sendChatMessage(), 100); // Optional slight delay
            });
        });
        
        
        
        
        // Diagnosis form
        document.getElementById('addSymptom').addEventListener('click', () => {
            this.addSymptom();
        });
        
        document.getElementById('symptomInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addSymptom();
            }
        });
        
        document.getElementById('addHistory').addEventListener('click', () => {
            this.addHistory();
        });
        
        document.getElementById('historyInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addHistory();
            }
        });
        
        document.getElementById('diagnosisForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitDiagnosis();
        });
        
        // Prescription form
        document.getElementById('prescriptionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generatePrescription();
        });
    }
    
    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        this.currentTab = tabName;
    }
    
    initializeChat() {
        const chatMessages = document.getElementById('chatMessages');
        // Clear any existing messages
        chatMessages.innerHTML = '';
        
        // Reset state
        this.isAnalyzing = false;
        this.isFirstMessage = true;
        
        // Add only the welcome message
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'message bot-message';
        welcomeMessage.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <p>Hello! I'm your AI medical assistant. I can help you understand your symptoms and provide health guidance. Please describe what you're experiencing.</p>
                <small class="timestamp">${this.getCurrentTimestamp()}</small>
                <small class="disclaimer">Please note: This is for informational purposes only and doesn't replace professional medical advice.</small>
            </div>
        `;
        chatMessages.appendChild(welcomeMessage);
        this.scrollChatToBottom();
    }
    
    getCurrentTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        console.log('sendChatMessage() CALLED with:', message);

        if (this.isAnalyzing || !message || message.length < 3 || message === input.placeholder) {
            console.log("sendChatMessage blocked: ", { isAnalyzing: this.isAnalyzing, message });
            return;
        }
    
        this.isAnalyzing = true;

        // 🔒 Protect against empty or autofill triggering
        if (!message || message === input.placeholder) return;

        
        // Set analyzing state BEFORE adding user message
        this.isAnalyzing = true;
        
        // Add user message to chat
        this.addChatMessage(message, 'user');
        input.value = '';
        
        // Add typing indicator
        const typingId = this.addTypingIndicator();
        
        try {
            // Process with AI chatbot
            const response = await this.processWithAIChatbot(message);
            
            // Remove typing indicator
            if (typingId) {
                this.removeTypingIndicator(typingId);
            }
            
            // Add bot response
            this.addChatMessage(response.message, 'bot');
            
            // Check for emergency situations
            if (response.urgency === 'EMERGENCY') {
                this.showEmergencyAlert(response.emergency_message);
            }
            
            // If diagnosis is available, show it
            if (response.diagnosis) {
                this.displayChatDiagnosis(response.diagnosis);
            }
            
        } catch (error) {
            // Remove typing indicator on error
            if (typingId) {
                this.removeTypingIndicator(typingId);
            }
            this.addChatMessage("I'm sorry, I'm having trouble processing your request right now. Please try again or consult a healthcare professional if this is urgent.", 'bot');
        } finally {
            this.isAnalyzing = false;
        }
    }
    
    async processWithAIChatbot(message) {
        // Extract symptoms from the message using simple NLP
        const symptoms = this.extractSymptomsFromText(message);
        
        if (symptoms.length > 0) {
            // If symptoms are detected, get medical analysis
            try {
                const diagnosisData = {
                    symptoms: symptoms,
                    age: null,
                    gender: null,
                    medical_history: [],
                    current_medications: [],
                    allergies: []
                };
                
                const response = await fetch(`${this.apiUrl}/diagnose`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(diagnosisData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    return this.formatChatbotResponse(message, result);
                }
            } catch (error) {
                console.error('Diagnosis API error:', error);
            }
        }
        
        // If no symptoms or API error, use rule-based responses
        return this.generateRuleBasedResponse(message);
    }
    
    extractSymptomsFromText(text) {
        const commonSymptoms = [
            'headache', 'fever', 'cough', 'sore throat', 'runny nose', 'congestion',
            'chest pain', 'shortness of breath', 'dizziness', 'nausea', 'vomiting',
            'diarrhea', 'fatigue', 'weakness', 'pain', 'ache', 'burning', 'itching',
            'swelling', 'rash', 'bleeding', 'difficulty breathing', 'wheezing'
        ];
        
        const lowerText = text.toLowerCase();
        const foundSymptoms = [];
        
        commonSymptoms.forEach(symptom => {
            if (lowerText.includes(symptom)) {
                foundSymptoms.push(symptom);
            }
        });
        
        // Check for common symptom patterns
        if (lowerText.includes('head') && (lowerText.includes('hurt') || lowerText.includes('pain'))) {
            foundSymptoms.push('headache');
        }
        if (lowerText.includes('throat') && lowerText.includes('hurt')) {
            foundSymptoms.push('sore throat');
        }
        if (lowerText.includes('nose') && lowerText.includes('run')) {
            foundSymptoms.push('runny nose');
        }
        
        return [...new Set(foundSymptoms)]; // Remove duplicates
    }
    
    formatChatbotResponse(userMessage, diagnosisResult) {
        if (!diagnosisResult.diagnoses || diagnosisResult.diagnoses.length === 0) {
            return {
                message: "I understand you're experiencing some symptoms. Based on what you've told me, I'd recommend monitoring your symptoms and consulting a healthcare professional if they persist or worsen.",
                urgency: "LOW"
            };
        }
        
        const topDiagnosis = diagnosisResult.diagnoses[0];
        let response = `Based on your symptoms, here's what I found:\n\n`;
        response += `**Most likely condition:** ${topDiagnosis.condition}\n`;
        response += `**Confidence:** ${topDiagnosis.confidence_level}\n\n`;
        response += `**Recommended action:** ${topDiagnosis.recommended_action}\n\n`;
        
        if (topDiagnosis.severity === 'CRITICAL') {
            response += `⚠️ **This appears to be a medical emergency. Please seek immediate medical attention.**`;
        }
        
        response += `\n\n*Remember: This is for informational purposes only. Always consult with a healthcare professional for proper medical advice.*`;
        
        return {
            message: response,
            urgency: diagnosisResult.urgency_level,
            emergency_message: diagnosisResult.immediate_action,
            diagnosis: diagnosisResult
        };
    }
    
    generateRuleBasedResponse(message) {
        const lowerMessage = message.toLowerCase();
        
        // Emergency keywords
        const emergencyKeywords = ['emergency', 'call 911', 'chest pain', 'can\'t breathe', 'unconscious', 'severe pain'];
        if (emergencyKeywords.some(keyword => lowerMessage.includes(keyword))) {
            return {
                message: "This sounds like it could be a medical emergency. Please call 911 or go to the nearest emergency room immediately.",
                urgency: "EMERGENCY",
                emergency_message: "Seek immediate emergency medical care"
            };
        }
        
        // Common health queries
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
            return {
                message: "Hello! I'm here to help you with your health concerns. Please tell me about any symptoms you're experiencing, and I'll do my best to provide helpful information.",
                urgency: "LOW"
            };
        }
        
        if (lowerMessage.includes('thank')) {
            return {
                message: "You're welcome! Remember, if your symptoms worsen or you're concerned, don't hesitate to contact a healthcare professional. Is there anything else I can help you with?",
                urgency: "LOW"
            };
        }
        
        if (lowerMessage.includes('medication') || lowerMessage.includes('medicine')) {
            return {
                message: "I can provide general information about over-the-counter remedies, but I cannot prescribe medications. For prescription medications, please consult with a licensed healthcare provider. Would you like some general wellness recommendations instead?",
                urgency: "LOW"
            };
        }
        
        // Check if it's a general greeting or first interaction
        if (this.isFirstMessage || lowerMessage.includes('how are you') || lowerMessage.includes('good morning') || lowerMessage.includes('good afternoon')) {
            this.isFirstMessage = false;
            return {
                message: "I'm doing well, thank you for asking! I'm here to help you with any health-related questions or concerns you might have. How can I assist you today?",
                urgency: "LOW"
            };
        }
        
        // Default response
        return {
            message: "I understand you have a health concern. Could you please describe your specific symptoms? For example, you could say 'I have a headache and fever' or 'I'm feeling dizzy and nauseous'. The more specific you are, the better I can help!",
            urgency: "LOW"
        };
    }
    
    addChatMessage(message, sender) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        // Convert markdown-like formatting to HTML
        const formattedMessage = message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
        
        content.innerHTML = `
            <p>${formattedMessage}</p>
            <small class="timestamp">${this.getCurrentTimestamp()}</small>
        `;
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        
        chatMessages.appendChild(messageDiv);
        this.scrollChatToBottom();
        
        // Store conversation history
        this.conversationHistory.push({
            sender: sender,
            message: message,
            timestamp: new Date().toISOString()
        });
    }
    
    addTypingIndicator() {
        const chatMessages = document.getElementById('chatMessages');
        const typingDiv = document.createElement('div');
        const typingId = 'typing-' + Date.now();
        typingDiv.id = typingId;
        typingDiv.className = 'message bot-message typing-message';
        
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <p>Analyzing your symptoms...</p>
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        
        chatMessages.appendChild(typingDiv);
        this.scrollChatToBottom();
        
        return typingId;
    }
    
    removeTypingIndicator(typingId) {
        if (typingId) {
            const typingElement = document.getElementById(typingId);
            if (typingElement) {
                typingElement.remove();
            }
        }
    }
    
    displayChatDiagnosis(diagnosis) {
        if (diagnosis.diagnoses && diagnosis.diagnoses.length > 0) {
            let diagnosisMessage = "Here's a more detailed analysis:\n\n";
            
            diagnosis.diagnoses.slice(0, 3).forEach((d, index) => {
                diagnosisMessage += `${index + 1}. **${d.condition}** (${d.confidence_percentage})\n`;
                diagnosisMessage += `   Action: ${d.recommended_action}\n\n`;
            });
            
            this.addChatMessage(diagnosisMessage, 'bot');
        }
    }
    
    scrollChatToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Diagnosis Form Functions
    addSymptom() {
        const input = document.getElementById('symptomInput');
        const symptom = input.value.trim();
        
        if (symptom && !this.currentSymptoms.includes(symptom.toLowerCase())) {
            this.currentSymptoms.push(symptom.toLowerCase());
            this.displaySymptomTag(symptom);
            input.value = '';
        }
    }
    
    displaySymptomTag(symptom) {
        const container = document.getElementById('symptomsList');
        const tag = document.createElement('div');
        tag.className = 'symptom-tag';
        tag.innerHTML = `
            ${symptom}
            <button type="button" class="remove-tag" onclick="medicalAssistant.removeSymptom('${symptom.toLowerCase()}')">
                ×
            </button>
        `;
        container.appendChild(tag);
    }
    
    removeSymptom(symptom) {
        this.currentSymptoms = this.currentSymptoms.filter(s => s !== symptom);
        this.refreshSymptomDisplay();
    }
    
    refreshSymptomDisplay() {
        const container = document.getElementById('symptomsList');
        container.innerHTML = '';
        this.currentSymptoms.forEach(symptom => {
            this.displaySymptomTag(symptom);
        });
    }
    
    addHistory() {
        const input = document.getElementById('historyInput');
        const history = input.value.trim();
        
        if (history && !this.currentHistory.includes(history.toLowerCase())) {
            this.currentHistory.push(history.toLowerCase());
            this.displayHistoryTag(history);
            input.value = '';
        }
    }
    
    displayHistoryTag(history) {
        const container = document.getElementById('historyList');
        const tag = document.createElement('div');
        tag.className = 'history-tag';
        tag.innerHTML = `
            ${history}
            <button type="button" class="remove-tag" onclick="medicalAssistant.removeHistory('${history.toLowerCase()}')">
                ×
            </button>
        `;
        container.appendChild(tag);
    }
    
    removeHistory(history) {
        this.currentHistory = this.currentHistory.filter(h => h !== history);
        this.refreshHistoryDisplay();
    }
    
    refreshHistoryDisplay() {
        const container = document.getElementById('historyList');
        container.innerHTML = '';
        this.currentHistory.forEach(history => {
            this.displayHistoryTag(history);
        });
    }
    
    async submitDiagnosis() {
        console.log("🔁 submitDiagnosis called. currentSymptoms:", this.currentSymptoms);
        const hasValidSymptoms = this.currentSymptoms && this.currentSymptoms.length > 0;

        if (!hasValidSymptoms) {
            console.warn("Diagnosis blocked: No symptoms provided.");
            this.hideLoading(); // just in case modal was triggered
            return;
        }

        if (!this.currentSymptoms || this.currentSymptoms.length === 0) {
            alert('Please add at least one symptom before submitting.');
            this.hideLoading();
            return;
        }
        
        this.showLoading();
        
        const diagnosisData = {
            symptoms: this.currentSymptoms,
            age: parseInt(document.getElementById('age').value) || null,
            gender: document.getElementById('gender').value || null,
            medical_history: this.currentHistory,
            current_medications: [],
            allergies: []
        };
        
        try {
            const response = await fetch(`${this.apiUrl}/diagnose`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(diagnosisData)
            });
            
            if (response.ok) {
                const result = await response.json();
                this.displayDiagnosisResults(result);
                this.generateXAIExplanation(result);
                
                // Check for emergency situations
                if (result.urgency_level === 'EMERGENCY') {
                    this.showEmergencyAlert(result.immediate_action);
                }
            } else {
                throw new Error('Failed to get diagnosis');
            }
        } catch (error) {
            console.error('Diagnosis error:', error);
            // Fallback to mock diagnosis for demo purposes
            this.displayMockDiagnosis();
        } finally {
            this.hideLoading();
        }
    }
    
    displayMockDiagnosis() {
        const mockResult = {
            urgency_level: 'MODERATE',
            immediate_action: 'Monitor symptoms and consider seeing a healthcare provider if they worsen',
            diagnoses: [
                {
                    condition: 'Common Cold',
                    confidence_percentage: '75%',
                    confidence_level: 'High',
                    severity: 'mild',
                    matched_symptoms: this.currentSymptoms.slice(0, 3),
                    recommended_action: 'Rest, stay hydrated, and monitor symptoms',
                    additional_info: 'Symptoms typically resolve within 7-10 days',
                    risk_factors: ['Seasonal changes', 'Close contact with others']
                }
            ],
            ai_analysis: 'Based on the symptoms provided, this appears to be a common viral infection. Rest and supportive care are recommended.'
        };
        
        this.displayDiagnosisResults(mockResult);
        this.generateXAIExplanation(mockResult);
    }
    
    displayDiagnosisResults(result) {
        const resultsSection = document.getElementById('diagnosisResults');
        const resultsContent = document.getElementById('resultsContent');
        
        if (!result.diagnoses || result.diagnoses.length === 0) {
            resultsContent.innerHTML = '<p>No specific conditions could be identified based on your symptoms. Please consult a healthcare professional for proper evaluation.</p>';
            resultsSection.classList.remove('hidden');
            return;
        }
        
        let html = `
            <div class="urgency-banner ${result.urgency_level.toLowerCase()}">
                <strong>Urgency Level: ${result.urgency_level}</strong>
                <p>${result.immediate_action}</p>
            </div>
        `;
        
        result.diagnoses.forEach((diagnosis, index) => {
            const severity = diagnosis.severity.toLowerCase();
            html += `
                <div class="diagnosis-result ${severity}">
                    <div class="result-header">
                        <h4 class="result-title">${index + 1}. ${diagnosis.condition}</h4>
                        <span class="confidence-badge ${severity}">${diagnosis.confidence_percentage}</span>
                    </div>
                    <div class="result-details">
                        <div class="detail-item">
                            <i class="fas fa-check-circle"></i>
                            <div>
                                <strong>Matched Symptoms:</strong>
                                ${diagnosis.matched_symptoms.join(', ')}
                            </div>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-exclamation-circle"></i>
                            <div>
                                <strong>Recommended Action:</strong>
                                ${diagnosis.recommended_action}
                            </div>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-info-circle"></i>
                            <div>
                                <strong>Additional Info:</strong>
                                ${diagnosis.additional_info}
                            </div>
                        </div>
                        ${diagnosis.risk_factors.length > 0 ? `
                        <div class="detail-item">
                            <i class="fas fa-warning"></i>
                            <div>
                                <strong>Risk Factors:</strong>
                                ${diagnosis.risk_factors.join(', ')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        if (result.ai_analysis) {
            html += `
                <div class="ai-analysis">
                    <h4><i class="fas fa-brain"></i> AI Analysis</h4>
                    <div class="ai-content">
                        ${result.ai_analysis.replace(/\n/g, '<br>')}
                    </div>
                </div>
            `;
        }
        
        resultsContent.innerHTML = html;
        resultsSection.classList.remove('hidden');
        
        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    generateXAIExplanation(result) {
        if (!result.diagnoses || result.diagnoses.length === 0) return;
        
        const xaiSection = document.getElementById('xaiSection');
        const xaiFactors = document.getElementById('xaiFactors');
        const topDiagnosis = result.diagnoses[0];
        
        // Generate explanation factors
        const factors = [];
        
        // Symptom matching factors
        topDiagnosis.matched_symptoms.forEach(symptom => {
            factors.push({
                factor: `Presence of: ${symptom}`,
                impact: this.getSymptomImpact(symptom, topDiagnosis.condition),
                weight: this.getSymptomWeight(symptom)
            });
        });
        
        // Patient factors
        if (this.currentSymptoms) {
            factors.push({
                factor: `Number of symptoms (${this.currentSymptoms.length})`,
                impact: this.currentSymptoms.length > 3 ? 'high' : this.currentSymptoms.length > 1 ? 'medium' : 'low',
                weight: this.currentSymptoms.length * 10
            });
        }
        
        // Confidence factors
        factors.push({
            factor: `Symptom specificity`,
            impact: topDiagnosis.confidence_level === 'Very High' ? 'high' : 
                   topDiagnosis.confidence_level === 'High' ? 'medium' : 'low',
            weight: parseFloat(topDiagnosis.confidence_percentage.replace('%', ''))
        });
        
        // Display factors
        let factorsHtml = '';
        factors.forEach(factor => {
            factorsHtml += `
                <div class="factor-item ${factor.impact}-impact">
                    <span>${factor.factor}</span>
                    <span class="factor-weight ${factor.impact}">${factor.weight}%</span>
                </div>
            `;
        });
        
        xaiFactors.innerHTML = factorsHtml;
        
        // Create confidence chart
        this.createConfidenceChart(result.diagnoses);
        
        xaiSection.classList.remove('hidden');
    }
    
    createConfidenceChart(diagnoses) {
        const ctx = document.getElementById('confidenceChart').getContext('2d');
        
        if (this.confidenceChart) {
            this.confidenceChart.destroy();
        }
        
        const labels = diagnoses.slice(0, 5).map(d => d.condition);
        const data = diagnoses.slice(0, 5).map(d => parseFloat(d.confidence_percentage.replace('%', '')));
        const colors = ['#dc3545', '#fd7e14', '#ffc107', '#28a745', '#17a2b8'];
        
        this.confidenceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Confidence Level (%)',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Diagnosis Confidence Levels'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }
    
    getSymptomImpact(symptom, condition) {
        // Simple mapping for demo purposes
        const highImpactSymptoms = ['chest pain', 'difficulty breathing', 'severe pain'];
        const mediumImpactSymptoms = ['fever', 'headache', 'nausea'];
        
        if (highImpactSymptoms.includes(symptom.toLowerCase())) return 'high';
        if (mediumImpactSymptoms.includes(symptom.toLowerCase())) return 'medium';
        return 'low';
    }
    
    getSymptomWeight(symptom) {
        // Simple weight calculation for demo
        const weights = {
            'chest pain': 85,
            'difficulty breathing': 80,
            'fever': 70,
            'headache': 60,
            'nausea': 50,
            'cough': 40
        };
        
        return weights[symptom.toLowerCase()] || 30;
    }
    
    // Prescription/Recommendation Functions
    async generatePrescription() {
        const condition = document.getElementById('conditionSelect').value;
        const severity = document.getElementById('severity').value;
        const age = parseInt(document.getElementById('prescAge').value) || 25;
        const weight = parseInt(document.getElementById('weight').value) || 70;
        const allergies = document.getElementById('allergies').value.trim();
        
        if (!condition) {
            alert('Please select a condition first.');
            return;
        }
        
        if (severity === 'severe') {
            alert('For severe symptoms, please consult a healthcare professional immediately.');
            return;
        }
        
        this.showLoading();
        
        try {
            // Generate recommendations based on condition
            const recommendations = this.generateHealthRecommendations(condition, severity, age, weight, allergies);
            this.displayPrescriptionResults(recommendations);
        } catch (error) {
            console.error('Prescription generation error:', error);
            alert('Sorry, there was an error generating recommendations. Please try again.');
        } finally {
            this.hideLoading();
        }
    }
    
    generateHealthRecommendations(condition, severity, age, weight, allergies) {
        const recommendations = {
            condition: condition,
            severity: severity,
            timestamp: new Date().toLocaleString(),
            otc_medications: [],
            home_remedies: [],
            lifestyle_recommendations: [],
            warning_signs: [],
            followup_advice: ''
        };
        
        switch (condition.toLowerCase()) {
            case 'common cold':
                recommendations.otc_medications = [
                    'Acetaminophen (Tylenol) 500mg every 6 hours for fever or body aches',
  'Throat lozenges or sprays to ease sore throat',
  'Saline nasal spray or decongestants for nasal congestion'
                ];
                recommendations.home_remedies = [
                    'Get adequate rest and sleep',
  'Stay hydrated with warm fluids (e.g., tea, broth, honey water)',
  'Use a humidifier or steam inhalation for congestion relief',
  'Gargle with warm salt water to soothe sore throat'
                ];
                recommendations.lifestyle_recommendations = [
                    'Avoid close contact with others to reduce transmission',
  'Practice frequent handwashing',
  'Consume immune-supportive foods rich in Vitamin C and zinc'
                ];
                recommendations.warning_signs = [
                    'Fever over 101.5°F (38.6°C)',
                    'Shortness of breath or wheezing',
  'Chest pain or tightness',
                    'Symptoms lasting more than 10 days'
                ];
                recommendations.followup_advice = 'See a healthcare provider if symptoms worsen or persist beyond 10 days.';
                break;
                
            case 'tension headache':
                recommendations.otc_medications = [
                    'Ibuprofen (Advil) 400mg every 6-8 hours',
                    'Acetaminophen (Tylenol) 500mg every 6 hours',
                    'Avoid overuse - limit to 2-3 days per week'
                ];
                recommendations.home_remedies = [
                    'Apply cold or warm compress to head/neck',
                    'Practice relaxation techniques',
                    'Get adequate sleep (7-9 hours)',
                    'Stay hydrated',
                    'Gentle neck and shoulder stretches'
                ];
                recommendations.lifestyle_recommendations = [
                    'Identify and avoid triggers (stress, poor posture)',
                    'Regular exercise routine',
                    'Maintain consistent sleep schedule',
                    'Take breaks from screen time'
                ];
                recommendations.warning_signs = [
                    'Sudden severe headache',
                    'Headache with fever and stiff neck',
                    'Changes in vision',
                    'Headache after head injury'
                ];
                recommendations.followup_advice = 'Consult a healthcare provider if headaches become frequent or severe.';
                break;
                
            case 'migraine':
                recommendations.otc_medications = [
                    'Ibuprofen (Advil) 600mg at onset',
                    'Acetaminophen (Tylenol) 1000mg',
                    'Aspirin 900mg (if no allergy)',
                    'Take at first sign of migraine'
                ];
                recommendations.home_remedies = [
                    'Rest in dark, quiet room',
                    'Apply cold compress to forehead',
                    'Stay hydrated',
                    'Practice deep breathing',
                    'Gentle head/neck massage'
                ];
                recommendations.lifestyle_recommendations = [
                    'Identify migraine triggers',
                    'Maintain regular sleep schedule',
                    'Eat regular meals',
                    'Limit caffeine and alcohol',
                    'Manage stress levels'
                ];
                recommendations.warning_signs = [
                    'Migraine lasting more than 72 hours',
                    'Sudden change in migraine pattern',
                    'Migraine with fever',
                    'New neurological symptoms'
                ];
                recommendations.followup_advice = 'See a neurologist if migraines occur more than 4 times per month.';
                break;
                
            case 'urinary tract infection':
                recommendations.otc_medications = [
                    'Phenazopyridine (AZO) for pain relief',
                    'Ibuprofen for general discomfort',
                    'Note: Antibiotics required for treatment'
                ];
                recommendations.home_remedies = [
                    'Drink plenty of water',
                    'Cranberry juice (unsweetened)',
                    'Avoid irritants (caffeine, alcohol, spicy foods)',
                    'Use heating pad for pelvic pain',
                    'Practice good hygiene'
                ];
                recommendations.lifestyle_recommendations = [
                    'Urinate frequently, don\'t hold it',
                    'Wipe front to back',
                    'Urinate after sexual activity',
                    'Wear cotton underwear',
                    'Avoid tight-fitting clothes'
                ];
                recommendations.warning_signs = [
                    'Blood in urine',
                    'Fever and chills',
                    'Severe back pain',
                    'Nausea and vomiting'
                ];
                recommendations.followup_advice = 'UTIs require antibiotic treatment. See a healthcare provider within 24-48 hours.';
                break;
                
            case 'asthma attack':
                recommendations.otc_medications = [
                    'Use rescue inhaler as prescribed',
                    'Do not rely on OTC medications for asthma',
                    'Follow asthma action plan'
                ];
                recommendations.home_remedies = [
                    'Sit upright, stay calm',
                    'Take slow, steady breaths',
                    'Remove from triggers if possible',
                    'Drink warm liquids',
                    'Use prescribed breathing techniques'
                ];
                recommendations.lifestyle_recommendations = [
                    'Identify and avoid triggers',
                    'Keep rescue inhaler always available',
                    'Follow asthma action plan',
                    'Regular follow-up with doctor',
                    'Monitor peak flow if recommended'
                ];
                recommendations.warning_signs = [
                    'Difficulty speaking due to breathlessness',
                    'Blue lips or fingernails',
                    'Chest pain',
                    'Rescue inhaler not helping'
                ];
                recommendations.followup_advice = 'Seek immediate medical attention for severe asthma attacks. Regular monitoring required.';
                break;
                
            case 'general wellness':
                recommendations.otc_medications = [
                    'Multivitamin (if dietary gaps exist)',
                    'Vitamin D3 (if deficient)',
                    'Omega-3 supplements (consult healthcare provider)'
                ];
                recommendations.home_remedies = [
                    'Maintain balanced diet',
                    'Regular physical activity',
                    'Adequate sleep (7-9 hours)',
                    'Stress management techniques',
                    'Stay hydrated'
                ];
                recommendations.lifestyle_recommendations = [
                    'Regular health check-ups',
                    'Preventive screenings',
                    'Maintain healthy weight',
                    'Don\'t smoke, limit alcohol',
                    'Build strong social connections'
                ];
                recommendations.warning_signs = [
                    'Persistent fatigue',
                    'Unexplained weight changes',
                    'Persistent pain',
                    'Changes in mood or sleep patterns'
                ];
                recommendations.followup_advice = 'Schedule annual wellness visits and recommended screenings.';
                break;
                
            default:
                recommendations.otc_medications = ['Consult healthcare provider for specific recommendations'];
                recommendations.home_remedies = ['Rest, hydration, and monitoring symptoms'];
                recommendations.lifestyle_recommendations = ['Maintain healthy lifestyle habits'];
                recommendations.warning_signs = ['Any worsening or concerning symptoms'];
                recommendations.followup_advice = 'Consult a healthcare provider for proper evaluation.';
        }
        
        // Adjust recommendations based on severity
        if (severity === 'moderate') {
            recommendations.followup_advice = 'Consider seeing a healthcare provider sooner. ' + recommendations.followup_advice;
        }
        
        // Adjust for age considerations
        if (age < 18) {
            recommendations.otc_medications = recommendations.otc_medications.map(med => 
                med + ' (Pediatric dosing - consult pharmacist or healthcare provider)'
            );
        } else if (age > 65) {
            recommendations.otc_medications = recommendations.otc_medications.map(med => 
                med + ' (Senior dosing may differ - consult pharmacist)'
            );
        }
        
        // Add allergy warnings
        if (allergies) {
            recommendations.allergy_warning = `⚠️ Patient has allergies to: ${allergies}. Verify all medications are safe.`;
        }
        
        return recommendations;
    }
    
    displayPrescriptionResults(recommendations) {
        const resultsSection = document.getElementById('prescriptionResults');
        const contentDiv = document.getElementById('prescriptionContent');
        const dateSpan = document.getElementById('prescriptionDate');
        
        dateSpan.textContent = recommendations.timestamp;
        
        let html = `
            <div class="prescription-condition">
                <h4><i class="fas fa-diagnoses"></i> Condition: ${recommendations.condition}</h4>
                <span class="severity ${recommendations.severity}">${recommendations.severity.toUpperCase()}</span>
            </div>
        `;
        
        if (recommendations.allergy_warning) {
            html += `
                <div class="allergy-warning">
                    ${recommendations.allergy_warning}
                </div>
            `;
        }
        
        html += `
            <div class="recommendation-section">
                <h5><i class="fas fa-pills"></i> Over-the-Counter Medications</h5>
                <ul class="recommendation-list">
                    ${recommendations.otc_medications.map(med => `<li>${med}</li>`).join('')}
                </ul>
            </div>
            
            <div class="recommendation-section">
                <h5><i class="fas fa-home"></i> Home Remedies</h5>
                <ul class="recommendation-list">
                    ${recommendations.home_remedies.map(remedy => `<li>${remedy}</li>`).join('')}
                </ul>
            </div>
            
            <div class="recommendation-section">
                <h5><i class="fas fa-heartbeat"></i> Lifestyle Recommendations</h5>
                <ul class="recommendation-list">
                    ${recommendations.lifestyle_recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
            
            <div class="warning-section">
                <h5><i class="fas fa-exclamation-triangle"></i> Warning Signs - Seek Immediate Care</h5>
                <ul class="warning-list">
                    ${recommendations.warning_signs.map(sign => `<li>${sign}</li>`).join('')}
                </ul>
            </div>
            
            <div class="followup-section">
                <h5><i class="fas fa-user-md"></i> Follow-up Advice</h5>
                <p>${recommendations.followup_advice}</p>
            </div>
            
            <div class="disclaimer-section">
                <p><strong>Disclaimer:</strong> These recommendations are for educational purposes only and do not constitute medical advice. Always consult with a qualified healthcare professional before starting any treatment.</p>
            </div>
        `;
        
        contentDiv.innerHTML = html;
        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Utility Functions
    showLoading() {
        console.log("🔥 showLoading() CALLED from", new Error().stack);
        document.getElementById('loadingModal').classList.remove('hidden');
    }
    
    hideLoading() {
        console.log("🧊 hideLoading() called");
        document.getElementById('loadingModal').classList.add('hidden');
    }
    
    showEmergencyAlert(message) {
        const modal = document.getElementById('emergencyModal');
        const messageElement = document.getElementById('emergencyMessage');
        messageElement.textContent = message;
        modal.classList.remove('hidden');
        modal.classList.add('show');
    }
    
    closeEmergencyModal() {
        const modal = document.getElementById('emergencyModal');
        modal.classList.remove('show');
        modal.classList.add('hidden');
    }
    
    // Fix the initialization issue - make sure chat starts clean
    resetChat() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        this.conversationHistory = [];
        this.isFirstMessage = true;
        this.isAnalyzing = false;
        
        // Add welcome message
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'message bot-message';
        welcomeMessage.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <p>Hello! I'm your AI medical assistant. I can help you understand your symptoms and provide health guidance. Please describe what you're experiencing.</p>
                <small class="timestamp">${this.getCurrentTimestamp()}</small>
                <small class="disclaimer">Please note: This is for informational purposes only and doesn't replace professional medical advice.</small>
            </div>
        `;
        chatMessages.appendChild(welcomeMessage);
    }
    
    // Clear forms
    clearDiagnosisForm() {
        document.getElementById('diagnosisForm').reset();
        this.currentSymptoms = [];
        this.currentHistory = [];
        document.getElementById('symptomsList').innerHTML = '';
        document.getElementById('historyList').innerHTML = '';
        document.getElementById('diagnosisResults').classList.add('hidden');
        document.getElementById('xaiSection').classList.add('hidden');
    }
    
    clearPrescriptionForm() {
        document.getElementById('prescriptionForm').reset();
        document.getElementById('prescriptionResults').classList.add('hidden');
    }
    
    // Export conversation
    exportConversation() {
        const conversation = {
            timestamp: new Date().toISOString(),
            messages: this.conversationHistory,
            symptoms: this.currentSymptoms,
            medical_history: this.currentHistory
        };
        
        const dataStr = JSON.stringify(conversation, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `medical_conversation_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Create global instance
    window.medicalAssistant = new MedicalAssistant();
    
    // Add global functions for HTML onclick handlers
    window.closeEmergencyModal = function() {
        window.medicalAssistant.closeEmergencyModal();
    };
    
    window.showEmergencyModal = function(message) {
        window.medicalAssistant.showEmergencyAlert(message);
    };
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl+Enter to send message
        if (e.ctrlKey && e.key === 'Enter') {
            if (window.medicalAssistant.currentTab === 'chatbot') {
                window.medicalAssistant.sendChatMessage();
            }
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            window.medicalAssistant.hideLoading();
            window.medicalAssistant.closeEmergencyModal();
        }
    });
    
    // Add tab switching with keyboard
    document.addEventListener('keydown', function(e) {
        if (e.altKey) {
            switch(e.key) {
                case '1':
                    window.medicalAssistant.switchTab('chatbot');
                    break;
                case '2':
                    window.medicalAssistant.switchTab('diagnosis');
                    break;
                case '3':
                    window.medicalAssistant.switchTab('prescription');
                    break;
            }
        }
    });
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // Page is hidden - pause any ongoing operations
            window.medicalAssistant.isAnalyzing = false;
        }
    });
    
    console.log('AI Medical Assistant initialized successfully');
});