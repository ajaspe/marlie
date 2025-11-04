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

uniform sampler2D uTexCoeff_0_1_2;
uniform sampler2D uTexCoeff_3_4_5;
uniform sampler2D uTexCoeff_6_7_8;
uniform sampler2D uTexCoeff_9_10_11;
uniform sampler2D uTexCoeff_12_13_14;
uniform sampler2D uTexCoeff_15_16_17;
uniform sampler2D uTexCoeff_18_19_20;
uniform sampler2D uTexCoeff_21_22_23;
uniform sampler2D uTexCoeff_24_25_26;
uniform sampler2D uTexCoeff_27_28_29;
uniform sampler2D uTexAnnot;	// ANNOTATIONS

uniform vec3 uCoeffScale012;
uniform vec3 uCoeffScale345;
uniform vec3 uCoeffScale678;
uniform vec3 uCoeffBias012;
uniform vec3 uCoeffBias345;
uniform vec3 uCoeffBias678;

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

/*
vec3 getNormal(const in vec2 texCoord) {
	vec3 n = texture(uTex0, texCoord).xyz;
	n = 2. * n - vec3(1.);
	float norm = length(n);
	if(norm < 0.5) return NULL_NORMAL;
	else return n/norm;
}

vec3 getNormalFromLOD(const in vec2 texCoord, const in float lodLevel) {
	vec3 n = textureLod(uTex0, texCoord, lodLevel).xyz;
	n = 2. * n - vec3(1.);
	float norm = length(n);
	if(norm < 0.5) return NULL_NORMAL;
	else return normalize(n);

}

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
*/
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

	vec3 coeff_0_1_2 = texture(uTexCoeff_0_1_2, vTexCoord).xyz;
	vec3 coeff_3_4_5 = texture(uTexCoeff_3_4_5, vTexCoord).xyz;
	vec3 coeff_6_7_8 = texture(uTexCoeff_6_7_8, vTexCoord).xyz;
	vec3 coeff_9_10_11 = texture(uTexCoeff_9_10_11, vTexCoord).xyz;
	vec3 coeff_12_13_14 = texture(uTexCoeff_12_13_14, vTexCoord).xyz;
	vec3 coeff_15_16_17 = texture(uTexCoeff_15_16_17, vTexCoord).xyz;
	vec3 coeff_18_19_20 = texture(uTexCoeff_18_19_20, vTexCoord).xyz;
	vec3 coeff_21_22_23 = texture(uTexCoeff_21_22_23, vTexCoord).xyz;
	vec3 coeff_24_25_26 = texture(uTexCoeff_24_25_26, vTexCoord).xyz;

	// TODO DISCARD PIXELS

	coeff_0_1_2 = (coeff_0_1_2 - uCoeffScale012.x/255.0) * uCoeffBias012.x;
	coeff_3_4_5 = (coeff_3_4_5 - uCoeffScale012.y/255.0) * uCoeffBias012.y;
	coeff_6_7_8 = (coeff_6_7_8 - uCoeffScale012.z/255.0) * uCoeffBias012.z;
	coeff_9_10_11 = (coeff_9_10_11 - uCoeffScale345.x/255.0) * uCoeffBias345.x;
	coeff_12_13_14 = (coeff_12_13_14 - uCoeffScale345.y/255.0) * uCoeffBias345.y;
	coeff_15_16_17 = (coeff_15_16_17 - uCoeffScale345.z/255.0) * uCoeffBias345.z;
	coeff_18_19_20 = (coeff_18_19_20 - uCoeffScale678.x/255.0) * uCoeffBias678.x;
	coeff_21_22_23 = (coeff_21_22_23 - uCoeffScale678.y/255.0) * uCoeffBias678.y;
	coeff_24_25_26 = (coeff_24_25_26 - uCoeffScale678.z/255.0) * uCoeffBias678.z;


	vec3 L = (uLightInfo.w == 0.0) ? normalize(uLightInfo.xyz) : normalize(uLightInfo.xyz - gl_FragCoord.xyz);

	float phi = atan(L.y, L.x);
	if (phi < 0.0) phi = 2.0 * PI + phi;
	float theta = min(acos(L.z), PI / 2.0 - 0.15);
		
	float cosPhi = cos(phi);
	float cosTheta = cos(theta);
	float cosTheta2 = cosTheta * cosTheta;
	
	float hshBasis[9];
	hshBasis[0] = 1.0 / sqrt(2.0 * PI);
	hshBasis[1] = sqrt(6.0 / PI) * (cosPhi * sqrt(cosTheta-cosTheta2));
	hshBasis[2] = sqrt(3.0 / (2.0 * PI)) * (-1.0 + 2.0*cosTheta);
	hshBasis[3] = sqrt(6.0 / PI) * (sqrt(cosTheta - cosTheta2) * sin(phi));
	hshBasis[4] = sqrt(30.0 / PI) * (cos(2.0 * phi) * (-cosTheta + cosTheta2));
	hshBasis[5] = sqrt(30.0 / PI) * (cosPhi*(-1.0 + 2.0 * cosTheta) * sqrt(cosTheta - cosTheta2));
	hshBasis[6] = sqrt(5.0 / (2.0 * PI)) * (1.0 - 6.0 * cosTheta + 6.0 * cosTheta2);
	hshBasis[7] = sqrt(30.0 / PI) * ((-1.0 + 2.0 * cosTheta) * sqrt(cosTheta - cosTheta2) * sin(phi));
	hshBasis[8] = sqrt(30.0 / PI) * ((-cosTheta + cosTheta2) * sin(2.0*phi));

	vec3 linearColor =
		hshBasis[0] * coeff_0_1_2 +
		hshBasis[1] * coeff_3_4_5 +
		hshBasis[2] * coeff_6_7_8 +
		hshBasis[3] * coeff_9_10_11 +
		hshBasis[4] * coeff_12_13_14 +
		hshBasis[5] * coeff_15_16_17 +
		hshBasis[6] * coeff_18_19_20 +
		hshBasis[7] * coeff_21_22_23 +
		hshBasis[8] * coeff_24_25_26 ;
	
	bool doRenderCorrections = true;

	vec3 finalColor = doRenderCorrections ? pow(linearColor * uRenderCorrections.x, vec3(1.0/uRenderCorrections.y)) : linearColor;

	if(uDrawAnnotations) {
		vec4 annotColor = texture(uTexAnnot, vTexCoord);
		finalColor = (1.-annotColor.w) * finalColor + annotColor.w * annotColor.xyz;
	}

	fragColor = vec4(finalColor, fragmentAlpha) ;
}