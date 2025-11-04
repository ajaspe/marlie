//  This file is part of the M.A.RL.I.E. software library.
//  https://github.com/ajaspe/marlie

class RenderSetup {
	
	constructor(renderer) {
		this.renderer = renderer;

		this.commonParams = {
			useDirLight : true,
			lightDir : [0,0,1],
			lightSpot : [0,0,200],
		}

		this.baseParams = {
			hasAnnotations: false,
			drawAnnotations: false,
			renderMode: 0,
			enhancementK: 0,
			enhancementLOD: 1,
			brightness: 1,
			gamma: 2
		}

		this.lensParams = {
			lensPos: [renderer.canvas.width/2, renderer.canvas.height/2],
			lensRadius: 50.0,
			lensAlpha: 1.0,
			hasAnnotations: false,
			drawAnnotations: false,
			renderMode: 0,
			enhancementK: 0,
			enhancementLOD: 1,
			brightness: 1,
			gamma: 2
		}

	}

	updateCommon() {
		let k = [0,0,0,0];
		if(this.commonParams.useDirLight)
			k = [ this.commonParams.lightDir[0], this.commonParams.lightDir[1], this.commonParams.lightDir[2], 0];
		else
			k = [ this.commonParams.lightSpot[0], this.commonParams.lightSpot[1], this.commonParams.lightSpot[2], 1];
	
		this.renderer.gl.uniform4fv(this.renderer.getAttribID("uLightInfo"), k);
	}

	updateForBase() {
		this.renderer.gl.uniform1i(this.renderer.getAttribID("uLensPass"), false);

		this.updateCommon();

		const dataMaps = this.renderer.rtiShader.dataMaps;

		for(let i=0; i<dataMaps.length; i++) {
			this.renderer.gl.uniform1i(this.renderer.getAttribID(dataMaps[i].shaderSampler), i);
		}
		this.renderer.gl.uniform1i(this.renderer.getAttribID("uTexAnnot"), this.baseParams.hasAnnotations ? dataMaps.length : 0);

		this.renderer.gl.uniform1i(this.renderer.getAttribID("uDrawAnnotations"), this.baseParams.drawAnnotations);
		this.renderer.gl.uniform1i(this.renderer.getAttribID("uRenderMode"), this.baseParams.renderMode);

		this.renderer.gl.uniform2f(this.renderer.getAttribID("uEnhancementParams"), this.baseParams.enhancementK, this.baseParams.enhancementLOD);
		this.renderer.gl.uniform2f(this.renderer.getAttribID("uRenderCorrections"), this.baseParams.brightness, this.baseParams.gamma);	
	}

	updateForLens() {
		this.renderer.gl.uniform1i(this.renderer.getAttribID("uLensPass"), true);

		this.updateCommon();

		this.renderer.gl.uniform4f(this.renderer.getAttribID("uLensInfo"), this.lensParams.lensPos[0], this.lensParams.lensPos[1], this.lensParams.lensRadius, this.lensParams.lensAlpha);
		
		const dataMaps = this.renderer.rtiShader.dataMaps;
		for(let i=0; i<dataMaps.length; i++) {
			this.renderer.gl.uniform1i(this.renderer.getAttribID(dataMaps[i].shaderSampler), dataMaps.length+1+i);
		}
		this.renderer.gl.uniform1i(this.renderer.getAttribID("uTexAnnot"), this.lensParams.hasAnnotations ? dataMaps.length : 0);

		this.renderer.gl.uniform1i(this.renderer.getAttribID("uDrawAnnotations"), this.lensParams.drawAnnotations);
		this.renderer.gl.uniform1i(this.renderer.getAttribID("uRenderMode"), this.lensParams.renderMode);

		this.renderer.gl.uniform2f(this.renderer.getAttribID("uEnhancementParams"), this.lensParams.enhancementK, this.lensParams.enhancementLOD);
		this.renderer.gl.uniform2f(this.renderer.getAttribID("uRenderCorrections"), this.lensParams.brightness, this.lensParams.gamma);	
	}

}
