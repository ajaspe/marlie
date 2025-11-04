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

uniform sampler2D uTexNormals;		// NORMALS
uniform sampler2D uTexKd;		// KD
uniform sampler2D uTexKs;		// KS
uniform sampler2D uTexGloss;		// GLOSS
uniform sampler2D uTexAnnot;	// ANNOTATIONS

uniform bool uLensPass;
uniform vec4 uLensInfo; // [PosX, PosY, Radius, Alpha]
uniform vec4 uLightInfo; // [x,y,z,w] (if .w==0 => Directional, if w==1 => Spot)

uniform vec2 uAlphaLimits;
uniform int uInputColorSpace; // 0: Linear; 1: sRGB

uniform bool uDrawAnnotations;
uniform int uRenderMode; // 0: Full
                         // 1: Monochromatic
						 // 2: Gooch
						 // 3: Normals
						 // 4: Kd // Diffuse component
						 // 5: Specular ((ks * ward) * NdotL))

uniform vec2 uEnhancementParams; // [Factor, LOD]
uniform vec2 uRenderCorrections; // [Brighness, Contrast]


vec3 getNormal(const in vec2 texCoord) {
	vec3 n = texture(uTexNormals, texCoord).xyz;
	n = 2. * n - vec3(1.);
	float norm = length(n);
	if(norm < 0.5) return NULL_NORMAL;
	else return n/norm;
}

vec3 getNormalFromLOD(const in vec2 texCoord, const in float lodLevel) {
	vec3 n = textureLod(uTexNormals, texCoord, lodLevel).xyz;
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


float ward(in vec3 V, in vec3 L, in vec3 N, in vec3 X, in vec3 Y, in float alpha) {

	vec3 H = normalize(V + L);

	float H_dot_N = dot(H, N);
	float sqr_alpha_H_dot_N = SQR(alpha * H_dot_N);

	if(sqr_alpha_H_dot_N < 0.00001) return 0.0;

	float L_dot_N_mult_N_dot_V = dot(L,N) * dot(N,V);
	if(L_dot_N_mult_N_dot_V <= 0.0) return 0.0;

	float spec = 1.0 / (4.0 * PI * alpha * alpha * sqrt(L_dot_N_mult_N_dot_V));
	
	//float exponent = -(SQR(dot(H,X)) + SQR(dot(H,Y))) / sqr_alpha_H_dot_N; // Anisotropic
	float exponent = -SQR(tan(acos(H_dot_N))) / SQR(alpha); // Isotropic
	
	spec *= exp( exponent );

	return spec;
}

vec3 gooch(vec3 color, float shine, vec3 L, vec3 N, vec3 V) {
    
	//diffuse
    const float a = 0.8;
    const float b = 0.8;
	const vec3 warmColor = vec3(0.2,0.,0.);
	const vec3 coolColor = vec3(0.,0.,0.2);

    float NdotL = dot(N, L);
    float it = ((1.0 + NdotL) / 2.);

   vec3 coolColorMod = coolColor + color * a;
   vec3 warmColorMod = warmColor + color * b;

    vec3 newcolor = mix(coolColorMod, warmColorMod, it);
    
    //Highlights
    vec3 R = reflect(-L, N);
    float ER = clamp( dot(V, R), 0.0, 1.0);
    vec3 spec = vec3(1.) * pow(ER, shine);
	
    return newcolor + spec;
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

	vec3 N = getNormal(vTexCoord);
	if(N == NULL_NORMAL) {
		if(uDrawAnnotations) {
			vec4 annotColor = texture(uTexAnnot, vTexCoord);
			fragColor = vec4(annotColor.w * annotColor.xyz, fragmentAlpha);
		} else fragColor = vec4(0.0);
		return;
	}
	
	vec3 L = (uLightInfo.w == 0.0) ? normalize(uLightInfo.xyz) : normalize(uLightInfo.xyz - gl_FragCoord.xyz);
	vec3 V = vec3(0.0,0.0,1.0);
    vec3 H = normalize(L + V);

	if(uEnhancementParams[0] > 0.001)
		N = normalize(N + uEnhancementParams.x * (N - getNormalFromLOD(vTexCoord, uEnhancementParams.y)));
    
	float NdotL = max(dot(N,L),0.0);


	vec3 kd = vec3(.9,.9,.9);
	vec3 ks = vec3(.05,.05,.05);
	float gloss = .0;
	float alpha = .3;

	if(uRenderMode != 1) { // So no monochromatic
		kd = texture(uTexKd, vTexCoord).xyz;
		ks = texture(uTexKs, vTexCoord).xyz;
		if(uInputColorSpace == 1) {
			kd = sRGB2Linear(kd);
			ks = sRGB2Linear(ks);
		}
		gloss = texture(uTexGloss, vTexCoord).x;
		float minGloss = 1.0 - pow(uAlphaLimits[1], 1.0 / ISO_WARD_EXPONENT);
		float maxGloss = 1.0 - pow(uAlphaLimits[0], 1.0 / ISO_WARD_EXPONENT);
		alpha = pow(1.0 - gloss * (maxGloss - minGloss) - minGloss, ISO_WARD_EXPONENT);
	}

	kd /= PI;

    vec3 e = vec3(0.0,0.0,1.0);
    vec3 T = normalize(cross(N,e));
    vec3 B = normalize(cross(N,T));
	float spec = ward(V, L, N, T, B, alpha);
	vec3 linearColor = (kd + ks * spec) * NdotL;

	linearColor += kd * 0.02; // HACK! adding just a bit of ambient
	
	bool doRenderCorrections = true;

	if (uRenderMode == 2) { // Gooch
		linearColor = gooch(linearColor, 20., L, N, V);
	} else if (uRenderMode == 3) { // Normals
		linearColor = (N+vec3(1.))/2.;
		doRenderCorrections = false;
	} else if (uRenderMode == 4) { // Difuse component (Kd)
		linearColor = kd; 
	} else if (uRenderMode == 5) { // Specular component
		linearColor = clamp((ks * spec) * NdotL, 0.0, 1.0); // specular component
	}

	vec3 finalColor = doRenderCorrections ? pow(linearColor * uRenderCorrections.x, vec3(1.0/uRenderCorrections.y)) : linearColor;

	if(uDrawAnnotations) {
		vec4 annotColor = texture(uTexAnnot, vTexCoord);
		finalColor = (1.-annotColor.w) * finalColor + annotColor.w * annotColor.xyz;
	}

	fragColor = vec4(finalColor, fragmentAlpha) ;
}