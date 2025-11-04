//  This file is part of the M.A.RL.I.E. software library.
//  https://github.com/ajaspe/marlie

class RTIShader {

	constructor(config, renderer) {
		this.config = config;
		this.renderer = renderer;
		this.srcFile = '';
		this.src = '';
		this.dataMaps = [];
	}

	get numDataMaps() {
		return this.dataMaps.length;
	}

	getDataMapInfo(name) {
		//for(this.dataMaps.search)
	}

	async init() {
		switch(this.config.type) {
			case 'SVBRDF':
				this.srcFile = 'shaders/svbrdf.frag';
				this.dataMaps.push({name: 'normals', shaderSampler:'uTexNormals', channels: 3});
				this.dataMaps.push({name: 'kd', shaderSampler:'uTexKd', channels: 3});
				this.dataMaps.push({name: 'ks', shaderSampler:'uTexKs', channels: 3});
				this.dataMaps.push({name: 'gloss', shaderSampler:'uTexGloss', channels: 1});
				break;

			case 'LRGB_PTM':
				this.srcFile = 'shaders/lrgbptm.frag';
				this.dataMaps.push({name: 'coeff_0_1_2', shaderSampler:'uTexCoeff_0_1_2', channels: 3});
				this.dataMaps.push({name: 'coeff_3_4_5', shaderSampler:'uTexCoeff_3_4_5', channels: 3});
				this.dataMaps.push({name: 'coeff_6_7_8', shaderSampler:'uTexCoeff_6_7_8', channels: 3});
				this.dataMaps.push({name: 'normals', shaderSampler:'uTexNormals', channels: 3});
				break;
			
			case 'HSH':
				this.srcFile = 'shaders/hsh.frag';
				this.dataMaps.push({name: 'coeff_0_1_2', shaderSampler:'uTexCoeff_0_1_2', channels: 3});
				this.dataMaps.push({name: 'coeff_3_4_5', shaderSampler:'uTexCoeff_3_4_5', channels: 3});
				this.dataMaps.push({name: 'coeff_6_7_8', shaderSampler:'uTexCoeff_6_7_8', channels: 3});
				this.dataMaps.push({name: 'coeff_9_10_11', shaderSampler:'uTexCoeff_9_10_11', channels: 3});
				this.dataMaps.push({name: 'coeff_12_13_14', shaderSampler:'uTexCoeff_12_13_14', channels: 3});
				this.dataMaps.push({name: 'coeff_15_16_17', shaderSampler:'uTexCoeff_15_16_17', channels: 3});
				this.dataMaps.push({name: 'coeff_18_19_20', shaderSampler:'uTexCoeff_18_19_20', channels: 3});
				this.dataMaps.push({name: 'coeff_21_22_23', shaderSampler:'uTexCoeff_21_22_23', channels: 3});
				this.dataMaps.push({name: 'coeff_24_25_26', shaderSampler:'uTexCoeff_24_25_26', channels: 3});
				break;

			default:
				console.warn(`RelightingShader::init() Shader ${config.type} is unknown`);
				return;
		}

		await fetch(this.srcFile).then(response => response.text()).then(txt => {this.src = txt;});
	}


	getMapInfo(name) {
		for(let i=0; i<this.dataMaps.length; i++) {
			if(name == this.dataMaps[i].name) {
				return {
					numTex: i,
					channels: this.dataMaps[i].channels
				};
			}
		}
		return null;
	}

	resetUniforms() {

		switch(this.config.type) {
			case 'SVBRDF':
				this.renderer.gl.uniform2f(this.renderer.getAttribID("uAlphaLimits"), this.config.alphaLimits[0], this.config.alphaLimits[1]);
				this.renderer.gl.uniform1i(this.renderer.getAttribID("uInputColorSpace"), (this.config.inputColorSpace == "sRGB") ? 1 : 0);			
				break;

			case 'LRGB_PTM':
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffScale012"), this.config.scale[0], this.config.scale[1], this.config.scale[2]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffScale345"), this.config.scale[3], this.config.scale[4], this.config.scale[5]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffBias012"), this.config.bias[0], this.config.bias[1], this.config.bias[2]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffBias345"), this.config.bias[3], this.config.bias[4], this.config.bias[5]);
				break;

			case 'HSH':
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffScale012"), this.config.scale[0], this.config.scale[1], this.config.scale[2]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffScale345"), this.config.scale[3], this.config.scale[4], this.config.scale[5]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffScale678"), this.config.scale[6], this.config.scale[7], this.config.scale[8]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffBias012"), this.config.bias[0], this.config.bias[1], this.config.bias[2]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffBias345"), this.config.bias[3], this.config.bias[4], this.config.bias[5]);
				this.renderer.gl.uniform3f(this.renderer.getAttribID("uCoeffBias678"), this.config.bias[6], this.config.bias[7], this.config.bias[8]);
				break;
	
			default:
				console.warn(`RelightingShader::resetParams() Shader ${config.type} is unknown`);
				return;
		}
	}



}