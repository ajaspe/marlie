#version 300 es
//  This file is part of the M.A.RL.I.E. software library.
//  https://github.com/ajaspe/marlie

precision highp float;
precision highp int;

#define NULL_NORMAL vec3(0,0,0)
#define LENS_FRAME_WIDTH (5.0)
#define LENS_FRAME_COLOR vec4(0.7, 0.2, 0.4, 0.7)
#define SQR(x) ((x)*(x))
#define PI (3.14159265359)
#define ISO_WARD_EXPONENT (4.0)

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexCoeff_0_1_2;		// COEFF012
uniform sampler2D uTexCoeff_3_4_5;		// COEFF345
uniform sampler2D uTexCoeff_6_7_8;		// COEFF678
uniform sampler2D uTexNormals;		// NORMALS
uniform sampler2D uTexAnnot;	// ANNOTATIONS

uniform vec3 uCoeffScale012;
uniform vec3 uCoeffScale345;
uniform vec3 uCoeffBias012;
uniform vec3 uCoeffBias345;

uniform bool uLensPass;
uniform vec4 uLensInfo; // [PosX, PosY, Radius, Alpha]
uniform vec4 uLightInfo; // [x,y,z,w] (if .w==0 => Directional, if w==1 => Spot)


uniform bool uDrawAnnotations;
uniform int uRenderMode; // 0: Full
                         // 1: Monochromatic
						 // 2: Gooch
						 // 3: Normals
						 // 4: Kd // Diffuse component
						 // 5: Specular ((ks * ward) * NdotL))

uniform vec2 uEnhancementParams; // [Factor, LOD]
uniform vec2 uRenderCorrections; // [Brighness, Contrast]


vec3 linear2sRGB(vec3 linearRGB) {
    bvec3 cutoff = lessThan(linearRGB, vec3(0.0031308));
    vec3 higher = vec3(1.055)*pow(linearRGB, vec3(1.0/2.4)) - vec3(0.055);
    vec3 lower = linearRGB * vec3(12.92);
    return mix(higher, lower, cutoff);
}

vec3 sRGB2Linear(vec3 sRGB) {
    bvec3 cutoff = lessThan(sRGB, vec3(0.04045));
    vec3 higher = pow((sRGB + vec3(0.055))/vec3(1.055), vec3(2.4));
    vec3 lower = sRGB/vec3(12.92);
    return mix(higher, lower, cutoff);
}


void main() {

	float fragmentAlpha = 1.0;

	if(uLensPass) {
		float pixelDist = distance(uLensInfo.xy, gl_FragCoord.xy);
		if(pixelDist > uLensInfo.z) discard; // out of lens
		else if(pixelDist > (uLensInfo.z-LENS_FRAME_WIDTH)) { // draw lens frame
			fragColor = LENS_FRAME_COLOR;
			return;
		} else fragmentAlpha = uLensInfo[3];
	} 

	vec3 coeff012 = texture(uTexCoeff_0_1_2, vTexCoord).xyz;
	vec3 coeff345 = texture(uTexCoeff_3_4_5, vTexCoord).xyz;
	vec3 chroma  = texture(uTexCoeff_6_7_8, vTexCoord).xyz;
	// TODO DISCARD PIXELS

	vec3 L = (uLightInfo.w == 0.0) ? normalize(uLightInfo.xyz) : normalize(uLightInfo.xyz - gl_FragCoord.xyz);

	if(uEnhancementParams[0] > 0.001) {
		coeff012 = coeff012 + uEnhancementParams.x * (coeff012 - textureLod(uTexCoeff_0_1_2, vTexCoord,  uEnhancementParams.y).xyz);
		coeff345 = coeff345 + uEnhancementParams.x * (coeff345 - textureLod(uTexCoeff_3_4_5, vTexCoord,  uEnhancementParams.y).xyz);
		//chroma = chroma + uEnhancementParams.x * (chroma - textureLod(uTexCoeff_6_7_8, vTexCoord,  uEnhancementParams.y).xyz);
	}

	


	coeff012 = (coeff012 - uCoeffBias012/255.0) * uCoeffScale012;
	coeff345 = (coeff345 - uCoeffBias345/255.0) * uCoeffScale345;
	float lum = coeff012.x * L.x * L.x +
				coeff012.y * L.y * L.y +
				coeff012.z * L.x * L.y +
				coeff345.x * L.x +
				coeff345.y * L.y +
				coeff345.z;

	vec3 linearColor = chroma * lum;
	
	bool doRenderCorrections = true;

	if (uRenderMode == 1) { // Albedo
		linearColor = chroma;
	} else if (uRenderMode == 2) {
		linearColor = vec3(lum);
		doRenderCorrections = false;
	} else if (uRenderMode == 3) {
		linearColor = texture(uTexNormals, vTexCoord).xyz;
		doRenderCorrections = false;
	} else if (uRenderMode == 4) {
		vec3 N;
		float nDiv = ((4.0 * coeff012.x * coeff012.y) - (coeff012.z * coeff012.z));
		N.x = ((coeff012.z * coeff345.y) - (2.0 * coeff012.y * coeff345.x)) / nDiv;
		N.y = ((coeff012.z * coeff345.x) - (2.0 * coeff012.x * coeff345.y)) / nDiv;
		N.z = sqrt(1.0 - N.x*N.x - N.y*N.y);
		N = normalize(N);
		linearColor = (N*.5)+vec3(.5);
		doRenderCorrections = false;
	} 



	vec3 finalColor = doRenderCorrections ? pow(linearColor * uRenderCorrections.x, vec3(1.0/uRenderCorrections.y)) : linearColor;

	if(uDrawAnnotations) {
		vec4 annotColor = texture(uTexAnnot, vTexCoord);
		finalColor = (1.-annotColor.w) * finalColor + annotColor.w * annotColor.xyz;
	}

	fragColor = vec4(finalColor, fragmentAlpha) ;
}