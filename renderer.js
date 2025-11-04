//  This file is part of the M.A.RL.I.E. software library.
//  https://github.com/ajaspe/marlie

class Renderer {

	constructor(canvas) {
		this.canvas = canvas;
		this.gl = null;	
		this.shader = null;
		this.program = null;
		this.initTimeMark = 0;
		this.lastFrameTime = 0;
		this.readyToRender = false;
		this.attributeIds = {};
		this.defines = {};
		this.shaderFragSrc = null;
		this.shaderFrag = null;
		this.shaderVert = null;
		this.imgDims = {width: 1, height: 1};
		this.maxTexSize = 0;
		this.texturesPool = new Map();
		this.cam = {
			zoomScale: 1.0,
			panTranslation: [0,0],
			zoomLimits: {min: 0.0, max: 6.0}
		};
		this.matrices = {
			model: mat4.create(),
			view: mat4.create(),
			viewProjInv: mat4.create(),
			projection: mat4.create(),
			initView: mat4.create(),
			mvp: mat4.create()
		};

		this.stdShaderVertWebGL1Src = "#version 100 \n precision highp float; \n precision highp int; \n attribute vec4 aPosition; \n uniform mat4 uMatrix; \n varying vec2 vTexCoord; \n void main() { gl_Position = uMatrix * aPosition; vTexCoord = aPosition.xy; }";
		this.stdShaderFragWebGL1Src = "#version 100 \n precision highp float; \n precision highp int; \n varying vec2 vTexCoord; \n void main() { gl_FragColor = vec4(gl_FragCoord.xy/1024.0, 0.0, 1.0); }";
		this.stdShaderVertWebGL2Src = "#version 300 es \n precision highp float; \n precision highp int; \n in vec4 aPosition; \n uniform mat4 uMatrix; \n out vec2 vTexCoord; \n void main() { gl_Position = uMatrix * aPosition; vTexCoord = aPosition.xy; }";
		this.stdShaderFragWebGL2Src = "#version 300 es \n precision highp float; \n precision highp int; \n in vec2 vTexCoord; \n out vec4 fragColor; \n void main() { fragColor = vec4(gl_FragCoord.xy/1024.0, 0.0, 1.0); }";
		
		try {
			this.gl = this.canvas.getContext("webgl2", { antialias: false, FXAA: false, premultipliedAlpha: false });
		} catch (e) {
			alert("You browser is not webgl compatible :(");
			return false;
		}

		this.maxTexSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
	}

	updateModelMatrix() {
		mat4.fromScaling(this.matrices.model, [this.imgDims.width, this.imgDims.height, 1, 1]);
	}

	updateInitViewMatrix() {
		let fittingScale = 1.0;
		let fittingTranslate = [ 0, 0 ];
		if(this.imgDims.width/this.imgDims.height > this.canvas.clientWidth/this.canvas.clientHeight) {
			fittingScale = this.canvas.clientWidth / this.imgDims.width;
			fittingTranslate[0] = 0;
			fittingTranslate[1] = (this.canvas.clientHeight - fittingScale*this.imgDims.height) / 2.0;
		} else {
			fittingScale = this.canvas.clientHeight / this.imgDims.height;
			fittingTranslate[1] = 0;
			fittingTranslate[0] = (this.canvas.clientWidth - fittingScale*this.imgDims.width) / 2.0;
		}
		mat4.fromTranslation(this.matrices.initView, [fittingTranslate[0], fittingTranslate[1], 0]);
		mat4.scale(this.matrices.initView, this.matrices.initView, [fittingScale, fittingScale, 1, 1]);
		this.cam.panTranslation = [0, 0];
	}

	resetViewMatrix() {
		mat4.copy(this.matrices.view, this.matrices.initView);
		this.cam.zoomScale = 1.0;
	}

	updateProjection() {
		mat4.ortho(this.matrices.projection, 0, this.canvas.clientWidth, this.canvas.clientHeight, 0, -1, 1);
	}

	uploadMVP() {
		mat4.mul(this.matrices.mvp, this.matrices.projection, this.matrices.view);
		mat4.mul(this.matrices.mvp, this.matrices.mvp, this.matrices.model);
		this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, "uMatrix"), false, this.matrices.mvp);
	}

	getCurrentMipMapLevel() {
		let c0 = vec4.fromValues(0, 0, 0, 1);
		let c1 = vec4.fromValues(this.imgDims.width, this.imgDims.height, 0, 1);
		vec4.transformMat4(c0, c0, this.matrices.view);
		vec4.transformMat4(c1, c1, this.matrices.view);
		const ratio = this.imgDims.width/(c1[0]-c0[0]);
		const mipLevel =  Math.ceil(Math.log2(ratio)+0.5)-1;
		return Math.max(0,mipLevel);
	}
   
	canvasCoordsToImage(x,y) {
		let k = vec4.fromValues(x, y, 0, 1);
		let vInv = mat4.create();
		mat4.invert(vInv, this.matrices.view);
		vec4.transformMat4(k, k, vInv);
		return [k[0], k[1]];
	}

	zoom(dScale, x, y, relative = true) {
		let newZoomScale = relative ? this.cam.zoomScale+dScale : dScale;
		if( newZoomScale >= this.cam.zoomLimits.min && newZoomScale <= this.cam.zoomLimits.max) {
			this.cam.zoomScale = newZoomScale;
			let k = this.canvasCoordsToImage(x,y);
			mat4.translate(this.matrices.view, this.matrices.view, [k[0], k[1], 0]);
			mat4.scale(this.matrices.view, this.matrices.view, [1.0+dScale, 1.0+dScale, 1, 1]);
			mat4.translate(this.matrices.view, this.matrices.view, [-k[0], -k[1], 0]);
			this.uploadMVP();
		}
	}

	pan(dx, dy) {
		let t = vec3.create();
		mat4.getTranslation(t, this.matrices.view);
		const k = this.canvasCoordsToImage(dx+t[0], dy+t[1]);
		mat4.translate(this.matrices.view, this.matrices.view, [k[0], k[1], 0]);
		this.uploadMVP();
	}

	init() {
		const gl = this.gl;
		gl.clearColor(0.0, 0.0, 0.0, 0.0);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		this.shaderFragSrc = this.stdShaderFragWebGL2Src;
		if(!this._compileAndSetProgram(this.shaderFragSrc)) return false;

		const trisVerticesGLBuf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, trisVerticesGLBuf);
		const trisVertices = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];	
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trisVertices), gl.STATIC_DRAW);

		const positionAttr = gl.getAttribLocation(this.program, "aPosition");
		gl.enableVertexAttribArray(positionAttr);
		gl.vertexAttribPointer(positionAttr, 2, gl.FLOAT, false, 0, 0);

		this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
		this.resetViewMatrix();

		this.initTimeMark = performance.now();
		return true;
	}


	resetShader(rtiShader) {
		const gl = this.gl;
		this.rtiShader = rtiShader;
		this.shaderFragSrc = rtiShader.src;
		this._reCompileFrag(this.shaderFragSrc);
		this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
		this.resetViewMatrix();
		rtiShader.resetUniforms();
		return true;
	}

	getViewport() {
		let left_top = this.canvasCoordsToImage(0,0);
		let right_bottom = this.canvasCoordsToImage(this.canvas.width,this.canvas.height);
		return [left_top[0], right_bottom[0], left_top[1], right_bottom[1]];
	}

	updateDefineAndCompile(name, value, type = 'string') {
		let nPosDefine = this.shaderFragSrc.indexOf(`#define ${name} `);
		let nPosDefineEnd = this.shaderFragSrc.indexOf('\n', nPosDefine);
		
		if(nPosDefineEnd <= nPosDefine) {
			console.warn(`Renderer: Define ${name} not found`)
			return;
		}

		let valueStr;
		if(type == 'int') valueStr = Math.round(value);
		else if(type == 'float') valueStr = Number(value).toFixed(5);
		else if(type == 'string') valueStr = value;
		else if(type == 'bool') valueStr = value ? "true" : "false";
		else {
			console.warn(`Renderer: I dont understand type "${type}" for define`);
			return;
		}

		this.shaderFragSrc = this.shaderFragSrc.slice(0,nPosDefine) + `#define ${name} (${valueStr})\n` + this.shaderFragSrc.slice(nPosDefineEnd);
		this._reCompileFrag(this.shaderFragSrc);
	}

	resize(width, height) {
		this.canvas.width = width;
		this.canvas.height = height;
		this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		this.updateProjection();
		this.updateInitViewMatrix();
		this.resetViewMatrix();
		this.uploadMVP();
	}

	setDimensions(width, height) {
		this.imgDims.width = width;
		this.imgDims.height = height;
		this.updateProjection();
		this.updateInitViewMatrix();
		this.updateModelMatrix();
		this.resetViewMatrix();
		this.uploadMVP();
	}

	getAttribID(attrName) {	
		if(attrName in this.attributeIds)
			return this.attributeIds[attrName];
		
		const id = this.gl.getUniformLocation(this.program, attrName);
		if (id == null) {
			console.warn("WARNING: Attribute " + attrName + " not found or not used!");
			return;
		}
		this.attributeIds[attrName] = id;
		return id;
	}

	clearAllTextures() {
		this.texturesPool.forEach( (val, idx) => { this.gl.deleteTexture(val);  } );
		this.texturesPool.clear();
	}


	uploadTextureImg(texNum, img, nChannels = 3, genMipmaps = true, mipLevel = 0, trilinear = true) {
		const gl = this.gl;
		//console.log(`Uploading "${img.src}" [${nChannels} channles] to Tex:${texNum} (mipLev=${mipLevel} genMips=${genMipmaps} trilin=${trilinear})`);

		gl.activeTexture(gl.TEXTURE0 + texNum);

		if (!this.texturesPool.has(texNum)) {
			 this.texturesPool.set(texNum, gl.createTexture());
		} 
		
		gl.bindTexture(gl.TEXTURE_2D, this.texturesPool.get(texNum));
		
		let texFormat;
		if(nChannels == 1) texFormat = gl.LUMINANCE;
		else if(nChannels == 3) texFormat = gl.RGB;
		else if(nChannels == 4) texFormat = gl.RGBA;
		else console.warn(`I donnot support ${nChannels}`);

		gl.texImage2D(gl.TEXTURE_2D, mipLevel, texFormat, texFormat, gl.UNSIGNED_BYTE, img);

		if(genMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, trilinear ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_NEAREST);

		if(!genMipmaps) {
			const maxLev = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL); 
			if(maxLev < mipLevel || maxLev === 1000 )
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, mipLevel);
		}

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	}

	uploadTextureKTX(texNum, ktx) {
		console.log("Uploading KTX to " + texNum);
		const gl = this.gl;

		gl.activeTexture(gl.TEXTURE0 + texNum);

		if (!this.texturesPool.has(texNum)) {
			 this.texturesPool.set(texNum, gl.createTexture());
		} 
		
		gl.bindTexture(gl.TEXTURE_2D, this.texturesPool.get(texNum));

		ktx.loadTexture(gl, true);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

		this.imgDims.width = ktx.pixelWidth;
		this.imgDims.height = ktx.pixelHeight;

		this.updateModelMatrix();
		this.updateInitViewMatrix();
		this.resetViewMatrix();
		this.uploadMVP();
	}

	frame() {
		const gl = this.gl;
		if (this.readyToRender) {
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}
	}

	clear() {
		const gl = this.gl;
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
	}

	_compileAndSetProgram(shaderFragSrc) {
		const gl = this.gl;
		// Vertex shader compilation, NO ERROR CONTROL (should work)
		this.shaderVert = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(this.shaderVert, this.stdShaderVertWebGL2Src);
		gl.compileShader(this.shaderVert);
		if (!gl.getShaderParameter(this.shaderVert, gl.COMPILE_STATUS)) {
			console.error("Vertex compilation error");
			console.error(gl.getShaderInfoLog(this.shaderVert));
			return false;
		} 
		// Fragment shader compilation, WITH ERROR CONTROL
		this.shaderFrag = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(this.shaderFrag, shaderFragSrc);
		gl.compileShader(this.shaderFrag);
		// TODO Error control
		if (!gl.getShaderParameter(this.shaderFrag, gl.COMPILE_STATUS)) {
			const errorLog = gl.getShaderInfoLog(this.shaderFrag);
			console.log("\tFragment compilation error\n");
			console.log(errorLog);
			this.readyToRender = false;
			return false;
		} else {
			this.program = gl.createProgram();
			gl.attachShader(this.program, this.shaderVert);
			gl.attachShader(this.program, this.shaderFrag);
			gl.linkProgram(this.program);
			if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
				console.log("\tProgram link error");
				return false;
			} else {
				gl.useProgram(this.program);
				this.readyToRender = true;
			}
		}
		return true;
	}

	_reCompileFrag(shaderFragSrc) {
		const gl = this.gl;
		this.readyToRender = false;
		gl.shaderSource(this.shaderFrag, shaderFragSrc);
		gl.compileShader(this.shaderFrag);
		if (!gl.getShaderParameter(this.shaderFrag, gl.COMPILE_STATUS)) {
			const errorLog = gl.getShaderInfoLog(this.shaderFrag);
			console.log("\tFragment compilation error\n");
			console.log(errorLog);
			this.readyToRender = false;
			return false;
		}
		gl.linkProgram(this.program);
		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			console.log("\tProgram link error");
			return false;
		}
		this.attributeIds = {};
		this.readyToRender = true;
		this.uploadMVP();
	}
}

