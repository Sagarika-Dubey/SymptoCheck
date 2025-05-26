// Medical Assistant Frontend JavaScript

class MedicalAssistant {
    constructor() {
        this.symptoms = [];
        this.medicalHistory = [];
        this.apiBaseUrl = 'http://192.168.0.227:5000'; // Change this to your backend URL
        
        this.initializeEventListeners();
        this.checkApiConnection();
    }

    // Initialize all event listeners
    initializeEventListeners() {
        // Symptom input handlers
        document.getElementById('add-symptom-btn').addEventListener('click', () => this.addSymptom());
        document.getElementById('symptom-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addSymptom();
        });

        // Common symptom tags
        document.querySelectorAll('.symptom-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                const symptom = tag.getAttribute('data-symptom');
                this.addSymptomToList(symptom);
            });
        });

        // Medical history handlers
        document.getElementById('add-history-btn').addEventListener('click', () => this.addMedicalHistory());
        document.getElementById('history-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addMedicalHistory();
        });

        // Analyze button
        document.getElementById('analyze-btn').addEventListener('click', () => this.analyzeSymptoms());

        // Emergency modal close
        document.getElementById('emergency-close').addEventListener('click', () => this.closeEmergencyModal());

        // Modal backdrop click to close
        document.getElementById('emergency-modal').addEventListener('click', (e) => {
            if (e.target.id === 'emergency-modal') this.closeEmergencyModal();
        });
    }

    // Check API connection
    async checkApiConnection() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health-check`);
            if (response.ok) {
                console.log('API connection successful');
            } else {
                this.showConnectionError();
            }
        } catch (error) {
            console.error('API connection failed:', error);
            this.showConnectionError();
        }
    }

    // Show connection error
    showConnectionError() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-warning';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Connection Issue:</strong> Unable to connect to the medical analysis service. 
            Please ensure the backend server is running on ${this.apiBaseUrl}
        `;
        errorDiv.style.cssText = `
            background: #fff3cd;
            color: #856404;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 5px solid #ffc107;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(errorDiv, mainContent.firstChild);
    }

    // Add symptom from input field
    addSymptom() {
        const input = document.getElementById('symptom-input');
        const symptom = input.value.trim();
        
        if (symptom) {
            this.addSymptomToList(symptom);
            input.value = '';
        }
    }

    // Add symptom to the list
    addSymptomToList(symptom) {
        // Prevent duplicates
        if (this.symptoms.includes(symptom.toLowerCase())) {
            this.showToast('Symptom already added', 'warning');
            return;
        }

        // Validate symptom length
        if (symptom.length > 100) {
            this.showToast('Symptom description too long', 'error');
            return;
        }

        this.symptoms.push(symptom.toLowerCase());
        this.updateSymptomsDisplay();
        this.showToast('Symptom added successfully', 'success');
    }

    // Update symptoms display
    updateSymptomsDisplay() {
        const container = document.getElementById('symptoms-list');
        
        if (this.symptoms.length === 0) {
            container.innerHTML = '<p style="color: #6c757d; font-style: italic;">No symptoms added yet. Add symptoms above to get started.</p>';
            return;
        }

        container.innerHTML = this.symptoms.map((symptom, index) => `
            <div class="symptom-item">
                <span>${this.capitalizeFirst(symptom)}</span>
                <button class="remove-btn" onclick="medicalAssistant.removeSymptom(${index})" title="Remove symptom">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    // Remove symptom
    removeSymptom(index) {
        this.symptoms.splice(index, 1);
        this.updateSymptomsDisplay();
        this.showToast('Symptom removed', 'info');
    }

    // Add medical history
    addMedicalHistory() {
        const input = document.getElementById('history-input');
        const history = input.value.trim();
        
        if (history) {
            // Prevent duplicates
            if (this.medicalHistory.includes(history.toLowerCase())) {
                this.showToast('Medical history item already added', 'warning');
                return;
            }

            this.medicalHistory.push(history.toLowerCase());
            this.updateMedicalHistoryDisplay();
            input.value = '';
            this.showToast('Medical history added', 'success');
        }
    }

    // Update medical history display
    updateMedicalHistoryDisplay() {
        const container = document.getElementById('history-list');
        
        if (this.medicalHistory.length === 0) {
            container.innerHTML = '<p style="color: #6c757d; font-style: italic;">No medical history added.</p>';
            return;
        }

        container.innerHTML = this.medicalHistory.map((item, index) => `
            <div class="history-item">
                <span>${this.capitalizeFirst(item)}</span>
                <button class="remove-btn" onclick="medicalAssistant.removeMedicalHistory(${index})" title="Remove item">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    // Remove medical history item
    removeMedicalHistory(index) {
        this.medicalHistory.splice(index, 1);
        this.updateMedicalHistoryDisplay();
        this.showToast('Medical history item removed', 'info');
    }

    // Analyze symptoms
    async analyzeSymptoms() {
        // Validation
        if (this.symptoms.length === 0) {
            this.showToast('Please add at least one symptom', 'error');
            return;
        }

        const age = document.getElementById('age').value;
        const gender = document.getElementById('gender').value;

        // Prepare request data
        const requestData = {
            symptoms: this.symptoms,
            age: age ? parseInt(age) : null,
            gender: gender || null,
            medical_history: this.medicalHistory,
            current_medications: [],
            allergies: []
        };

        // Show loading
        this.showLoading(true);
        this.hideResults();

        try {
            const response = await fetch(`${this.apiBaseUrl}/diagnose`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const results = await response.json();
            this.displayResults(results);

            // Check for emergency conditions
            if (results.urgency_level === 'EMERGENCY') {
                this.showEmergencyModal(results.immediate_action);
            }

        } catch (error) {
            console.error('Analysis error:', error);
            this.showError('Unable to analyze symptoms. Please check your connection and try again.');
        } finally {
            this.showLoading(false);
        }
    }

    // Show/hide loading indicator
    showLoading(show) {
        const loading = document.getElementById('loading');
        const analyzeBtn = document.getElementById('analyze-btn');
        
        if (show) {
            loading.classList.remove('hidden');
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        } else {
            loading.classList.add('hidden');
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search"></i> Analyze Symptoms';
        }
    }

    // Hide results section
    hideResults() {
        document.getElementById('results-section').classList.add('hidden');
    }

    // Display analysis results
    displayResults(results) {
        const resultsSection = document.getElementById('results-section');
        const resultsContent = document.getElementById('results-content');
        
        // Check if we have diagnoses
        if (!results.diagnoses || results.diagnoses.length === 0) {
            resultsContent.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-info-circle" style="font-size: 3rem; color: #6c757d; margin-bottom: 20px;"></i>
                    <h3>No Specific Conditions Identified</h3>
                    <p>${results.message || 'Unable to match symptoms to specific conditions.'}</p>
                    <div class="recommendation">
                        <h4>Recommendation:</h4>
                        <p>${results.recommendation || 'Consider consulting a healthcare provider for proper evaluation.'}</p>
                    </div>
                </div>
            `;
            resultsSection.classList.remove('hidden');
            resultsSection.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        let html = '';

        // Add urgency alert if needed
        if (results.urgency_level && results.urgency_level !== 'LOW') {
            const urgencyColors = {
                'EMERGENCY': '#dc3545',
                'URGENT': '#fd7e14',
                'MODERATE': '#ffc107'
            };
            
            html += `
                <div class="urgency-alert" style="background: linear-gradient(45deg, ${urgencyColors[results.urgency_level]}, ${urgencyColors[results.urgency_level]}dd);">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Urgency Level: ${results.urgency_level}</h3>
                    <p><strong>${results.immediate_action}</strong></p>
                </div>
            `;
        }

        // Add analysis metadata
        html += `
            <div class="analysis-meta">
                <p><strong>Analysis Date:</strong> ${new Date(results.timestamp).toLocaleString()}</p>
                <p><strong>Conditions Evaluated:</strong> ${results.total_matches}</p>
                <p><strong>Input Symptoms:</strong> ${results.input_symptoms.join(', ')}</p>
            </div>
        `;

        // Add diagnosis cards
        results.diagnoses.forEach((diagnosis, index) => {
            html += this.createDiagnosisCard(diagnosis, index + 1);
        });

        // Add AI analysis if available
        if (results.ai_analysis) {
            html += `
                <div class="ai-analysis">
                    <h3><i class="fas fa-robot"></i> AI Clinical Analysis</h3>
                    <div class="ai-content">
                        ${this.formatAIAnalysis(results.ai_analysis)}
                    </div>
                </div>
            `;
        }

        // Add disclaimer
        html += `
            <div class="results-disclaimer">
                <i class="fas fa-exclamation-circle"></i>
                <strong>Important:</strong> ${results.disclaimer}
            </div>
        `;

        resultsContent.innerHTML = html;
        resultsSection.classList.remove('hidden');
        resultsSection.classList.add('fade-in');
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Create diagnosis card HTML
    createDiagnosisCard(diagnosis, rank) {
        const confidenceClass = `confidence-${diagnosis.confidence_level.toLowerCase().replace(' ', '-')}`;
        const severityClass = `severity-${diagnosis.severity.toLowerCase()}`;
        
        return `
            <div class="diagnosis-card">
                <div class="diagnosis-header">
                    <div>
                        <span class="diagnosis-title">#${rank} ${diagnosis.condition}</span>
                        <span class="severity-badge ${severityClass}">${diagnosis.severity}</span>
                    </div>
                    <div>
                        <span class="confidence-badge ${confidenceClass}">
                            ${diagnosis.confidence_percentage} ${diagnosis.confidence_level}
                        </span>
                    </div>
                </div>
                
                <div class="diagnosis-details">
                    <div class="detail-section">
                        <h4><i class="fas fa-check-circle"></i> Matched Symptoms</h4>
                        <ul>
                            ${diagnosis.matched_symptoms.map(symptom => `<li>${this.capitalizeFirst(symptom)}</li>`).join('')}
                        </ul>
                    </div>
                    
                    ${diagnosis.key_indicators && diagnosis.key_indicators.length > 0 ? `
                        <div class="detail-section">
                            <h4><i class="fas fa-star"></i> Key Indicators</h4>
                            <ul>
                                ${diagnosis.key_indicators.map(indicator => `<li>${this.capitalizeFirst(indicator)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div class="detail-section">
                        <h4><i class="fas fa-clipboard-list"></i> Recommended Action</h4>
                        <p>${diagnosis.recommended_action}</p>
                    </div>
                    
                    <div class="detail-section">
                        <h4><i class="fas fa-info-circle"></i> Additional Information</h4>
                        <p>${diagnosis.additional_info}</p>
                    </div>
                    
                    ${diagnosis.risk_factors && diagnosis.risk_factors.length > 0 ? `
                        <div class="detail-section">
                            <h4><i class="fas fa-exclamation-triangle"></i> Risk Factors</h4>
                            <ul>
                                ${diagnosis.risk_factors.map(factor => `<li>${this.capitalizeFirst(factor)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Format AI analysis text
    formatAIAnalysis(text) {
        // Convert numbered lists and paragraphs to HTML
        return text
            .split('\n\n')
            .map(paragraph => {
                if (paragraph.match(/^\d+\./)) {
                    // Handle numbered lists
                    const items = paragraph.split(/\d+\./).filter(item => item.trim());
                    return `<ol>${items.map(item => `<li>${item.trim()}</li>`).join('')}</ol>`;
                } else if (paragraph.includes('**')) {
                    // Handle bold text
                    return `<p>${paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
                } else {
                    return `<p>${paragraph}</p>`;
                }
            })
            .join('');
    }

    // Show emergency modal
    showEmergencyModal(message) {
        const modal = document.getElementById('emergency-modal');
        const messageElement = document.getElementById('emergency-message');
        
        messageElement.textContent = message;
        modal.classList.remove('hidden');
        
        // Auto-focus on close button for accessibility
        setTimeout(() => {
            document.getElementById('emergency-close').focus();
        }, 100);
    }

    // Close emergency modal
    closeEmergencyModal() {
        document.getElementById('emergency-modal').classList.add('hidden');
    }

    // Show error message
    showError(message) {
        const resultsSection = document.getElementById('results-section');
        const resultsContent = document.getElementById('results-content');
        
        resultsContent.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc3545; margin-bottom: 20px;"></i>
                <h3>Analysis Failed</h3>
                <p>${message}</p>
                <div class="error-actions">
                    <button onclick="location.reload()" class="btn-secondary">
                        <i class="fas fa-refresh"></i> Refresh Page
                    </button>
                </div>
            </div>
        `;
        
        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Show toast notification
    showToast(message, type = 'info') {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        
        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 1001;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9rem;
            max-width: 300px;
            animation: slideInRight 0.3s ease;
        `;
        
        toast.innerHTML = `
            <i class="fas fa-${icons[type]}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
        
        // Add CSS for animations if not already present
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Utility function to capitalize first letter
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Reset form
    resetForm() {
        this.symptoms = [];
        this.medicalHistory = [];
        
        document.getElementById('age').value = '';
        document.getElementById('gender').value = '';
        document.getElementById('symptom-input').value = '';
        document.getElementById('history-input').value = '';
        
        this.updateSymptomsDisplay();
        this.updateMedicalHistoryDisplay();
        this.hideResults();
        
        this.showToast('Form reset successfully', 'info');
    }

    // Export results as text
    exportResults() {
        const resultsContent = document.getElementById('results-content');
        if (!resultsContent || resultsContent.innerHTML.trim() === '') {
            this.showToast('No results to export', 'warning');
            return;
        }
        
        // Extract text content from results
        const textContent = resultsContent.innerText;
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `medical-analysis-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('Results exported successfully', 'success');
    }
}

// Initialize the medical assistant when DOM is loaded
let medicalAssistant;

document.addEventListener('DOMContentLoaded', function() {
    medicalAssistant = new MedicalAssistant();
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to analyze
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            medicalAssistant.analyzeSymptoms();
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            medicalAssistant.closeEmergencyModal();
        }
    });
    
    // Add export and reset buttons if needed
    const analyzeSection = document.querySelector('.analyze-section');
    if (analyzeSection) {
        const additionalButtons = document.createElement('div');
        additionalButtons.style.marginTop = '20px';
        additionalButtons.innerHTML = `
            <button onclick="medicalAssistant.resetForm()" class="btn-secondary" style="margin-right: 10px;">
                <i class="fas fa-undo"></i> Reset Form
            </button>
            <button onclick="medicalAssistant.exportResults()" class="btn-secondary">
                <i class="fas fa-download"></i> Export Results
            </button>
        `;
        analyzeSection.appendChild(additionalButtons);
    }
});

// Handle page visibility for better UX
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        // Re-check API connection when page becomes visible
        if (medicalAssistant) {
            medicalAssistant.checkApiConnection();
        }
    }
});

// Service Worker registration for offline functionality (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed');
            });
    });
}