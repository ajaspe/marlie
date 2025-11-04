//  This file is part of the M.A.RL.I.E. software library.
//  https://github.com/ajaspe/marlie

class BRDFExplorer {

	constructor(canvas) {
		this.canvas = canvas;
		this.canvasCtx = canvas.getContext('2d');
		this.imgData = this.canvasCtx.getImageData(0,0,this.canvas.width,this.canvas.height);

		this.canvasGloss = document.createElement('canvas');
		this.canvasGlossCtx = this.canvasGloss.getContext('2d');
		this.canvasKd = document.createElement('canvas');
		this.canvasKdCtx = this.canvasKd.getContext('2d');
		this.canvasKs = document.createElement('canvas');
		this.canvasKsCtx = this.canvasKs.getContext('2d');
		this.clear();
		this.canvasCtx.font = "12px Arial";
		this.canvasCtx.fillStyle = "White";
		this.canvasCtx.textAlign = "right";
		this.canvasCtx.shadowBlur = 2;
		this.canvasCtx.shadowColor = "rgba(0,0,0,0.8)";
		this._ISO_WARD_EXPONENT = 4;
		this.alphaLimits = [0.05, 0.3];
	}

	clear() {
		this.canvasCtx.fillStyle = "black";
		this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
	}

	loadImages(width, height, imgGloss, imgKd, imgKs){
		this.canvasGloss.width = width;
		this.canvasGloss.height = height;
		this.canvasKd.width = width;
		this.canvasKd.height = height;
		this.canvasKs.width = width;
		this.canvasKs.height = height;

		this.canvasGlossCtx.drawImage(imgGloss, 0 ,0);		
		this.canvasKdCtx.drawImage(imgKd, 0 ,0);		
		this.canvasKsCtx.drawImage(imgKs, 0 ,0);		
	}

	glossToAlpha(gloss) {

		const minGloss = 1.0 - Math.pow(this.alphaLimits[1], 1.0 / this._ISO_WARD_EXPONENT);
		const maxGloss = 1.0 - Math.pow(this.alphaLimits[0], 1.0 / this._ISO_WARD_EXPONENT);
		const alpha = Math.pow(1.0 - gloss * (maxGloss - minGloss) - minGloss, this._ISO_WARD_EXPONENT);
		return alpha;
	}

	update(coords) {

		const kddata = this.canvasKdCtx.getImageData(coords[0], coords[1], 1, 1).data;
		const ksdata = this.canvasKsCtx.getImageData(coords[0], coords[1], 1, 1).data;

		let kd = vec3.fromValues(kddata[0], kddata[1], kddata[2]);
		let ks = vec3.fromValues(ksdata[0], ksdata[1], ksdata[2]);
		const gloss = this.canvasGlossCtx.getImageData(coords[0], coords[1], 1, 1).data[0]/255;
		const alpha = this.glossToAlpha(gloss);

		const N = vec3.fromValues(0,0,1);
		const X = vec3.fromValues(1,0,0);
		const Y = vec3.fromValues(0,1,0);

		const phi_h = 0;
		const phi_d = Math.PI/2;

		for(let y=0; y<this.canvas.height; y++) {
			for(let x=0; x<this.canvas.width; x++) {
				const i = (y*this.canvas.width+x)*4;
				const theta_h = (Math.PI/2) * ((x+0.5)/this.canvas.width);
				const theta_d = (Math.PI/2) * (((y+0.5)/this.canvas.height));
				let vecs = this.half_to_cartesian_in(theta_h, phi_h, theta_d, phi_d);
				let spec = this.ward(vecs.light, vecs.view, N, X, Y, alpha);
				let rgb = [kd[0] + ks[0] * spec, kd[1] + ks[1] * spec, kd[2] + ks[2] * spec];
				// let max = Math.max(rgb[0],rgb[1], rgb[2]);
				// if(max > 255) {
				// 	rgb[0] = 255.0 * rgb[0]/max;
				// 	rgb[1] = 255.0 * rgb[1]/max;
				// 	rgb[2] = 255.0 * rgb[2]/max;
				// }
				this.imgData.data[i+0] = rgb[0];
				this.imgData.data[i+1] = rgb[1];
				this.imgData.data[i+2] = rgb[2];
				this.imgData.data[i+3] = 255;
			}
		}
		this.canvasCtx.putImageData(this.imgData,0,0);

		this.canvasCtx.fillStyle = "White";
		this.canvasCtx.fillText("gloss (" + gloss.toFixed(3) + ")",this.canvas.width-2,10);
		this.canvasCtx.fillText("alpha (" + alpha.toFixed(3) + ")",this.canvas.width-2,25);
		this.canvasCtx.fillText("Ks (" + Math.round(100*ks[0]/255)/100 + "," + Math.round(100*ks[1]/255)/100 + "," + Math.round(100*ks[2]/255)/100 + ")",this.canvas.width-2,40);
		this.canvasCtx.fillText("Kd (" + Math.round(100*kd[0]/255)/100 + "," + Math.round(100*kd[1]/255)/100 + "," + Math.round(100*kd[2]/255)/100 + ")",this.canvas.width-2,55);
	}

	half_to_cartesian_in(theta_h, phi_h, theta_d, phi_d) {
		let out = {
			light: vec3.create(),
			view: vec3.create()
		};

		// Calculate the half vector
		let half = vec3.create();
		half[0] = Math.sin(theta_h) * Math.cos(phi_h);
		half[1] = Math.sin(theta_h) * Math.sin(phi_h);
		half[2] = Math.cos(theta_h);

		// Compute the light vector using the rotation formula.
		let k = vec3.create();
		out.light[0] = Math.sin(theta_d) * Math.cos(phi_d);
		out.light[1] = Math.sin(theta_d) * Math.sin(phi_d);
		out.light[2] = Math.cos(theta_d);

		// Rotate the diff vector to get the output vector
		this.rotate_binormal(out.light, theta_h);
		this.rotate_normal(out.light, phi_h);

		// Compute the out vector from the in vector and the half vector.
		const dot = vec3.dot(out.light, half);
		out.view[0] = -out.light[0] + 2.0 * dot * half[0];
		out.view[1] = -out.light[1] + 2.0 * dot * half[1];
		out.view[2] = -out.light[2] + 2.0 * dot * half[2];


		if(out.light[2] < 0.0 || out.view[2] < 0.0) {
			console.warn('ERROR chungo');
		}
		return out;
	}

	rotate_binormal(vec, theta) {
		let rotY = mat4.create();
		mat4.fromYRotation(rotY, theta);
		vec3.transformMat4(vec, vec, rotY);
	}

    rotate_normal(vec, theta) {
		let rotZ = mat4.create();
		mat4.fromZRotation(rotZ, theta);
		vec3.transformMat4(vec, vec, rotZ);
	}

	sqr(x) { return x*x; }

	ward(V, L, N, X, Y, alpha) {

		let H = vec3.create();
		vec3.add(H, V, L);
		vec3.normalize(H, H);
		const H_dot_N = vec3.dot(H, N);
		const alpha_sqr_H_dot_N =  this.sqr(alpha * H_dot_N);
		if(alpha_sqr_H_dot_N < 0.00001) return 0.0;
	
		const L_dot_N_mult_N_dot_V = vec3.dot(L,N) * vec3.dot(N,V);
		if(L_dot_N_mult_N_dot_V <= 0.0) return 0.0;
	
		let spec = 1.0 / (4.0 * Math.PI * alpha * alpha * Math.sqrt(L_dot_N_mult_N_dot_V));
		//const exponent = -(this.sqr(vec3.dot(H,X)) + this.sqr(vec3.dot(H,Y))) / alpha_sqr_H_dot_N; // Anisotropic
		const exponent = -(this.sqr(Math.tan(Math.acos(H_dot_N)))) / this.sqr(alpha); // Isotropic
	
		spec *= Math.exp( exponent );
	
		return spec;
	}
}

