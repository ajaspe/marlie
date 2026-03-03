// ai_service.js

class AIService {
	constructor() {
		this.apiKeyKey = "gemini_api_key";
		this.apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
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

	async analyzeImage(imagesArray, prompt, model = "models/gemini-3.1-flash-image-preview", pdfUriArray = []) {
		const key = this.getApiKey();
		if (!key) {
			throw new Error("API Key is missing.");
		}

		const parts = [
			{ text: prompt }
		];

		// Append all provided base64 structural images dynamically
		for (const imgBase64 of imagesArray) {
			if (imgBase64) {
				const base64Data = imgBase64.split(',')[1];
				parts.push({
					inline_data: {
						mime_type: "image/png",
						data: base64Data
					}
				});
			}
		}

		// Append PDF corpus references if any
		pdfUriArray.forEach(uri => {
			parts.push({
				file_data: {
					mime_type: "application/pdf",
					file_uri: uri
				}
			});
		});

		const payload = {
			contents: [{ parts }],
			generationConfig: {
				responseMimeType: "application/json"
			}
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

			return {
				text: data.candidates[0].content.parts[0].text,
				usage: data.usageMetadata
			};
		} catch (error) {
			console.error("Gemini API Error:", error);
			throw error;
		}
	}
}
