// DOM Elements
const elements = {
	apiKey: document.getElementById('apiKey'),
	corpusName: document.getElementById('corpusName'),
	dropArea: document.getElementById('dropArea'),
	fileInput: document.getElementById('pdfFiles'),
	fileList: document.getElementById('fileList'),
	uploadBtn: document.getElementById('uploadBtn'),
	logArea: document.getElementById('logArea')
};

// Application State
const state = {
	files: [], // Array of File objects
	apiKeyKey: 'gemini_api_key'
};

// Helper: Logging
function log(message, type = 'info') {
	const entry = document.createElement('div');
	entry.className = `log-entry log-${type}`;

	const time = new Date().toLocaleTimeString();
	entry.textContent = `[${time}] ${message}`;

	elements.logArea.appendChild(entry);
	elements.logArea.scrollTop = elements.logArea.scrollHeight; // Auto-scroll
}

// Initialization
function init() {
	// Load saved API Key
	const savedKey = localStorage.getItem(state.apiKeyKey);
	if (savedKey) {
		elements.apiKey.value = savedKey;
		log('Loaded saved API Key from localStorage.', 'success');
	} else {
		log('No saved API Key found. Please enter one.', 'info');
	}

	// Event Listeners
	elements.apiKey.addEventListener('change', handleApiKeyChange);
	elements.corpusName.addEventListener('input', updateUploadButtonState);

	// File Drag and Drop
	elements.fileInput.addEventListener('change', handleFilesSelect);

	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		elements.dropArea.addEventListener(eventName, preventDefaults, false);
	});

	['dragenter', 'dragover'].forEach(eventName => {
		elements.dropArea.addEventListener(eventName, () => elements.dropArea.classList.add('is-active'), false);
	});

	['dragleave', 'drop'].forEach(eventName => {
		elements.dropArea.addEventListener(eventName, () => elements.dropArea.classList.remove('is-active'), false);
	});

	elements.dropArea.addEventListener('drop', handleDrop, false);

	// Upload Action
	elements.uploadBtn.addEventListener('click', processAndGenerate);
}

// Handlers
function preventDefaults(e) {
	e.preventDefault();
	e.stopPropagation();
}

function handleApiKeyChange() {
	const key = elements.apiKey.value.trim();
	if (key) {
		localStorage.setItem(state.apiKeyKey, key);
		log('API Key saved to localStorage.', 'success');
	} else {
		localStorage.removeItem(state.apiKeyKey);
		log('API Key removed from localStorage.', 'info');
	}
	updateUploadButtonState();
}

function handleDrop(e) {
	const dt = e.dataTransfer;
	const files = dt.files;
	addFiles(files);
}

function handleFilesSelect(e) {
	addFiles(e.target.files);
}

function addFiles(newFiles) {
	const arr = Array.from(newFiles);
	let addedCount = 0;

	arr.forEach(file => {
		if (file.type !== 'application/pdf') {
			log(`Skipped ${file.name}: Not a PDF file.`, 'error');
			return;
		}

		// Prevent duplicates based on name and size
		const isDuplicate = state.files.some(f => f.name === file.name && f.size === file.size);
		if (isDuplicate) {
			log(`Skipped ${file.name}: File already added.`, 'info');
			return;
		}

		state.files.push(file);
		addedCount++;
	});

	if (addedCount > 0) {
		renderFileList();
		updateUploadButtonState();
		log(`Added ${addedCount} PDF file(s).`, 'success');
	}
}

function removeFile(index) {
	const removedName = state.files[index].name;
	state.files.splice(index, 1);
	renderFileList();
	updateUploadButtonState();
	log(`Removed ${removedName} from list.`, 'info');
}

function renderFileList() {
	elements.fileList.innerHTML = '';

	if (state.files.length === 0) {
		elements.fileList.innerHTML = '<li><span class="file-msg">No files selected</span></li>';
		return;
	}

	state.files.forEach((file, index) => {
		const li = document.createElement('li');

		const sizeKB = (file.size / 1024).toFixed(1);
		const textSpan = document.createElement('span');
		textSpan.textContent = `📄 ${file.name} (${sizeKB} KB)`;

		const removeBtn = document.createElement('span');
		removeBtn.textContent = '❌';
		removeBtn.className = 'remove-file';
		removeBtn.title = 'Remove file';
		removeBtn.onclick = () => removeFile(index);

		li.appendChild(textSpan);
		li.appendChild(removeBtn);
		elements.fileList.appendChild(li);
	});
}

function updateUploadButtonState() {
	const hasKey = elements.apiKey.value.trim().length > 0;
	const hasName = elements.corpusName.value.trim().length > 0;
	const hasFiles = state.files.length > 0;

	elements.uploadBtn.disabled = !(hasKey && hasName && hasFiles);
}

// Core Upload Logic
async function processAndGenerate() {
	const apiKey = elements.apiKey.value.trim();
	const corpusNameRaw = elements.corpusName.value.trim();

	// Sanitize corpus name for filename
	const corpusName = corpusNameRaw.replace(/[^a-z0-9]/gi, '_').toLowerCase();

	if (!apiKey || !corpusName || state.files.length === 0) {
		log('Missing required fields.', 'error');
		return;
	}

	elements.uploadBtn.disabled = true;
	elements.uploadBtn.textContent = 'Uploading... Please wait.';
	elements.apiKey.disabled = true;
	elements.corpusName.disabled = true;

	log(`Starting corpus generation for '${corpusName}'...`, 'info');

	const results = [];
	const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

	try {
		for (let i = 0; i < state.files.length; i++) {
			const file = state.files[i];
			log(`[${i + 1}/${state.files.length}] Uploading ${file.name}...`, 'info');

			const fileUri = await uploadFileToGemini(file, apiKey);

			if (fileUri) {
				log(`[${i + 1}/${state.files.length}] Success! URI: ${fileUri}`, 'success');
				results.push({
					file_name: file.name,
					local_path: file.name, // Browser doesn't give full path, user will need to resolve this relative to the dataset later
					gemini_uri: fileUri
				});
			} else {
				throw new Error(`Failed to upload ${file.name}`);
			}
		}

		// Build the final Corpus JSON
		const corpusData = {
			corpus: {
				name: corpusName,
				upload_timestamp: timestamp,
				files: results
			}
		};

		log('All files uploaded successfully. Generating JSON...', 'success');
		triggerDownload(corpusData, `${corpusName}_corpus_cfg.json`);
		log('Corpus generated and download started!', 'success');

	} catch (err) {
		log(`Error: ${err.message}`, 'error');
		log('Corpus generation aborted.', 'error');
	} finally {
		// Reset UI Context
		elements.uploadBtn.textContent = 'Upload and Generate Corpus';
		elements.apiKey.disabled = false;
		elements.corpusName.disabled = false;
		updateUploadButtonState();
	}
}

// API Communication
async function uploadFileToGemini(file, apiKey) {
	const url = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

	try {
		// We will perform a multipart upload
		const boundary = '-----GeminiUploadBoundary';

		// 1. Metadata part
		const metadata = {
			file: {
				display_name: file.name
			}
		};
		const metaPart = `--${boundary}\r\n` +
			`Content-Type: application/json\r\n\r\n` +
			`${JSON.stringify(metadata)}\r\n`;

		// 2. File content part
		const filePartHeader = `--${boundary}\r\n` +
			`Content-Type: ${file.type}\r\n\r\n`;
		const filePartFooter = `\r\n--${boundary}--\r\n`;

		// Combine parts into a massive Blob
		const bodyBlob = new Blob([
			metaPart,
			filePartHeader,
			file,
			filePartFooter
		]);

		const uploadResponse = await fetch(url + "&uploadType=multipart", {
			method: "POST",
			headers: {
				"Content-Type": `multipart/related; boundary=${boundary}`
			},
			body: bodyBlob
		});

		if (!uploadResponse.ok) {
			const errJson = await uploadResponse.json().catch(() => ({}));
			throw new Error(errJson.error?.message || `Upload failed: ${uploadResponse.status}`);
		}

		const responseData = await uploadResponse.json();

		// Return the required uri
		return responseData.file.uri;

	} catch (error) {
		console.error("Gemini Upload Error:", error);
		throw error;
	}
}

// Utility
function triggerDownload(data, filename) {
	const jsonStr = JSON.stringify(data, null, 4);
	const blob = new Blob([jsonStr], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();

	// Cleanup
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// Start app
document.addEventListener('DOMContentLoaded', init);
