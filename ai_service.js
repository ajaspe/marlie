// ai_service.js

class AIService {
    constructor() {
        this.apiKeyKey = "gemini_api_key";
        this.apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
    }

    getApiKey() {
        return localStorage.getItem(this.apiKeyKey);
    }

    saveApiKey(key) {
        localStorage.setItem(this.apiKeyKey, key);
    }

    hasApiKey() {
        return !!this.getApiKey();
    }

    removeApiKey() {
        localStorage.removeItem(this.apiKeyKey);
    }

    async getModels() {
        const key = this.getApiKey();
        if (!key) return [];

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (!response.ok) return [];
            const data = await response.json();
            return data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")).map(m => m.name);
        } catch (e) {
            console.error("Error fetching models:", e);
            return [];
        }
    }

    async analyzeImage(imageDataBase64, prompt, model = "models/gemini-1.5-flash") {
        const key = this.getApiKey();
        if (!key) {
            throw new Error("API Key is missing.");
        }

        // Remove header if present (data:image/png;base64,)
        const base64Data = imageDataBase64.split(',')[1];

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: "image/png",
                            data: base64Data
                        }
                    }
                ]
            }]
        };

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || "Unknown API Error");
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error("Gemini API Error:", error);
            throw error;
        }
    }
}
