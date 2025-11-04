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
let lastLightDirClick =[0,0];
let touchCenter = [0,0];
let fpsText, infoText;
let lensOn = false;
let advancedUI = false;

let touchInsideLens = false;
let touchStartPos = [0,0];
let touchLastPos = [0,0];
let doubleTouchDistance = 0;

let renderSetup;

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


/**
 * http://stackoverflow.com/a/10997390/11236
 */
function updateURLParameter(url, param, paramVal){
    var newAdditionalURL = "";
    var tempArray = url.split("?");
    var baseURL = tempArray[0];
    var additionalURL = tempArray[1];
    var temp = "";
    if (additionalURL) {
        tempArray = additionalURL.split("&");
        for (var i=0; i<tempArray.length; i++){
            if(tempArray[i].split('=')[0] != param){
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
	let lightDir = [0,0,0];
	lightDir[0] =  2*((x / dlCanvas.width) - 0.5);
	lightDir[1] =  2*(1-(y / dlCanvas.height) - 0.5);
	const r = Math.sqrt(lightDir[0]*lightDir[0]+lightDir[1]*lightDir[1]);
	if(r < 0 || r > 1) return;
	lightDir[2] = (Math.acos(r)/(0.5*Math.PI));

	lastLightDirClick = [x, y];

	let theta = Math.atan2(lightDir[1],lightDir[0]) * 180 / Math.PI;
	if (theta<0) theta = 360 + theta;
	const phi = Math.acos(r) * 180 / Math.PI;

	renderSetup.commonParams.lightDir = lightDir;
	
	dlCanvasCtx.clearRect(0,0,dlCanvas.width,dlCanvas.height);
	dlCanvasCtx.beginPath();

	dlCanvasCtx.arc(dlCanvas.width/2, dlCanvas.height/2, dlCanvas.width/2, 0, 2 * Math.PI);
	dlCanvasCtx.fillStyle = dlGradient;
	dlCanvasCtx.fill();

	// if(dataset.lightMapImg)
	// 	dlCanvasCtx.drawImage(dataset.lightMapImg, 0, 0, dlCanvas.width, dlCanvas.height);

	dlCanvasCtx.beginPath();
	dlCanvasCtx.arc(x, y, dlCanvas.width/30, 0, 2 * Math.PI);
	dlCanvasCtx.strokeStyle = "red";
	dlCanvasCtx.lineWidth  = 2;
	dlCanvasCtx.stroke();
	doFrame = true;
}

function changeOption(optNum, isBase = true, forze = false) {

	if(isBase) {
		const opt = viewerConfig.baseOptions[optNum];
		if(forze) {
			changeLayer(opt.layer, isBase);
		} else {
			const currentOpt = viewerConfig.baseOptions[currentBaseOpt];
			if(opt.layer != currentOpt.layer)
				changeLayer(opt.layer, isBase);
		}
		for(let param in viewerConfig.defaultParams) renderSetup.baseParams[param] = viewerConfig.defaultParams[param];
		for(let param in opt.params) renderSetup.baseParams[param] = opt.params[param];
		if(currentDataset.hasAnnotations(opt.layer))
			$('#baseAnnotations').bootstrapToggle('enable');
		else
			$('#baseAnnotations').bootstrapToggle('disable');
		currentBaseOpt = optNum;
	} else {
		const opt = viewerConfig.lensOptions[optNum];
		if(forze) {
			changeLayer(opt.layer, isBase);
		} else {
			const currentOpt = viewerConfig.lensOptions[currentLensOpt];
			if(opt.layer != currentOpt.layer)
				changeLayer(opt.layer, isBase);
		}
		for(let param in viewerConfig.defaultParams) renderSetup.lensParams[param] = viewerConfig.defaultParams[param];
		for(let param in opt.params) renderSetup.lensParams[param] = opt.params[param];
		if(currentDataset.hasAnnotations(opt.layer))
			$('#lensAnnotations').bootstrapToggle('enable');
		else
			$('#lensAnnotations').bootstrapToggle('disable');
		currentLensOpt = optNum;
	}
	updateInfo();

}

function showModalInfo(infoType) {
	let body, title;
	if(infoType=="dataset") {
		title = `<h4>Dataset: ${currentDataset.config.name}</h4>`;
		body = currentDataset.config.info;
	} else if(infoType=="layers") {
		title = `<h4>Visualized Layers</h4>`;
		body  = `<h4>Main layer: ${viewerConfig.baseOptions[currentBaseOpt].name}</h4></hr>${viewerConfig.baseOptions[currentBaseOpt].info}`;
		if(lensOn) body += `<h4>Lens layer: ${viewerConfig.lensOptions[currentLensOpt].name}</h4></hr>${viewerConfig.lensOptions[currentLensOpt].info}`;
	} else if(infoType=="annotations") {
		title = `<h4>Annotations</h4>`;
		const baseLayer = viewerConfig.baseOptions[currentBaseOpt].layer;
		const mmLev = Math.min(renderer.getCurrentMipMapLevel(), currentDataset.config.layers[baseLayer].annotations.infos.length-1);
		body = currentDataset.config.layers[baseLayer].annotations.infos[mmLev][1];
	} 

	document.getElementById("longInfoBody").innerHTML = body;
	document.getElementById("longInfoTitle").innerHTML = title;
	$('#exampleModalLong').modal('show');
}

function updateInfo() {
	let infoText = `<a href="#" onclick="showModalInfo('dataset')">`;
	if(advancedUI) infoText += ' &nbsp;&nbsp;<span class="badge badge-danger">ADVANCED</span>';
	infoText += `<b>${currentDataset.config.name}</b></a>`;
	if(advancedUI) infoText += ' <span class="badge badge-danger">&nbsp;&nbsp;ADVANCED</span>';
	infoText += `<br/>` +
		`<a href="#" onclick="showModalInfo('layers')">Main layer: ${viewerConfig.baseOptions[currentBaseOpt].name}`;
	if(lensOn) infoText += ` ··· Lens: ${viewerConfig.lensOptions[currentLensOpt].name}`;
	infoText += `</a><br/>`;
	const baseLayer = viewerConfig.baseOptions[currentBaseOpt].layer;

	if(renderSetup.baseParams.drawAnnotations) {
		const mmLev = Math.min(renderer.getCurrentMipMapLevel(), currentDataset.config.layers[baseLayer].annotations.infos.length-1);
		infoText += `<a href="#" onclick="showModalInfo('annotations')">Annotation: ${currentDataset.config.layers[baseLayer].annotations.infos[mmLev][0]}</a>`;
	}

	document.getElementById("info").innerHTML = infoText;
	doFrame = true;
}

function changeLayer(layer, isBase = true) {
	if(isBase) {
		currentDataset.uploadLayerDataToGPU(layer, 0);
		renderSetup.baseParams.drawAnnotations = false;
		 if( currentDataset.hasAnnotations(layer)) {
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

		if(currentDataset.hasAnnotations(layer)) {
			renderSetup.lensParams.hasAnnotations = true;
		} else {
			renderSetup.lensParams.hasAnnotations = false;
		}
	}
	
	doFrame = true;
}

function initUI() {
	
	// Datasets DB
	for(let i in datasets) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(i));
		link.href = "#";
		link.addEventListener("click", function(evt) { 
			loadDataSet(datasets[i]);    
		});
		document.getElementById("datasetsOptions").appendChild(link);
	}


	$('#lensOn').change(function() {
		lensOn = $('#lensOn').prop('checked');
		updateInfo();
		doFrame = true;
	});

	$('#lensOnCfg').change(function() {
		lensOn = $('#lensOnCfg').prop('checked');
		updateInfo();
		doFrame = true;
	});

	$('#fullScreen').change(function() {
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
		document.getElementById("longInfoBody").innerHTML = "<pre>" + JSON.stringify(renderSetup.baseParams, null, 2) + "\n" +  JSON.stringify(renderSetup.lensParams, null, 2) + "</pre>";
		$('#exampleModalLong').modal('show');
		doFrame = true;
	}, false);


	$('#interactionMode').change(function() {
		if($(this).prop('checked')) {
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
			brdfExplorer.alphaLimits = currentDataset.config.alphaLimits;
			console.log(currentDataset.config.alphaLimits);
			brdfExplorerCanvas.style.visibility = "visible";
		} else {
			brdfExplorerCanvas.style.visibility = "hidden";
			document.getElementById('lightTypeDiv').style.visibility = "visible";	
			if(renderSetup.commonParams.useDirLight) {
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

	$('#lightType').change(function() {
		if($(this).prop('checked')) {
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

	document.getElementById('slHeight').addEventListener('input', function(evt) {
		renderSetup.commonParams.lightSpot[2] = evt.target.value;
		doFrame = true; 	
	}, false);


	document.getElementById('lensAlpha').addEventListener("input", function(evt) {
		renderSetup.lensParams.lensAlpha = evt.target.value;
		doFrame = true;
	}, false);

	$('#baseAnnotations').change(function() {
		renderSetup.baseParams.drawAnnotations = $(this).prop('checked');
		updateInfo();
		doFrame = true;
	});

	$('#lensAnnotations').change(function() {
		renderSetup.lensParams.drawAnnotations = $(this).prop('checked');
		doFrame = true;
	});


	// Advanced config

	//Base
	$('#baseAnnotationsCfg').change(function() {
		renderSetup.baseParams.drawAnnotations = $(this).prop('checked');
		updateInfo();
		doFrame = true;
	});

	document.getElementById('baseLayerCfgParamRenderMode').addEventListener("input", function(evt) {
		renderSetup.baseParams.renderMode = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamEnhancementK').addEventListener("input", function(evt) {
		renderSetup.baseParams.enhancementK = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamEnhancementLOD').addEventListener("input", function(evt) {
		renderSetup.baseParams.enhancementLOD = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamBrightness').addEventListener("input", function(evt) {
		renderSetup.baseParams.brightness = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('baseLayerCfgParamGamma').addEventListener("input", function(evt) {
		renderSetup.baseParams.gamma = evt.target.value;
		doFrame = true;
	}, false);
	
	//Lens
	$('#lensAnnotationsCfg').change(function() {
		renderSetup.lensParams.drawAnnotations = $(this).prop('checked');
		doFrame = true;
	});

	document.getElementById('lensAlphaCfg').addEventListener("input", function(evt) {
		renderSetup.lensParams.lensAlpha = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamRenderMode').addEventListener("input", function(evt) {
		renderSetup.lensParams.renderMode = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamEnhancementK').addEventListener("input", function(evt) {
		renderSetup.lensParams.enhancementK = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamEnhancementLOD').addEventListener("input", function(evt) {
		renderSetup.lensParams.enhancementLOD = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamBrightness').addEventListener("input", function(evt) {
		renderSetup.lensParams.brightness = evt.target.value;
		doFrame = true;
	}, false);

	document.getElementById('lensLayerCfgParamGamma').addEventListener("input", function(evt) {
		renderSetup.lensParams.gamma = evt.target.value;
		doFrame = true;
	}, false);

	// DIR LIGHT STUFF
	dlGradient = dlCanvasCtx.createRadialGradient(dlCanvas.width/2, dlCanvas.height/2, dlCanvas.height/10, dlCanvas.width/2, dlCanvas.height/2, dlCanvas.width/1.2);
	dlGradient.addColorStop(0, 'white');
	dlGradient.addColorStop(1, 'blue');

	interactLightDir(dlCanvas.width/2, dlCanvas.height/2);

	dlCanvas.addEventListener('touchstart', function(evt) {
		const rect = dlCanvas.getBoundingClientRect();
		let clickPosX = dlCanvas.width * (evt.targetTouches[0].clientX - rect.left)/rect.width ;
		let clickPosY = dlCanvas.height * (evt.targetTouches[0].clientY - rect.top)/rect.height ;
		interactLightDir(clickPosX, clickPosY);
		doFrame = true;
		evt.preventDefault();
	});

	dlCanvas.addEventListener('mousemove', function(evt) {
		if(evt.buttons === 1) {
			const rect = dlCanvas.getBoundingClientRect();
			let clickPosX = dlCanvas.width * (evt.clientX - rect.left)/rect.width ;
			let clickPosY = dlCanvas.height * (evt.clientY - rect.top)/rect.height ;
			interactLightDir(clickPosX, clickPosY);
			
		}
	});

	dlCanvas.addEventListener('touchmove', function(evt) {

		if (evt.targetTouches.length == 1) {
			const rect = dlCanvas.getBoundingClientRect();
			let clickPosX = dlCanvas.width * (evt.targetTouches[0].clientX - rect.left)/rect.width ;
			let clickPosY = dlCanvas.height * (evt.targetTouches[0].clientY - rect.top)/rect.height ;
			interactLightDir(clickPosX, clickPosY);
			doFrame = true;
			evt.preventDefault();
		}
	});

}


function changeLensRadius(r, adding = false) {
	const newRadius = adding ? Number(renderSetup.lensParams.lensRadius) + r : r;
	if(newRadius > canvas.width/16 && newRadius < canvas.width/2) {
		renderSetup.lensParams.lensRadius = newRadius;
	}
}

function insideLens(coords) {
	const lensPos = renderSetup.lensParams.lensPos;
	const dist = ((lensPos[0] - coords[0]) * (lensPos[0] - coords[0])) + ((lensPos[1] - coords[1]) * (lensPos[1] - coords[1]));
	return (dist <= (renderSetup.lensParams.lensRadius*renderSetup.lensParams.lensRadius));
}

function oneTouchStart(pos) {
	touchInsideLens = false;
	touchStartPos = pos;
	touchLastPos = touchStartPos;
	if(lensOn && insideLens(touchStartPos)) {
		touchInsideLens = true;
	} else {
		if(currentInteractionState == interactionStates.DIR_LIGHT) {
		} else if(currentInteractionState == interactionStates.SPOT_LIGHT) {
			//renderSetup.commonParams.lightSpot = [pos[0], pos[1], document.getElementById('slHeight').value];
		} else if(currentInteractionState == interactionStates.BRDF_EXPLORER) {
			brdfExplorer.update(renderer.canvasCoordsToImage(pos[0], -(pos[1] - canvas.clientHeight)));
		}
	}
}

function oneTouchMove(pos) {
	const movement = [pos[0]-touchLastPos[0], pos[1]-touchLastPos[1]];
	if(touchInsideLens) {
		renderSetup.lensParams.lensPos[0] += movement[0];
		renderSetup.lensParams.lensPos[1] += movement[1];
	} else {
		if(currentInteractionState == interactionStates.DIR_LIGHT) {
			interactLightDir(lastLightDirClick[0]+movement[0]/10, lastLightDirClick[1]-movement[1]/10);
		} else if(currentInteractionState == interactionStates.SPOT_LIGHT) {
			renderSetup.commonParams.lightSpot = [pos[0], pos[1], document.getElementById('slHeight').value];
		} else if(currentInteractionState == interactionStates.BRDF_EXPLORER) {
			brdfExplorer.update(renderer.canvasCoordsToImage(pos[0], -(pos[1] - canvas.clientHeight)));
		}
	}
	touchLastPos = pos;
}

function doubleTouchStart(pos,dist) {
	touchInsideLens = false;
	touchStartPos = pos;
	touchLastPos = touchStartPos;
	doubleTouchDistance = dist;
	if(lensOn && insideLens(touchStartPos)) {
		touchInsideLens = true;
	} 
}

function doubleTouchMove(pos,dist) {
	const movement = [pos[0]-touchLastPos[0], pos[1]-touchLastPos[1]];
	if(touchInsideLens) {
		changeLensRadius((dist-doubleTouchDistance)/2.0, true);
		renderSetup.lensParams.lensPos[0] += movement[0];
		renderSetup.lensParams.lensPos[1] += movement[1];
	} else {
		renderer.pan(movement[0], -movement[1]);
		renderer.zoom((dist-doubleTouchDistance)*0.003, pos[0], -(pos[1] - canvas.clientHeight));
		if(renderSetup.baseParams.drawAnnotations) updateInfo();
	}
	touchLastPos = pos;
	doubleTouchDistance = (doubleTouchDistance+dist)/2;
}

function initInteraction() {
	canvas.addEventListener('mouseup', function(evt) {
		touchInsideLens = false;
	}, false);

	canvas.addEventListener('mousedown', function(evt) {
		const rect = canvas.getBoundingClientRect();
		const clickPos = [evt.clientX - rect.left, canvas.clientHeight - (evt.clientY - rect.top)];
		doFrame = true;
		if(evt.buttons === 1) {
			oneTouchStart(clickPos);
		} else if (evt.buttons === 2) {
			if(insideLens(clickPos) && lensOn) {
				touchInsideLens = true;
			}
			evt.preventDefault();
		} else doFrame = false;
	}, false);

	canvas.addEventListener('mousemove', function(evt) {

		const rect = canvas.getBoundingClientRect();
		const clickPos = [evt.clientX - rect.left, canvas.clientHeight - (evt.clientY - rect.top)];
		doFrame = true;
		if(evt.buttons === 1) {			
			oneTouchMove(clickPos);
			doFrame = true;
		} else if (evt.buttons === 2) {
			if(insideLens(clickPos) && lensOn && touchInsideLens) {
				changeLensRadius(-evt.movementY, true);
			} else {
				if(!touchInsideLens) renderer.pan(evt.movementX, evt.movementY);
			}
			evt.preventDefault();
		} else doFrame = false;
	}, false);
	
	canvas.addEventListener('wheel', function(evt) {
		const rect = canvas.getBoundingClientRect();
		const zoomAmount = (evt.deltaMode == 0) ? evt.deltaY/2000.0 : evt.deltaY/30.0;
		const x = (evt.clientX - rect.left);
		const y = canvas.clientHeight - (evt.clientY - rect.top);
		if(lensOn && insideLens([x,y])) {
			changeLensRadius(-100*zoomAmount, true);
		} else {
			renderer.zoom(zoomAmount, x, -(y - canvas.clientHeight));
			if(renderSetup.baseParams.drawAnnotations) updateInfo();
		}
		evt.preventDefault();
		doFrame = true;
	}, false);

	canvas.addEventListener('touchstart', function(evt) {
		const rect = canvas.getBoundingClientRect();
		evt.preventDefault();
		const t0 = [evt.targetTouches[0].clientX - rect.left, canvas.clientHeight -(evt.targetTouches[0].clientY - rect.top)];
		if (evt.targetTouches.length == 1) {
			oneTouchStart(t0);
		} else if (evt.targetTouches.length === 2) {
			const t1 = [evt.targetTouches[1].clientX - rect.left, canvas.clientHeight -(evt.targetTouches[1].clientY - rect.top)];
			const doubleTouchCenter = [(t0[0] + t1[0]) / 2.0, (t0[1] + t1[1]) / 2.0];
			const doubleTouchDistance = Math.sqrt((t1[0] - t0[0])*(t1[0] - t0[0]) + ((t1[1] - t0[1])*(t1[1] - t0[1])));
			doubleTouchStart(doubleTouchCenter, doubleTouchDistance);
		}
	}, false);
	
	canvas.addEventListener('touchmove', function(evt) {
		const rect = canvas.getBoundingClientRect();
		const t0 = [evt.targetTouches[0].clientX - rect.left, canvas.clientHeight -(evt.targetTouches[0].clientY - rect.top)];
		evt.preventDefault();
		if (evt.targetTouches.length == 1) {
			oneTouchMove(t0);
		} else if (evt.targetTouches.length == 2) {
			const t1 = [evt.targetTouches[1].clientX - rect.left, canvas.clientHeight -(evt.targetTouches[1].clientY - rect.top)];
			const doubleTouchCenter = [(t0[0] + t1[0]) / 2.0, (t0[1] + t1[1]) / 2.0];
			const doubleTouchDistance = Math.sqrt((t1[0] - t0[0])*(t1[0] - t0[0]) + ((t1[1] - t0[1])*(t1[1] - t0[1])));
			doubleTouchMove(doubleTouchCenter, doubleTouchDistance);
		}
		evt.preventDefault();
		doFrame = true;
	}, false);

	canvas.addEventListener('contextmenu', function(evt) {
		evt.preventDefault();
	}, false);

	window.addEventListener('resize', function() {
		if(isFullScreen()) {
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
	if("fullscreenEnabled" in document || "webkitFullscreenEnabled" in document || "mozFullScreenEnabled" in document || "msFullscreenEnabled" in document) {
		const elem = document.documentElement;
		let fullScreenFunc;
		if(!isFullScreen()) {
			fullScreenFunc =  elem.requestFullscreen ||  elem.msRequestFullscreen ||  elem.mozRequestFullScreen ||  elem.webkitRequestFullscreen;		
			fullScreenFunc.call(elem);
		} else {
			fullScreenFunc =  document.exitFullscreen ||  document.msExitFullscreen ||  document.mozCancelFullScreen ||  document.webkitExitFullscreen;		
			fullScreenFunc.call(document);
		}
	}
	else
		console.warn("User doesn't allow full screen");
}



async function loadViewerConfig(url) {
	url += "/viewer_config.json";
	let	resp = await fetch(url);
	viewerConfig = await resp.json();
	currentBaseOpt = 0;
	currentLensOpt = 0;

	//Fill UI
	//document.getElementById("baseLayerOptions").innerHTML = '';
	let children = Array.from(document.getElementById("baseLayerOptions").childNodes);
	for(let i in children) {
		if(children[i].nodeName == "A")
			document.getElementById("baseLayerOptions").removeChild(children[i]);
	}
	for(let i in viewerConfig.baseOptions) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(viewerConfig.baseOptions[i].name));
		link.href = "#";
		link.addEventListener("click", function(evt) { 
			changeOption(i, true);
			doFrame = true;
		});
		document.getElementById("baseLayerOptions").appendChild(link);
	}
	//document.getElementById("lensLayerOptions").innerHTML = '';
	children = Array.from(document.getElementById("lensLayerOptions").childNodes);
	for(let i in children) {
		if(children[i].nodeName == "A")
			document.getElementById("lensLayerOptions").removeChild(children[i]);
	}

	for(let i in viewerConfig.lensOptions) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(viewerConfig.lensOptions[i].name));
		link.href = "#";
		link.addEventListener("click", function(evt) { 
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
	if(!loaded) return;
	await loadViewerConfig(path);

	renderSetup = new RenderSetup(renderer);

	const newURL = updateURLParameter(window.location.href, 'ds', path);

	window.history.pushState(null, '', newURL);

	renderer.clearAllTextures();
	changeLensRadius(canvas.width/12);
	
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
	for(let i in children) {
		if(children[i].nodeName == "A")
			document.getElementById("baseLayerCfgOptions").removeChild(children[i]);
	}
	for(let i in currentDataset.config.layers) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(currentDataset.config.layers[i].name));
		link.href = "#";
		link.addEventListener("click", function(evt) { 
			changeLayer(i, true);
			doFrame = true;
		});
		document.getElementById("baseLayerCfgOptions").appendChild(link);
	}

	children = Array.from(document.getElementById("lensLayerCfgOptions").childNodes);
	for(let i in children) {
		if(children[i].nodeName == "A")
			document.getElementById("lensLayerCfgOptions").removeChild(children[i]);
	}
	for(let i in currentDataset.config.layers) {
		let link = document.createElement("a");
		link.classList.add("dropdown-item");
		link.appendChild(document.createTextNode(currentDataset.config.layers[i].name));
		link.href = "#";
		link.addEventListener("click", function(evt) { 
			changeLayer(i, false);
			doFrame = true;
		});
		document.getElementById("lensLayerCfgOptions").appendChild(link);
	}

	doFrame = true;
}

DrawingBoard.Control.MyDownload = DrawingBoard.Control.extend({
	name: 'mydownload',
	initialize: function() {
		this.$el.append('<button class="drawing-board-control-download-button"></button>');
		this.$el.on('click', '.drawing-board-control-download-button', $.proxy(function(e) {
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
	initialize: function() {
		this.$el.append('<button class="drawing-board-control-exit-button"></button>');
		this.$el.on('click', '.drawing-board-control-exit-button', $.proxy(function(e) {
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
	const dims = [vp[1]-vp[0], vp[3]-vp[2]];
	const infoString = `${lev}_${Math.round(vp[0])}_${Math.round(vp[2])}_${Math.round(dims[0])}_${Math.round(dims[1])}`;
	return infoString;
}

function showCreateAnnotation() {
	document.getElementById('drawDiv').hidden = false;
	document.getElementById('UI').hidden = true;

	if(!drawingBoard)
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

	const advancedParam = url.searchParams.get("advanced");
	if(advancedParam) {
		advancedUI = true;
		document.getElementById('simpleInterface').hidden = true;
		document.getElementById('advancedInterface').hidden= false;
	}

	const dsdbParam = url.searchParams.get("dsdb");
	if(dsdbParam) {
		let	resp = await fetch(dsdbParam);
		if(resp.ok) {
			datasets = await resp.json();
		} else {
			console.warn(`Could not load JSON DataSets DataBase ${dsdbParam}. Loading default ${defaultDatasetsDBConfigFile}`);
		}
	}
	if(!datasets) {
		let	resp = await fetch(defaultDatasetsDBConfigFile);
		if(resp.ok) {
			datasets = await resp.json();
		} else {
			console.error(`Could not load Defautl JSON DataSets DataBase.`);
			return false;
		}

	}

	renderer.init();

	let ds = Object.values(datasets)[0];
	const dsParam = url.searchParams.get("ds");
	if(dsParam) {
		if(Object.values(datasets).includes(dsParam))
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
			if(fps > 1) fpsText.innerHTML = fps + " fps";	
			else fpsText.innerHTML = "";
		}

		if (currentDataset.ready() && renderer.readyToRender) {
			if(currentInteractionState == interactionStates.LOADING) {
				renderer.setDimensions(currentDataset.width, currentDataset.height);
				if(viewerConfig.hasOwnProperty("initZoom"))
					renderer.zoom(viewerConfig.initZoom, canvas.clientWidth/2, canvas.clientHeight/2, false);
				changeOption(0, true, true);
				changeOption(0, false, true);
				document.getElementById('main').style.pointerEvents = "auto";
				document.getElementById('loading').style.visibility = "hidden";
				currentInteractionState = interactionStates.DIR_LIGHT;
				doFrame = true;
			}

			if(doFrame) {
				renderer.clear();
				renderSetup.updateForBase();
				renderer.frame();
				if(lensOn) {
					renderSetup.updateForLens();
					renderer.frame();
				}
				doFrame = false;
				frameCount++;
			}
		} else {
			if(currentInteractionState != interactionStates.LOADING) {
				document.getElementById('main').style.pointerEvents = "none";
				document.getElementById('loading').style.visibility = "visible";
				currentInteractionState = interactionStates.LOADING;
			}
		}

		lastTime = now;
		if(takeScreenShot) {
			takeAndDownloadScreenshot();
			takeScreenShot = false;
		}

		window.requestAnimationFrame(animate);
	};
	animate();
}