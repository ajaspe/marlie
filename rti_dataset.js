//  This file is part of the M.A.RL.I.E. software library.
//  https://github.com/ajaspe/marlie

class RTIDataset {

	constructor(renderer, isMobile = false) {
		this.renderer = renderer;
		this.config = {};
		this.path = "";
		this.imgPath = "";
		this.resources = new Map();
		this.resourcesPending = 0;
		this.loaded = false;
		this.allResourcesRequested = false;
		this.dimensions = [0,0];
		this.rtiShader = null;
	}

	async init(path, configFileName = "config.json") {
		this.path = path + "/";
		this.imgPath = this.path;
		const response = await fetch(this.path + configFileName);
		this.config = await response.json();
		this.rtiShader = new RTIShader(this.config.rti_shader, this.renderer);
		await this.rtiShader.init();
		this.dimensions = this.config.dimensions;
		let maxSize = Math.max(this.dimensions[0], this.dimensions[1]);
		//check if need to use reduced version (for mobile and so...)
		if(maxSize > this.renderer.maxTexSize) {
			if(!this.config.hasOwnProperty("reducedVersion")) {
				console.error(`ERROR: Max Texuture Size: ${this.renderer.maxTexSize}, this dataset size: ${maxSize}`);
				return false;
			}
			maxSize = Math.max(this.config.reducedVersion.dimensions[0], this.config.reducedVersion.dimensions[1]);
			if(maxSize > this.renderer.maxTexSize) {
				console.error(`ERROR: Max Texuture Size: ${this.renderer.maxTexSize}, this dataset (reduced) size: ${maxSize}`);
				return false;
			}
			console.warn(`WARNING: Device Max Texture Size = ${this.renderer.maxTexSize}. Using reduced version of dataset`);
			this.imgPath += this.config.reducedVersion.dir;
			this.dimensions = this.config.reducedVersion.dimensions;
		}

		this.loadResources();
		this.loaded = true;
		return true;
	}	

	loadingProgress() { return 100 * (1 - (this.resourcesPending/this.resources.size));}

	loadResources() {
		const createImg = function (url, caller) {
			let img = new Image();
			img.src = url;
			img.crossOrigin = "Anonymous";
			caller.resourcesPending++;
			img.onload = (
				function(ds, img) {
					return function() {
						//img.decode(); // TODO
						//console.log("Loaded " + img.src);
						ds.resourcesPending--;
					}
				}
			) (caller, img);
			img.onerror = function() {
				console.error("RTIDataset::loadResources: Image not found: " + this.src);
			};			
			return img;
		};

		for(let layer of this.config.layers) {
			for(let mapKey in layer.maps) {
				const url = this.imgPath + layer.maps[mapKey];
				if(this.resources.has(url)) continue;
				this.resources.set(url, createImg(url, this));
			}			
			if(layer.hasOwnProperty("annotations")) {
				for(let mipLev = 0; mipLev<layer.annotations.n; mipLev++) {
					const url = `${this.imgPath}${layer.annotations.file_prefix}${mipLev}${layer.annotations.file_postfix}`; 
					if(this.resources.has(url)) continue;
					this.resources.set(url, createImg(url, this));
				}
			}
		}
		this.allResourcesRequested = true;
	}

	uploadLayerDataToGPU(numLayer, numRenderLayer) {
		if(!this.loaded) {
			console.warn("RTIDataset::uploadLayerDataToGPU: dataset still not laoded");
			return;
		}
		const layer = this.config.layers[numLayer];
		const numTexBase = numRenderLayer*(this.rtiShader.numDataMaps+1);
		for(let mapKey in layer.maps) {
			const url = this.imgPath + layer.maps[mapKey];
			const img = this.resources.get(url);

			if(!img.complete) console.warn("RTIDataset::uploadLayerDataToGPU: " + img.src + " Not here yet");
			const mapName = mapKey.toLocaleLowerCase();

			const mapInfo = this.rtiShader.getMapInfo(mapName);
			if(!mapInfo)  {
				console.warn("RTIDataset::uploadLayerDataToGPU: unknow tex name " + mapName);
				continue;
			}

			this.renderer.uploadTextureImg(numTexBase + mapInfo.numTex, img, mapInfo.channels);
			//console.log(numTexBase + mapInfo.numTex + "  " + mapName );
		}
				
		if(layer.hasOwnProperty("annotations")) {
			for(let mipLev = 0; mipLev<layer.annotations.n; mipLev++) {
				const url = `${this.imgPath}${layer.annotations.file_prefix}${mipLev}${layer.annotations.file_postfix}`; 
				const img = this.resources.get(url);
				if(!img.complete) console.warn("RTIDataset::uploadLayerDataToGPU: " + img.src + " Not here yet");
				this.renderer.uploadTextureImg(numTexBase + this.rtiShader.numDataMaps, img, 4, false, mipLev, false);
				//console.log(numTexBase + this.rtiShader.numDataMaps );
			}
		}
	}


	hasAnnotations(layer) { return this.config.layers[layer].hasOwnProperty("annotations"); }
	ready() { return (this.loaded && this.allResourcesRequested && (this.resourcesPending == 0)); }
	getImage(layer, imgName) { return this.resources.get(this.imgPath+this.config.layers[layer].maps[imgName]); }
	getNumLayers() { return this.config.layers.size();}
	get name() { return this.config.name; }
	get info() { return this.config.info; }
	get name() { return this.config[name]; }
	get width() {return this.dimensions[0]; }
	get height() { return this.dimensions[1]; }
	get aspect() { return this.height / this.width; }

}