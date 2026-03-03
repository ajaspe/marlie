//  This file is part of the M.A.RL.I.E. software library.
//  https://github.com/ajaspe/marlie

"use strict";

const defaultDatasetsDBConfigFile = 'datasets_db.json';

let doFrame = true;
let canvas;
let renderer;

let dlCanvas, dlCanvasCtx, dlGradient;
let brdfExplorer, brdfExplorerCanvas;
let currentDataset;
let datasets;
let lastLightDirClick = [0, 0];
let touchCenter = [0, 0];
let fpsText, infoText;
let lensOn = false;
let advancedUI = false;

let touchInsideLens = false;
let touchStartPos = [0, 0];
let touchLastPos = [0, 0];
let doubleTouchDistance = 0;

let renderSetup;

function scaleAndPadToSquare(dataUrl) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const size = Math.max(img.width, img.height);
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");

			// Fill with black padding
			ctx.fillStyle = "black";
			ctx.fillRect(0, 0, size, size);

			// Draw centered
			const dx = (size - img.width) / 2;
			const dy = (size - img.height) / 2;
			ctx.drawImage(img, dx, dy);

			resolve({
				dataUrl: canvas.toDataURL("image/png"),
				padInfo: {
					dx: dx,
					dy: dy,
					size: size,
					imgWidth: img.width,
					imgHeight: img.height
				}
			});
		};
		img.onerror = reject;
		img.src = dataUrl;
	});
}

const interactionStates = {
	LOADING: "loading",
	DIR_LIGHT: "dirLight",
	SPOT_LIGHT: "spotLight",
	BRDF_EXPLORER: "BRDFExplorer"
};

let currentInteractionState = interactionStates.LOADING;
let currentBaseOpt = -1, currentLensOpt = -1;
let viewerConfig;
let takeScreenShot = false;
let drawingBoard = null;
let aiAnnotations = null;
let aiAnnotationsElements = [];


/**
 * http://stackoverflow.com/a/10997390/11236
 */
function updateURLParameter(url, param, paramVal) {
	var newAdditionalURL = "";
	var tempArray = url.split("?");
	var baseURL = tempArray[0];
	var additionalURL = tempArray[1];
	var temp = "";
	if (additionalURL) {
		tempArray = additionalURL.split("&");
		for (var i = 0; i < tempArray.length; i++) {
			if (tempArray[i].split('=')[0] != param) {
				newAdditionalURL += temp + tempArray[i];
				temp = "&";
			}
		}
	}

	var rows_txt = temp + "" + param + "=" + paramVal;
	return baseURL + "?" + newAdditionalURL + rows_txt;
}

function isFullScreen() {
	return document.fullscreenElement ||
		document.mozFullScreenElement ||
		document.webkitFullscreenElement ||
		document.msFullscreenElement ||
		document.webkitIsFullScreen ||
		// Last fallback, there is no browser UI
		window.innerHeight === screen.height;
}

function interactLightDir(x, y) {
	let lightDir = [0, 0, 0];
	lightDir[0] = 2 * ((x / dlCanvas.width) - 0.5);
	lightDir[1] = 2 * (1 - (y / dlCanvas.height) - 0.5);
	const r = Math.sqrt(lightDir[0] * lightDir[0] + lightDir[1] * lightDir[1]);
	if (r < 0 || r > 1) return;
	lightDir[2] = (Math.acos(r) / (0.5 * Math.PI));

	lastLightDirClick = [x, y];

	let theta = Math.atan2(lightDir[1], lightDir[0]) * 180 / Math.PI;
	if (theta < 0) theta = 360 + theta;
	const phi = Math.acos(r) * 180 / Math.PI;

	renderSetup.commonParams.lightDir = lightDir;

	dlCanvasCtx.clearRect(0, 0, dlCanvas.width, dlCanvas.height);
	dlCanvasCtx.beginPath();

	dlCanvasCtx.arc(dlCanvas.width / 2, dlCanvas.height / 2, dlCanvas.width / 2, 0, 2 * Math.PI);
	dlCanvasCtx.fillStyle = dlGradient;
	dlCanvasCtx.fill();

	// if(dataset.lightMapImg)
	// 	dlCanvasCtx.drawImage(dataset.lightMapImg, 0, 0, dlCanvas.width, dlCanvas.height);

	dlCanvasCtx.beginPath();
	dlCanvasCtx.arc(x, y, dlCanvas.width / 30, 0, 2 * Math.PI);
	dlCanvasCtx.strokeStyle = "red";
	dlCanvasCtx.lineWidth = 2;
	dlCanvasCtx.stroke();
	doFrame = true;
}

function changeOption(optNum, isBase = true, forze = false) {

	if (isBase) {
		const opt = viewerConfig.baseOptions[optNum];
		if (forze) {
			changeLayer(opt.layer, isBase);
		} else {
			const currentOpt = viewerConfig.baseOptions[currentBaseOpt];
			if (opt.layer != currentOpt.layer)
				changeLayer(opt.layer, isBase);
		}
		for (let param in viewerConfig.defaultParams) renderSetup.baseParams[param] = viewerConfig.defaultParams[param];
		for (let param in opt.params) renderSetup.baseParams[param] = opt.params[param];
		if (currentDataset.hasAnnotations(opt.layer))
			$('#baseAnnotations').bootstrapToggle('enable');
		else
			$('#baseAnnotations').bootstrapToggle('disable');
		currentBaseOpt = optNum;
	} else {
		const opt = viewerConfig.lensOptions[optNum];
		if (forze) {
			changeLayer(opt.layer, isBase);
		} else {
			const currentOpt = viewerConfig.lensOptions[currentLensOpt];
			if (opt.layer != currentOpt.layer)
				changeLayer(opt.layer, isBase);
		}
		for (let param in viewerConfig.defaultParams) renderSetup.lensParams[param] = viewerConfig.defaultParams[param];
		for (let param in opt.params) renderSetup.lensParams[param] = opt.params[param];
		if (currentDataset.hasAnnotations(opt.layer))
			$('#lensAnnotations').bootstrapToggle('enable');
		else
			$('#lensAnnotations').bootstrapToggle('disable');
		currentLensOpt = optNum;
	}
	updateInfo();

}

function showModalInfo(infoType) {
	let body, title;
	if (infoType == "dataset") {
		title = `<h4>Dataset: ${currentDataset.config.name}</h4>`;
		body = currentDataset.config.info;
	} else if (infoType == "layers") {
		title = `<h4>Visualized Layers</h4>`;
		body = `<h4>Main layer: ${viewerConfig.baseOptions[currentBaseOpt].name}</h4></hr>${viewerConfig.baseOptions[currentBaseOpt].info}`;
		if (lensOn) body += `<h4>Lens layer: ${viewerConfig.lensOptions[currentLensOpt].name}</h4></hr>${viewerConfig.lensOptions[currentLensOpt].info}`;
	} else if (infoType == "annotations") {
		title = `<h4>Annotations</h4>`;
		const baseLayer = viewerConfig.baseOptions[currentBaseOpt].layer;
		const mmLev = Math.min(renderer.getCurrentMipMapLevel(), currentDataset.config.layers[baseLayer].annotations.infos.length - 1);
		body = currentDataset.config.layers[baseLayer].annotations.infos[mmLev][1];
	}

	document.getElementById("longInfoBody").innerHTML = body;
	document.getElementById("longInfoTitle").innerHTML = title;
	$('#exampleModalLong').modal('show');
}

function updateInfo() {
	let infoText = `<a href="#" onclick="showModalInfo('dataset')">`;
	if (advancedUI) infoText += ' &nbsp;&nbsp;<span class="badge badge-danger">ADVANCED</span>';
	infoText += `<b>${currentDataset.config.name}</b></a>`;
	if (advancedUI) infoText += ' <span class="badge badge-danger">&nbsp;&nbsp;ADVANCED</span>';
	infoText += `<br/>` +
		`<a href="#" onclick="showModalInfo('layers')">Main layer: ${viewerConfig.baseOptions[currentBaseOpt].name}`;
	if (lensOn) infoText += ` ··· Lens: ${viewerConfig.lensOptions[currentLensOpt].name}`;
	infoText += `</a><br/>`;
	const baseLayer = viewerConfig.baseOptions[currentBaseOpt].layer;

	if (renderSetup.baseParams.drawAnnotations) {
		const mmLev = Math.min(renderer.getCurrentMipMapLevel(), currentDataset.config.layers[baseLayer].annotations.infos.length - 1);
		infoText += `<a href="#" onclick="showModalInfo('annotations')">Annotation: ${currentDataset.config.layers[baseLayer].annotations.infos[mmLev][0]}</a>`;
	}

	document.getElementById("info").innerHTML = infoText;
	doFrame = true;
}

function changeLayer(layer, isBase = true) {
	if (isBase) {
		currentDataset.uploadLayerDataToGPU(layer, 0);
		renderSetup.baseParams.drawAnnotations = false;
		if (currentDataset.hasAnnotations(layer)) {
			renderSetup.baseParams.hasAnnotations = true;
		} else {
			renderSetup.baseParams.hasAnnotations = false;
		}

		// brdfExplorer.loadImages(currentDataset.width, currentDataset.height, 
		// 	currentDataset.getImage(layer, "gloss"),
		// 	currentDataset.getImage(layer, "kd"),
		// 	currentDataset.getImage(layer, "ks"),
		// );
	} else {
		currentDataset.uploadLayerDataToGPU(layer, 1);
		renderSetup.lensParams.drawAnnotations = false;

		if (currentDataset.hasAnnotations(layer)) {
			renderSetup.lensParams.hasAnnotations = true;
		} else {
			renderSetup.lensParams.hasAnnotations = false;
		}
	}

	doFrame = true;
}

function initUI() {

	// Datasets DB
	for (let i in datasets) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(i));
		link.href = "#";
		link.addEventListener("click", function (evt) {
			loadDataSet(datasets[i]);
		});
		document.getElementById("datasetsOptions").appendChild(link);
	}


	$('#lensOn').change(function () {
		lensOn = $('#lensOn').prop('checked');
		updateInfo();
		doFrame = true;
	});

	$('#lensOnCfg').change(function () {
		lensOn = $('#lensOnCfg').prop('checked');
		updateInfo();
		doFrame = true;
	});

	$('#fullScreen').change(function () {
		switchFullScreen();
		doFrame = true;
	});

	document.getElementById('getScreenshotButton').addEventListener('click', function (evt) {
		takeScreenShot = true;
		doFrame = true;
	}, false);

	document.getElementById('createAnnotationButton').addEventListener('click', function (evt) {
		showCreateAnnotation();
		doFrame = true;
	}, false);

	document.getElementById('getJSONPresetButton').addEventListener('click', function (evt) {
		document.getElementById("longInfoTitle").innerHTML = "Viewer Config JSON";
		document.getElementById("longInfoBody").innerHTML = "<pre>" + JSON.stringify(renderSetup.baseParams, null, 2) + "\n" + JSON.stringify(renderSetup.lensParams, null, 2) + "</pre>";
		$('#exampleModalLong').modal('show');
		doFrame = true;
	}, false);


	// AI Stuff
	const aiService = new AIService();

	async function updateModelList() {
		const models = await aiService.getModels();
		const select = document.getElementById('aiModelSelect');
		select.innerHTML = '';
		models.forEach(m => {
			const option = document.createElement('option');
			option.value = m;
			option.text = m.replace('models/', '');
			select.appendChild(option);
		});
		if (models.length > 0) select.value = "models/gemini-3.1-flash-image-preview"; // Default
	}

	document.getElementById('askAIButton').addEventListener('click', function () {
		if (aiService.hasApiKey()) {
			document.getElementById('aiKeyInputSection').style.display = 'none';
			document.getElementById('aiInteractionSection').style.display = 'block';
			updateModelList();
		} else {
			document.getElementById('aiKeyInputSection').style.display = 'block';
			document.getElementById('aiInteractionSection').style.display = 'none';
		}
		$('#aiModal').modal('show');

		// Update previews
		const imageData = canvas.toDataURL("image/png");
		document.getElementById('aiImagePreview').src = imageData;

		// --- CAPTURE NORMAL MAP FOR PREVIEW ---
		// Save current state
		const pOldBaseRenderMode = renderSetup.baseParams.renderMode;
		const pOldBaseDrawAnnotations = renderSetup.baseParams.drawAnnotations;
		const pOldLensRenderMode = renderSetup.lensParams.renderMode;
		const pOldLensDrawAnnotations = renderSetup.lensParams.drawAnnotations;

		// Set to normal mode (3) and disable annotations
		renderSetup.baseParams.renderMode = 3;
		renderSetup.baseParams.drawAnnotations = false;
		renderSetup.lensParams.renderMode = 3;
		renderSetup.lensParams.drawAnnotations = false;

		// Force a render frame synchronously
		renderer.clear();
		renderSetup.updateForBase();
		renderer.frame();
		if (lensOn) {
			renderSetup.updateForLens();
			renderer.frame();
		}

		// Capture normal map
		const rawNormalMapData = canvas.toDataURL("image/png");
		document.getElementById('aiNormalMapPreview').src = rawNormalMapData;

		// --- CAPTURE RAKING LIGHTS FOR PREVIEW ---
		// Save old Light direction
		const oldLightDir = renderSetup.commonParams.lightDir.slice(); // Copy array

		// Restore original render state back from Normal map Mode BEFORE raking lighting changes
		renderSetup.baseParams.renderMode = pOldBaseRenderMode;
		renderSetup.lensParams.renderMode = pOldLensRenderMode;

		// North (80% Rake) -> ~[0.0, 0.8, 0.4]
		renderSetup.commonParams.lightDir = [0.0, 0.8, 0.4];
		renderer.clear();
		renderSetup.updateForBase();
		renderer.frame();
		if (lensOn) {
			renderSetup.updateForLens();
			renderer.frame();
		}
		document.getElementById('aiNorthPreview').src = canvas.toDataURL("image/png");

		// South (80% Rake) -> ~[0.0, -0.8, 0.4]
		renderSetup.commonParams.lightDir = [0.0, -0.8, 0.4];
		renderer.clear();
		renderSetup.updateForBase();
		renderer.frame();
		if (lensOn) {
			renderSetup.updateForLens();
			renderer.frame();
		}
		document.getElementById('aiSouthPreview').src = canvas.toDataURL("image/png");

		// East (80% Rake) -> ~[0.8, 0.0, 0.4]
		renderSetup.commonParams.lightDir = [0.8, 0.0, 0.4];
		renderer.clear();
		renderSetup.updateForBase();
		renderer.frame();
		if (lensOn) {
			renderSetup.updateForLens();
			renderer.frame();
		}
		document.getElementById('aiEastPreview').src = canvas.toDataURL("image/png");

		// West (80% Rake) -> ~[-0.8, 0.0, 0.4]
		renderSetup.commonParams.lightDir = [-0.8, 0.0, 0.4];
		renderer.clear();
		renderSetup.updateForBase();
		renderer.frame();
		if (lensOn) {
			renderSetup.updateForLens();
			renderer.frame();
		}
		document.getElementById('aiWestPreview').src = canvas.toDataURL("image/png");

		// --- RESTORE ORIGINAL STATE ---
		renderSetup.commonParams.lightDir = oldLightDir;
		renderSetup.baseParams.renderMode = pOldBaseRenderMode;
		renderSetup.baseParams.drawAnnotations = pOldBaseDrawAnnotations;
		renderSetup.lensParams.renderMode = pOldLensRenderMode;
		renderSetup.lensParams.drawAnnotations = pOldLensDrawAnnotations;
		// -------------------------

		doFrame = true;
	});

	document.getElementById('saveKeyButton').addEventListener('click', function () {
		const key = document.getElementById('geminiKeyInput').value;
		if (key) {
			aiService.saveApiKey(key);
			document.getElementById('aiKeyInputSection').style.display = 'none';
			document.getElementById('aiInteractionSection').style.display = 'block';
			updateModelList();
		} else {
			alert('Please enter a valid key');
		}
	});

	// Helper function for UI preview clicking
	function openPreviewInNewTab(imageId) {
		const img = document.getElementById(imageId);
		if (img && img.src) {
			const win = window.open();
			if (win) win.document.write(`<iframe src="${img.src}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
		}
	}

	document.getElementById('aiImagePreview').addEventListener('click', () => openPreviewInNewTab('aiImagePreview'));
	document.getElementById('aiNormalMapPreview').addEventListener('click', () => openPreviewInNewTab('aiNormalMapPreview'));
	document.getElementById('aiNorthPreview').addEventListener('click', () => openPreviewInNewTab('aiNorthPreview'));
	document.getElementById('aiEastPreview').addEventListener('click', () => openPreviewInNewTab('aiEastPreview'));
	document.getElementById('aiSouthPreview').addEventListener('click', () => openPreviewInNewTab('aiSouthPreview'));
	document.getElementById('aiWestPreview').addEventListener('click', () => openPreviewInNewTab('aiWestPreview'));

	document.getElementById('sendToAIButton').addEventListener('click', async function () {
		let prompt = document.getElementById('aiPromptInput').value;

		// Get absolute boundaries of current camera view
		const topLeft = renderer.canvasCoordsToImage(0, 0);
		const bottomRight = renderer.canvasCoordsToImage(canvas.width, canvas.height);
		const datasetViewMinX = Math.round(topLeft[0]);
		const datasetViewMinY = Math.round(topLeft[1]);
		const datasetViewMaxX = Math.round(bottomRight[0]);
		const datasetViewMaxY = Math.round(bottomRight[1]);

		const sendRgb = document.getElementById('sendRgbToggle').checked;
		const sendNormal = document.getElementById('sendNormalToggle').checked;
		const sendNorth = document.getElementById('sendNorthToggle').checked;
		const sendSouth = document.getElementById('sendSouthToggle').checked;
		const sendEast = document.getElementById('sendEastToggle').checked;
		const sendWest = document.getElementById('sendWestToggle').checked;

		// Calculate total images selected for grammatical checking
		const totalSelected = [sendRgb, sendNormal, sendNorth, sendSouth, sendEast, sendWest].filter(Boolean).length;

		if (totalSelected === 0) {
			alert("Please select at least one image to send to the AI.");
			return;
		}

		prompt += `\nThe image provided is a cropped view of a massive visual dataset. The top-left corner corresponds to X: ${datasetViewMinX}, Y: ${datasetViewMinY} in the master absolute dataset. The bottom-right corner corresponds to X: ${datasetViewMaxX}, Y: ${datasetViewMaxY}.\n\n`;

		prompt += `We are providing you with ${totalSelected === 1 ? 'one image' : totalSelected + ' images'}:\n`;

		let imageIndex = 1;
		if (sendRgb) prompt += `${imageIndex++}. The standard current view.\n`;
		if (sendNormal) prompt += `${imageIndex++}. The normal map corresponding to the exact same view.\n`;
		if (sendNorth) prompt += `${imageIndex++}. A raking light render from the North.\n`;
		if (sendEast) prompt += `${imageIndex++}. A raking light render from the East.\n`;
		if (sendSouth) prompt += `${imageIndex++}. A raking light render from the South.\n`;
		if (sendWest) prompt += `${imageIndex++}. A raking light render from the West.\n`;

		prompt += `\nPlease analyze these images to infer the maximum amount of information possible. `;

		prompt += `For bounding boxes, output normalized coordinates between 0 and 1000 (where 0 is top/left, and 1000 is bottom/right) relative to the ENTIRE image you received. We will map it to absolute coordinates later. If you find facts in the provided bibliography, include a short citation mentioning the source material and page number. Return the response as a JSON file matching the following template format:\n{\n  "annotations": [\n    {\n      "ymin": <Y coordinate of the top edge between 0-1000>,\n      "xmin": <X coordinate of the left edge between 0-1000>,\n      "ymax": <Y coordinate of the bottom edge between 0-1000>,\n      "xmax": <X coordinate of the right edge between 0-1000>,\n      "title": "<title of the annotation>",\n      "text": "<text of the annotation>",\n      "citation": "<reference to the source material, if applicable>"\n    }\n  ]\n}`;

		document.getElementById('aiLoading').style.display = 'block';
		document.getElementById('aiResult').innerHTML = '';
		document.getElementById('sendToAIButton').disabled = true;

		try {
			// Read Corpus JSON if any
			const fileInput = document.getElementById('aiCorpusInput');
			const corpusFile = fileInput.files[0];
			let pdfUris = [];

			if (corpusFile) {
				const jsonText = await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = e => resolve(e.target.result);
					reader.onerror = e => reject(e);
					reader.readAsText(corpusFile);
				});
				try {
					const corpusData = JSON.parse(jsonText);
					if (corpusData.corpus && corpusData.corpus.files) {
						pdfUris = corpusData.corpus.files.map(f => f.gemini_uri).filter(uri => uri);
						console.log(`Loaded ${pdfUris.length} document URIs from corpus.`);
					}
				} catch (err) {
					console.error("Failed to parse Corpus JSON:", err);
				}
			}

			let payloadImages = [];

			if (sendRgb) {
				payloadImages.push(canvas.toDataURL("image/png"));
			}

			if (sendNormal || sendNorth || sendSouth || sendEast || sendWest) {
				// --- CAPTURE SPECIAL RENDERS ---
				// Save current state
				const oldBaseRenderMode = renderSetup.baseParams.renderMode;
				const oldBaseDrawAnnotations = renderSetup.baseParams.drawAnnotations;
				const oldLensRenderMode = renderSetup.lensParams.renderMode;
				const oldLensDrawAnnotations = renderSetup.lensParams.drawAnnotations;
				const oldLightDir = renderSetup.commonParams.lightDir.slice(); // Copy array

				// Disable annotations for all automated renders
				renderSetup.baseParams.drawAnnotations = false;
				renderSetup.lensParams.drawAnnotations = false;

				// 1. Normal Map Capture
				if (sendNormal) {
					renderSetup.baseParams.renderMode = 3;
					renderSetup.lensParams.renderMode = 3;
					renderer.clear();
					renderSetup.updateForBase();
					renderer.frame();
					if (lensOn) {
						renderSetup.updateForLens();
						renderer.frame();
					}
					payloadImages.push(canvas.toDataURL("image/png"));
				}

				// Reset renderMode to default standard display before lighting changes
				renderSetup.baseParams.renderMode = oldBaseRenderMode;
				renderSetup.lensParams.renderMode = oldLensRenderMode;

				// 2. North Light Capture
				if (sendNorth) {
					renderSetup.commonParams.lightDir = [0.0, 0.8, 0.4];
					renderer.clear();
					renderSetup.updateForBase();
					renderer.frame();
					if (lensOn) {
						renderSetup.updateForLens();
						renderer.frame();
					}
					payloadImages.push(canvas.toDataURL("image/png"));
				}

				// 3. East Light Capture
				if (sendEast) {
					renderSetup.commonParams.lightDir = [0.8, 0.0, 0.4];
					renderer.clear();
					renderSetup.updateForBase();
					renderer.frame();
					if (lensOn) {
						renderSetup.updateForLens();
						renderer.frame();
					}
					payloadImages.push(canvas.toDataURL("image/png"));
				}

				// 4. South Light Capture
				if (sendSouth) {
					renderSetup.commonParams.lightDir = [0.0, -0.8, 0.4];
					renderer.clear();
					renderSetup.updateForBase();
					renderer.frame();
					if (lensOn) {
						renderSetup.updateForLens();
						renderer.frame();
					}
					payloadImages.push(canvas.toDataURL("image/png"));
				}

				// 5. West Light Capture
				if (sendWest) {
					renderSetup.commonParams.lightDir = [-0.8, 0.0, 0.4];
					renderer.clear();
					renderSetup.updateForBase();
					renderer.frame();
					if (lensOn) {
						renderSetup.updateForLens();
						renderer.frame();
					}
					payloadImages.push(canvas.toDataURL("image/png"));
				}

				// Restore original state entirely
				renderSetup.baseParams.renderMode = oldBaseRenderMode;
				renderSetup.baseParams.drawAnnotations = oldBaseDrawAnnotations;
				renderSetup.lensParams.renderMode = oldLensRenderMode;
				renderSetup.lensParams.drawAnnotations = oldLensDrawAnnotations;
				renderSetup.commonParams.lightDir = oldLightDir;

				// Request animation frame to restore the canvas view cleanly
				doFrame = true;
				// -------------------------
			}

			const model = document.getElementById('aiModelSelect').value;
			const responseObj = await aiService.analyzeImage(payloadImages, prompt, model, pdfUris);

			console.log("Gemini JSON Output:", responseObj);

			let resultText = responseObj.text;
			let usageHtml = '';

			if (responseObj.usage) {
				const usage = responseObj.usage;
				usageHtml = `
					<hr>
					<div style="font-size: 0.85rem; color: #6c757d;">
						<strong>Token Usage:</strong> ${usage.totalTokenCount} 
						(Input: ${usage.promptTokenCount} | Output: ${usage.candidatesTokenCount})
					</div>
				`;
			}

			try {
				// Strip markdown code block framing if Gemini added it
				let cleanResult = resultText.trim();
				if (cleanResult.startsWith("```json")) {
					cleanResult = cleanResult.substring(7);
				} else if (cleanResult.startsWith("```")) {
					cleanResult = cleanResult.substring(3);
				}
				if (cleanResult.endsWith("```")) {
					cleanResult = cleanResult.slice(0, -3);
				}
				cleanResult = cleanResult.trim();

				loadAIAnnotationsFromJSON(cleanResult, datasetViewMinX, datasetViewMinY, datasetViewMaxX, datasetViewMaxY);
			} catch (parseError) {
				console.error("Failed to parse Gemini JSON:", parseError);
			}

			document.getElementById('aiResult').innerHTML = marked.parse(resultText) + usageHtml;
		} catch (e) {
			document.getElementById('aiResult').innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
		} finally {
			document.getElementById('aiLoading').style.display = 'none';
			document.getElementById('sendToAIButton').disabled = false;
		}
	});

	document.getElementById('changeKeyButton').addEventListener('click', function () {
		aiService.removeApiKey();
		document.getElementById('geminiKeyInput').value = '';
		document.getElementById('aiKeyInputSection').style.display = 'block';
		document.getElementById('aiInteractionSection').style.display = 'none';
	});

	document.getElementById('loadDebugJsonButton').addEventListener('click', function () {
		const jsonString = document.getElementById('aiDebugJsonInput').value;
		if (!jsonString) return;
		try {
			loadAIAnnotationsFromJSON(jsonString);
			document.getElementById('aiResult').innerHTML = '<p style="color:green">Debug JSON Loaded Successfully.</p>';
		} catch (e) {
			document.getElementById('aiResult').innerHTML = `<p style="color:red">Failed to parse JSON: ${e.message}</p>`;
		}
	});

	$('#aiAnnotationsToggle').change(function () {
		doFrame = true;
	});

	$('#interactionMode').change(function () {
		if ($(this).prop('checked')) {
			currentInteractionState = interactionStates.BRDF_EXPLORER;
			brdfExplorerCanvas.style.visibility = "visible";
			dlCanvas.style.visibility = "hidden";
			document.getElementById('lightTypeDiv').style.visibility = "hidden";
			document.getElementById('slHeight').style.visibility = "hidden";
			brdfExplorer.clear();
			brdfExplorer.loadImages(currentDataset.width, currentDataset.height,
				currentDataset.getImage(viewerConfig.baseOptions[currentBaseOpt].layer, "gloss"),
				currentDataset.getImage(viewerConfig.baseOptions[currentBaseOpt].layer, "kd"),
				currentDataset.getImage(viewerConfig.baseOptions[currentBaseOpt].layer, "ks"),
			);
			brdfExplorer.alphaLimits = currentDataset.config.rti_shader.alphaLimits;
			brdfExplorerCanvas.style.visibility = "visible";
		} else {
			brdfExplorerCanvas.style.visibility = "hidden";
			document.getElementById('lightTypeDiv').style.visibility = "visible";
			if (renderSetup.commonParams.useDirLight) {
				currentInteractionState = interactionStates.DIR_LIGHT;
				dlCanvas.style.visibility = "visible";
			} else {
				currentInteractionState = interactionStates.SPOT_LIGHT;
				document.getElementById('slHeight').style.visibility = "visible";
			}
			doFrame = true;
		}
		doFrame = true;
	});

	$('#lightType').change(function () {
		if ($(this).prop('checked')) {
			renderSetup.commonParams.useDirLight = false;
			currentInteractionState = interactionStates.SPOT_LIGHT;
			document.getElementById('slHeight').style.visibility = "visible";
			dlCanvas.style.visibility = "hidden";
		} else {
			renderSetup.commonParams.useDirLight = true;
			currentInteractionState = interactionStates.DIR_LIGHT;
			document.getElementById('slHeight').style.visibility = "hidden";
			dlCanvas.style.visibility = "visible";
		}
		doFrame = true;
	});

	document.getElementById('slHeight').addEventListener('input', function (evt) {
		renderSetup.commonParams.lightSpot[2] = evt.target.value;
		doFrame = true;
	}, false);


	document.getElementById('lensAlpha').addEventListener("input", function (evt) {
		renderSetup.lensParams.lensAlpha = evt.target.value;
		doFrame = true;
	}, false);

	$('#baseAnnotations').change(function () {
		renderSetup.baseParams.drawAnnotations = $(this).prop('checked');
		updateInfo();
		doFrame = true;
	});

	$('#lensAnnotations').change(function () {
		renderSetup.lensParams.drawAnnotations = $(this).prop('checked');
		doFrame = true;
	});


	// Advanced config

	//Base
	$('#baseAnnotationsCfg').change(function () {
		renderSetup.baseParams.drawAnnotations = $(this).prop('checked');
		updateInfo();
		doFrame = true;
	});

	document.getElementById('baseLayerCfgParamRenderMode').addEventListener("input", function (evt) {
		renderSetup.baseParams.renderMode = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamEnhancementK').addEventListener("input", function (evt) {
		renderSetup.baseParams.enhancementK = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamEnhancementLOD').addEventListener("input", function (evt) {
		renderSetup.baseParams.enhancementLOD = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamBrightness').addEventListener("input", function (evt) {
		renderSetup.baseParams.brightness = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamGamma').addEventListener("input", function (evt) {
		renderSetup.baseParams.gamma = evt.target.value;
		doFrame = true;
	}, false);

	//Lens
	$('#lensAnnotationsCfg').change(function () {
		renderSetup.lensParams.drawAnnotations = $(this).prop('checked');
		doFrame = true;
	});

	document.getElementById('lensAlphaCfg').addEventListener("input", function (evt) {
		renderSetup.lensParams.lensAlpha = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamRenderMode').addEventListener("input", function (evt) {
		renderSetup.lensParams.renderMode = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamEnhancementK').addEventListener("input", function (evt) {
		renderSetup.lensParams.enhancementK = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamEnhancementLOD').addEventListener("input", function (evt) {
		renderSetup.lensParams.enhancementLOD = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamBrightness').addEventListener("input", function (evt) {
		renderSetup.lensParams.brightness = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamGamma').addEventListener("input", function (evt) {
		renderSetup.lensParams.gamma = evt.target.value;
		doFrame = true;
	}, false);

	// DIR LIGHT STUFF
	dlGradient = dlCanvasCtx.createRadialGradient(dlCanvas.width / 2, dlCanvas.height / 2, dlCanvas.height / 10, dlCanvas.width / 2, dlCanvas.height / 2, dlCanvas.width / 1.2);
	dlGradient.addColorStop(0, 'white');
	dlGradient.addColorStop(1, 'blue');

	interactLightDir(dlCanvas.width / 2, dlCanvas.height / 2);

	dlCanvas.addEventListener('touchstart', function (evt) {
		const rect = dlCanvas.getBoundingClientRect();
		let clickPosX = dlCanvas.width * (evt.targetTouches[0].clientX - rect.left) / rect.width;
		let clickPosY = dlCanvas.height * (evt.targetTouches[0].clientY - rect.top) / rect.height;
		interactLightDir(clickPosX, clickPosY);
		doFrame = true;
		evt.preventDefault();
	});

	dlCanvas.addEventListener('mousemove', function (evt) {
		if (evt.buttons === 1) {
			const rect = dlCanvas.getBoundingClientRect();
			let clickPosX = dlCanvas.width * (evt.clientX - rect.left) / rect.width;
			let clickPosY = dlCanvas.height * (evt.clientY - rect.top) / rect.height;
			interactLightDir(clickPosX, clickPosY);

		}
	});

	dlCanvas.addEventListener('touchmove', function (evt) {

		if (evt.targetTouches.length == 1) {
			const rect = dlCanvas.getBoundingClientRect();
			let clickPosX = dlCanvas.width * (evt.targetTouches[0].clientX - rect.left) / rect.width;
			let clickPosY = dlCanvas.height * (evt.targetTouches[0].clientY - rect.top) / rect.height;
			interactLightDir(clickPosX, clickPosY);
			doFrame = true;
			evt.preventDefault();
		}
	});

}


function changeLensRadius(r, adding = false) {
	const newRadius = adding ? Number(renderSetup.lensParams.lensRadius) + r : r;
	if (newRadius > canvas.width / 16 && newRadius < canvas.width / 2) {
		renderSetup.lensParams.lensRadius = newRadius;
	}
}

function insideLens(coords) {
	const lensPos = renderSetup.lensParams.lensPos;
	const dist = ((lensPos[0] - coords[0]) * (lensPos[0] - coords[0])) + ((lensPos[1] - coords[1]) * (lensPos[1] - coords[1]));
	return (dist <= (renderSetup.lensParams.lensRadius * renderSetup.lensParams.lensRadius));
}

function oneTouchStart(pos) {
	touchInsideLens = false;
	touchStartPos = pos;
	touchLastPos = touchStartPos;
	if (lensOn && insideLens(touchStartPos)) {
		touchInsideLens = true;
	} else {
		if (currentInteractionState == interactionStates.DIR_LIGHT) {
		} else if (currentInteractionState == interactionStates.SPOT_LIGHT) {
			//renderSetup.commonParams.lightSpot = [pos[0], pos[1], document.getElementById('slHeight').value];
		} else if (currentInteractionState == interactionStates.BRDF_EXPLORER) {
			brdfExplorer.update(renderer.canvasCoordsToImage(pos[0], -(pos[1] - canvas.clientHeight)));
		}
	}
}

function oneTouchMove(pos) {
	const movement = [pos[0] - touchLastPos[0], pos[1] - touchLastPos[1]];
	if (touchInsideLens) {
		renderSetup.lensParams.lensPos[0] += movement[0];
		renderSetup.lensParams.lensPos[1] += movement[1];
	} else {
		if (currentInteractionState == interactionStates.DIR_LIGHT) {
			interactLightDir(lastLightDirClick[0] + movement[0] / 10, lastLightDirClick[1] - movement[1] / 10);
		} else if (currentInteractionState == interactionStates.SPOT_LIGHT) {
			renderSetup.commonParams.lightSpot = [pos[0], pos[1], document.getElementById('slHeight').value];
			//const convertedPos = renderer.canvasCoordsToImage(pos[0], -(pos[1] - canvas.clientHeight));
			//renderSetup.commonParams.lightSpot = [convertedPos[0], convertedPos[1], document.getElementById('slHeight').value];
			//console.log(renderSetup.commonParams.lightSpot);
		} else if (currentInteractionState == interactionStates.BRDF_EXPLORER) {
			brdfExplorer.update(renderer.canvasCoordsToImage(pos[0], -(pos[1] - canvas.clientHeight)));
		}
	}
	touchLastPos = pos;
}

function doubleTouchStart(pos, dist) {
	touchInsideLens = false;
	touchStartPos = pos;
	touchLastPos = touchStartPos;
	doubleTouchDistance = dist;
	if (lensOn && insideLens(touchStartPos)) {
		touchInsideLens = true;
	}
}

function doubleTouchMove(pos, dist) {
	const movement = [pos[0] - touchLastPos[0], pos[1] - touchLastPos[1]];
	if (touchInsideLens) {
		changeLensRadius((dist - doubleTouchDistance) / 2.0, true);
		renderSetup.lensParams.lensPos[0] += movement[0];
		renderSetup.lensParams.lensPos[1] += movement[1];
	} else {
		renderer.pan(movement[0], -movement[1]);
		renderer.zoom((dist - doubleTouchDistance) * 0.003, pos[0], -(pos[1] - canvas.clientHeight));
		if (renderSetup.baseParams.drawAnnotations) updateInfo();
	}
	touchLastPos = pos;
	doubleTouchDistance = (doubleTouchDistance + dist) / 2;
}

function initInteraction() {
	canvas.addEventListener('mouseup', function (evt) {
		touchInsideLens = false;
	}, false);

	canvas.addEventListener('mousedown', function (evt) {
		const rect = canvas.getBoundingClientRect();
		const clickPos = [evt.clientX - rect.left, canvas.clientHeight - (evt.clientY - rect.top)];
		doFrame = true;
		if (evt.buttons === 1) {
			oneTouchStart(clickPos);
		} else if (evt.buttons === 2) {
			if (insideLens(clickPos) && lensOn) {
				touchInsideLens = true;
			}
			evt.preventDefault();
		} else doFrame = false;
	}, false);

	canvas.addEventListener('mousemove', function (evt) {

		const rect = canvas.getBoundingClientRect();
		const clickPos = [evt.clientX - rect.left, canvas.clientHeight - (evt.clientY - rect.top)];
		doFrame = true;
		if (evt.buttons === 1) {
			oneTouchMove(clickPos);
			doFrame = true;
		} else if (evt.buttons === 2) {
			if (insideLens(clickPos) && lensOn && touchInsideLens) {
				changeLensRadius(-evt.movementY, true);
			} else {
				if (!touchInsideLens) renderer.pan(evt.movementX, evt.movementY);
			}
			evt.preventDefault();
		} else doFrame = false;
	}, false);

	canvas.addEventListener('wheel', function (evt) {
		const rect = canvas.getBoundingClientRect();
		const zoomAmount = (evt.deltaMode == 0) ? evt.deltaY / 2000.0 : evt.deltaY / 30.0;
		const x = (evt.clientX - rect.left);
		const y = canvas.clientHeight - (evt.clientY - rect.top);
		if (lensOn && insideLens([x, y])) {
			changeLensRadius(-100 * zoomAmount, true);
		} else {
			renderer.zoom(zoomAmount, x, -(y - canvas.clientHeight));
			if (renderSetup.baseParams.drawAnnotations) updateInfo();
		}
		evt.preventDefault();
		doFrame = true;
	}, false);

	canvas.addEventListener('touchstart', function (evt) {
		const rect = canvas.getBoundingClientRect();
		evt.preventDefault();
		const t0 = [evt.targetTouches[0].clientX - rect.left, canvas.clientHeight - (evt.targetTouches[0].clientY - rect.top)];
		if (evt.targetTouches.length == 1) {
			oneTouchStart(t0);
		} else if (evt.targetTouches.length === 2) {
			const t1 = [evt.targetTouches[1].clientX - rect.left, canvas.clientHeight - (evt.targetTouches[1].clientY - rect.top)];
			const doubleTouchCenter = [(t0[0] + t1[0]) / 2.0, (t0[1] + t1[1]) / 2.0];
			const doubleTouchDistance = Math.sqrt((t1[0] - t0[0]) * (t1[0] - t0[0]) + ((t1[1] - t0[1]) * (t1[1] - t0[1])));
			doubleTouchStart(doubleTouchCenter, doubleTouchDistance);
		}
	}, false);

	canvas.addEventListener('touchmove', function (evt) {
		const rect = canvas.getBoundingClientRect();
		const t0 = [evt.targetTouches[0].clientX - rect.left, canvas.clientHeight - (evt.targetTouches[0].clientY - rect.top)];
		evt.preventDefault();
		if (evt.targetTouches.length == 1) {
			oneTouchMove(t0);
		} else if (evt.targetTouches.length == 2) {
			const t1 = [evt.targetTouches[1].clientX - rect.left, canvas.clientHeight - (evt.targetTouches[1].clientY - rect.top)];
			const doubleTouchCenter = [(t0[0] + t1[0]) / 2.0, (t0[1] + t1[1]) / 2.0];
			const doubleTouchDistance = Math.sqrt((t1[0] - t0[0]) * (t1[0] - t0[0]) + ((t1[1] - t0[1]) * (t1[1] - t0[1])));
			doubleTouchMove(doubleTouchCenter, doubleTouchDistance);
		}
		evt.preventDefault();
		doFrame = true;
	}, false);

	canvas.addEventListener('contextmenu', function (evt) {
		evt.preventDefault();
	}, false);

	window.addEventListener('resize', function () {
		if (isFullScreen()) {
			canvas.classList.add("fullscreen");
			renderer.resize(window.innerWidth, window.innerHeight);
		} else {
			canvas.classList.remove("fullscreen");
			renderer.resize(canvas.clientWidth, canvas.clientHeight);
		}
		doFrame = true;
	});

}

function switchFullScreen() {
	if ("fullscreenEnabled" in document || "webkitFullscreenEnabled" in document || "mozFullScreenEnabled" in document || "msFullscreenEnabled" in document) {
		const elem = document.documentElement;
		let fullScreenFunc;
		if (!isFullScreen()) {
			fullScreenFunc = elem.requestFullscreen || elem.msRequestFullscreen || elem.mozRequestFullScreen || elem.webkitRequestFullscreen;
			fullScreenFunc.call(elem);
		} else {
			fullScreenFunc = document.exitFullscreen || document.msExitFullscreen || document.mozCancelFullScreen || document.webkitExitFullscreen;
			fullScreenFunc.call(document);
		}
	}
	else
		console.warn("User doesn't allow full screen");
}



async function loadViewerConfig(url) {
	url += "/viewer_config.json";
	let resp = await fetch(url);
	viewerConfig = await resp.json();
	currentBaseOpt = 0;
	currentLensOpt = 0;

	//Fill UI
	//document.getElementById("baseLayerOptions").innerHTML = '';
	let children = Array.from(document.getElementById("baseLayerOptions").childNodes);
	for (let i in children) {
		if (children[i].nodeName == "A")
			document.getElementById("baseLayerOptions").removeChild(children[i]);
	}
	for (let i in viewerConfig.baseOptions) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(viewerConfig.baseOptions[i].name));
		link.href = "#";
		link.addEventListener("click", function (evt) {
			changeOption(i, true);
			doFrame = true;
		});
		document.getElementById("baseLayerOptions").appendChild(link);
	}
	//document.getElementById("lensLayerOptions").innerHTML = '';
	children = Array.from(document.getElementById("lensLayerOptions").childNodes);
	for (let i in children) {
		if (children[i].nodeName == "A")
			document.getElementById("lensLayerOptions").removeChild(children[i]);
	}

	for (let i in viewerConfig.lensOptions) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(viewerConfig.lensOptions[i].name));
		link.href = "#";
		link.addEventListener("click", function (evt) {
			changeOption(i, false);
			$('#lensOn').bootstrapToggle('on');
			doFrame = true;
		});
		document.getElementById("lensLayerOptions").appendChild(link);
	}

}

async function loadDataSet(path) {
	console.log("Loading dataset: " + path);
	currentDataset = new RTIDataset(renderer);
	const loaded = await currentDataset.init(path);
	if (!loaded) return;
	await loadViewerConfig(path);

	renderSetup = new RenderSetup(renderer);

	const newURL = updateURLParameter(window.location.href, 'ds', path);

	window.history.pushState(null, '', newURL);

	renderer.clearAllTextures();
	changeLensRadius(canvas.width / 12);

	brdfExplorerCanvas.style.visibility = "hidden";
	dlCanvas.style.visibility = "visible";
	$('#lightType').bootstrapToggle('off');
	document.getElementById('lightTypeDiv').style.visibility = "visible";
	document.getElementById('slHeight').style.visibility = "hidden";

	currentInteractionState = interactionStates.LOADING;
	currentBaseOpt = 0;
	currentLensOpt = 0;
	doFrame = true;

	renderer.resetShader(currentDataset.rtiShader);

	$('#baseAnnotations').bootstrapToggle('off');
	$('#lensAnnotations').bootstrapToggle('off');
	$('#interactionMode').bootstrapToggle('off');
	$('#lensOn').bootstrapToggle('off');

	// fill advanced inetrface

	let children = Array.from(document.getElementById("baseLayerCfgOptions").childNodes);
	for (let i in children) {
		if (children[i].nodeName == "A")
			document.getElementById("baseLayerCfgOptions").removeChild(children[i]);
	}
	for (let i in currentDataset.config.layers) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(currentDataset.config.layers[i].name));
		link.href = "#";
		link.addEventListener("click", function (evt) {
			changeLayer(i, true);
			doFrame = true;
		});
		document.getElementById("baseLayerCfgOptions").appendChild(link);
	}

	children = Array.from(document.getElementById("lensLayerCfgOptions").childNodes);
	for (let i in children) {
		if (children[i].nodeName == "A")
			document.getElementById("lensLayerCfgOptions").removeChild(children[i]);
	}
	for (let i in currentDataset.config.layers) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(currentDataset.config.layers[i].name));
		link.href = "#";
		link.addEventListener("click", function (evt) {
			changeLayer(i, false);
			doFrame = true;
		});
		document.getElementById("lensLayerCfgOptions").appendChild(link);
	}

	doFrame = true;
}

DrawingBoard.Control.MyDownload = DrawingBoard.Control.extend({
	name: 'mydownload',
	initialize: function () {
		this.$el.append('<button class="drawing-board-control-download-button"></button>');
		this.$el.on('click', '.drawing-board-control-download-button', $.proxy(function (e) {
			e.preventDefault();
			let link = document.createElement('a');
			link.download = getAnnotationInfoString() + '-' + 'annotation.png';
			link.href = drawingBoard.canvas.toDataURL();
			link.click();
		}, this));
	}

});

DrawingBoard.Control.Exit = DrawingBoard.Control.extend({
	name: 'exit',
	initialize: function () {
		this.$el.append('<button class="drawing-board-control-exit-button"></button>');
		this.$el.on('click', '.drawing-board-control-exit-button', $.proxy(function (e) {
			e.preventDefault();
			document.getElementById('drawDiv').hidden = true;
			document.getElementById('UI').hidden = false;
			drawingBoard.reset({
				webStorage: true,
				history: true,
				background: true
			});
		}, this));
	}

});

function getAnnotationInfoString() {
	const lev = renderer.getCurrentMipMapLevel();
	let vp = renderer.getViewport();
	//const div = Math.pow(2,lev);
	//vp[0]/=div; vp[1]/=div; vp[2]/=div; vp[3]/=div; // coords ref to current mipmap level
	const dims = [vp[1] - vp[0], vp[3] - vp[2]];
	const infoString = `${lev}_${Math.round(vp[0])}_${Math.round(vp[2])}_${Math.round(dims[0])}_${Math.round(dims[1])}`;
	return infoString;
}

function loadAIAnnotationsFromJSON(jsonString, minX = null, minY = null, maxX = null, maxY = null) {
	const jsonResult = JSON.parse(jsonString);
	if (jsonResult && jsonResult.annotations) {
		aiAnnotations = jsonResult.annotations.map(ann => {

			// Map from LLM's raw percentage bounds back to our current view bounds natively
			let absX1, absY1, absX2, absY2;

			if (ann.xmin !== undefined && ann.ymin !== undefined && ann.xmax !== undefined && ann.ymax !== undefined && minX !== null) {
				const width = maxX - minX;
				const height = maxY - minY;

				absX1 = minX + (ann.xmin / 1000.0) * width;
				absY1 = minY + (ann.ymin / 1000.0) * height;
				absX2 = minX + (ann.xmax / 1000.0) * width;
				absY2 = minY + (ann.ymax / 1000.0) * height;
			} else {
				// Fallback to direct absolute fields for backwards compatibility with older formats / examples
				absX1 = ann.absX1;
				absY1 = ann.absY1;
				absX2 = ann.absX2;
				absY2 = ann.absY2;
			}

			return {
				...ann,
				absX1: absX1,
				absY1: absY1,
				absX2: absX2,
				absY2: absY2
			};
		});
		buildAIAnnotations();
	}
}

function buildAIAnnotations() {
	const overlay = document.getElementById('aiAnnotationsOverlay');
	if (!overlay) return;

	// Clear all existing
	overlay.innerHTML = '';
	aiAnnotationsElements = [];

	if (!aiAnnotations || aiAnnotations.length === 0) return;

	aiAnnotations.forEach(ann => {
		// Create the bounding box div
		const box = document.createElement('div');
		box.style.position = 'absolute';
		box.style.border = '2px solid red';
		box.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
		box.style.pointerEvents = 'none'; // allow pan/zoom to pass through

		// Create the title tag
		const label = document.createElement('div');
		label.style.position = 'absolute';
		label.style.left = '-2px';
		label.style.top = '-25px';
		label.style.backgroundColor = 'red';
		label.style.color = 'white';
		label.style.padding = '2px 6px';
		label.style.fontSize = '12px';
		label.style.fontWeight = 'bold';
		label.style.borderTopLeftRadius = '4px';
		label.style.borderTopRightRadius = '4px';
		label.style.whiteSpace = 'nowrap';
		label.style.pointerEvents = 'auto'; // keep title clickable
		label.style.cursor = 'pointer';
		label.innerText = ann.title || 'Annotation';

		// Optional: add a tooltip for the description text and citation
		let tooltipText = ann.text || '';
		let hasCitation = false;
		if (ann.citation) {
			tooltipText += `\n\nCitation: ${ann.citation}`;
			hasCitation = true;

			// Show citation indicator on the label
			label.innerText += " 📚";
		}

		if (tooltipText) {
			label.title = tooltipText;
		}

		// Add click event for a popup window with detailed info
		label.onclick = function (e) {
			e.stopPropagation(); // Prevent canvas interactions

			// Create a clean overlay for the popup
			let popupBg = document.createElement('div');
			popupBg.style.position = 'fixed';
			popupBg.style.left = '0';
			popupBg.style.top = '0';
			popupBg.style.width = '100vw';
			popupBg.style.height = '100vh';
			popupBg.style.backgroundColor = 'rgba(0,0,0,0.5)';
			popupBg.style.display = 'flex';
			popupBg.style.alignItems = 'center';
			popupBg.style.justifyContent = 'center';
			popupBg.style.zIndex = '2000';

			let popup = document.createElement('div');
			popup.style.backgroundColor = 'white';
			popup.style.padding = '20px';
			popup.style.borderRadius = '8px';
			popup.style.maxWidth = '500px';
			popup.style.maxHeight = '80vh';
			popup.style.overflowY = 'auto';
			popup.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
			popup.style.color = '#333';

			let title = document.createElement('h3');
			title.innerText = ann.title || 'Annotation';
			title.style.marginTop = '0';
			popup.appendChild(title);

			let text = document.createElement('p');
			text.innerText = ann.text || 'No description provided.';
			popup.appendChild(text);

			if (hasCitation) {
				let hr = document.createElement('hr');
				popup.appendChild(hr);

				let citeLabel = document.createElement('strong');
				citeLabel.innerText = "Bibliography Reference:";
				popup.appendChild(citeLabel);

				let citeText = document.createElement('p');
				citeText.innerText = ann.citation;
				citeText.style.fontStyle = 'italic';
				citeText.style.backgroundColor = '#f8f9fa';
				citeText.style.padding = '10px';
				citeText.style.borderLeft = '4px solid #007bff';
				popup.appendChild(citeText);
			}

			let closeBtn = document.createElement('button');
			closeBtn.className = 'btn btn-secondary btn-sm float-right';
			closeBtn.innerText = 'Close';
			closeBtn.onclick = () => document.body.removeChild(popupBg);
			popup.appendChild(closeBtn);

			popupBg.appendChild(popup);
			popupBg.onclick = (event) => {
				if (event.target === popupBg) document.body.removeChild(popupBg);
			};

			document.body.appendChild(popupBg);
		};

		box.appendChild(label);
		overlay.appendChild(box);
		aiAnnotationsElements.push(box);
	});
}

function drawAIAnnotations() {
	if (!aiAnnotations || aiAnnotations.length === 0) return;

	const showAnnotations = document.getElementById('aiAnnotationsToggle');
	const isVisible = showAnnotations ? showAnnotations.checked : true;

	aiAnnotations.forEach((ann, index) => {
		const box = aiAnnotationsElements[index];
		if (!box) return;

		if (!isVisible) {
			box.style.display = 'none';
			return;
		} else {
			box.style.display = 'block';
		}

		// Map absolute dataset coordinates to current screen coordinates
		const topLeftScreen = renderer.imageCoordsToCanvas(ann.absX1, ann.absY1);
		const bottomRightScreen = renderer.imageCoordsToCanvas(ann.absX2, ann.absY2);

		const winX1 = topLeftScreen[0];
		const winY1 = topLeftScreen[1];
		const winX2 = bottomRightScreen[0];
		const winY2 = bottomRightScreen[1];

		const left = Math.min(winX1, winX2);
		const top = Math.min(winY1, winY2);
		const width = Math.abs(winX2 - winX1);
		const height = Math.abs(winY2 - winY1);

		box.style.left = `${left}px`;
		box.style.top = `${top}px`;
		box.style.width = `${width}px`;
		box.style.height = `${height}px`;
	});
}

function showCreateAnnotation() {
	document.getElementById('drawDiv').hidden = false;
	document.getElementById('UI').hidden = true;

	if (!drawingBoard)
		drawingBoard = new DrawingBoard.Board('drawDiv', {
			controls: [
				'Color',
				{ Size: { type: 'dropdown' } },
				{ DrawingMode: { filler: false } },
				'Navigation',
				'MyDownload',
				'Exit'
			],
			'color': '#F00',
			'size': 20,
			'controlsPosition': 'top center',
			'background': 'false',
			'eraserColor': 'transparent',
			'webStorage': false,
			'enlargeYourContainer': false
		});
}


function takeAndDownloadScreenshot() {
	const filename = getAnnotationInfoString() + '_' + currentDataset.config.name + '-' + viewerConfig.baseOptions[currentBaseOpt].name + '.png';
	let link = document.createElement('a');
	link.download = filename;
	link.href = canvas.toDataURL();
	link.click();
}

async function main(canvasId) {

	canvas = document.getElementById(canvasId);
	brdfExplorerCanvas = document.getElementById("brdfExplorer");
	fpsText = document.getElementById("fps");
	dlCanvas = document.getElementById('dlCanvas');
	dlCanvasCtx = dlCanvas.getContext('2d');
	renderer = new Renderer(canvas);
	brdfExplorer = new BRDFExplorer(brdfExplorerCanvas);

	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	const url = new URL(window.location.href);

	const advancedParam = 1; // url.searchParams.get("advanced");
	if (advancedParam) {
		advancedUI = true;
		document.getElementById('simpleInterface').hidden = true;
		document.getElementById('advancedInterface').hidden = false;
	}

	const dsdbParam = url.searchParams.get("dsdb");
	if (dsdbParam) {
		let resp = await fetch(dsdbParam);
		if (resp.ok) {
			datasets = await resp.json();
		} else {
			console.warn(`Could not load JSON DataSets DataBase ${dsdbParam}. Loading default ${defaultDatasetsDBConfigFile}`);
		}
	}
	if (!datasets) {
		let resp = await fetch(defaultDatasetsDBConfigFile);
		if (resp.ok) {
			datasets = await resp.json();
		} else {
			console.error(`Could not load Defautl JSON DataSets DataBase.`);
			return false;
		}

	}

	renderer.init();

	let ds = Object.values(datasets)[0];
	const dsParam = url.searchParams.get("ds");
	if (dsParam) {
		if (Object.values(datasets).includes(dsParam))
			ds = dsParam;
		else
			console.warn(`Dataset "${dsParam}" not found, loading default one.`);
	}

	await loadDataSet(ds);


	currentInteractionState = interactionStates.LOADING;

	initUI();
	initInteraction();
	renderer.resize(canvas.clientWidth, canvas.clientHeight);

	let elapsedTime = 0, frameCount = 0;
	let lastTime = new Date().getTime();

	let animate = function () {
		const now = new Date().getTime();
		elapsedTime += (now - lastTime);

		if (elapsedTime >= 1000) { // stuff to do once a second
			doFrame = true;
			const fps = frameCount;
			frameCount = 0; elapsedTime = 0;
			if (fps > 1) fpsText.innerHTML = fps + " fps";
			else fpsText.innerHTML = "";
		}

		if (currentDataset.ready() && renderer.readyToRender) {
			if (currentInteractionState == interactionStates.LOADING) {
				renderer.setDimensions(currentDataset.width, currentDataset.height);
				if (viewerConfig.hasOwnProperty("initZoom"))
					renderer.zoom(viewerConfig.initZoom, canvas.clientWidth / 2, canvas.clientHeight / 2, false);
				changeOption(0, true, true);
				changeOption(0, false, true);
				document.getElementById('main').style.pointerEvents = "auto";
				document.getElementById('loading').style.visibility = "hidden";
				currentInteractionState = interactionStates.DIR_LIGHT;
				doFrame = true;
			}

			if (doFrame) {
				renderer.clear();
				renderSetup.updateForBase();
				renderer.frame();
				if (lensOn) {
					renderSetup.updateForLens();
					renderer.frame();
				}
				doFrame = false;
				frameCount++;
			}
		} else {
			if (currentInteractionState != interactionStates.LOADING) {
				document.getElementById('main').style.pointerEvents = "none";
				document.getElementById('loading').style.visibility = "visible";
				currentInteractionState = interactionStates.LOADING;
			}
		}

		lastTime = now;
		if (takeScreenShot) {
			takeAndDownloadScreenshot();
			takeScreenShot = false;
		}

		drawAIAnnotations();

		window.requestAnimationFrame(animate);
	};
	animate();
}