# M.A.RL.I.E (Multilayered Annotated ReLighting Images Explorer)

M.A.RL.I.E is a web software that allows real-time exploration of multiple-layered,
image-based objects. They can have a geometric description and be dynamically
relighted using an analytical material-light interaction model called Ward.
Moreover, it support multiresolution annotations, lens methafor for inspection,
BRDF picking, geometry enhancement, achromatic rendering, etc. and it is completly
configurable. It supports both mouse and touch input, and it is able to adapt its
layout to multiple devices (such smartphones, tablets, desktops, etc.).

Check out the **[ON-LINE DEMO](https:\\albertojaspe.net\demos\marlie)**.

## Publications

M.A.RL.I.E is as well a demostrative software of the papers:

* [Web-based Multi-layered Explorationof Annotated Image-based Shape and Material Models](https://albertojaspe.net/publications/2019-GCH-marlie.html)  
by Alberto Jaspe-Villanueva, Ruggero Pintus, Andrea Giachetti, and Enrico Gobbetti.  
Presented at EuroGraohics Workshop of Graphics for Cultural Heritage 2019.

* [Web-based Exploration of Annotated Multi-Layered Relightable Image Models](https://albertojaspe.net/publications/2021-JOCCH-marlie.html)  
by Alberto Jaspe-Villanueva, Moonisa Ahsan, Ruggero Pintus, Andrea Giachetti, Fabio Marton, and Enrico Gobbetti.  
Extension of the first one on the ACM Journal of Computing and Cultural Heritage, May 2021.

## Installation & requirements

This software is written in Javascript ES6 and HTML5. It is intended to be run in a modern web browser. It uses [Bootstrap](https://getbootstrap.com/) for the interface, [gl-matrix](http://glmatrix.net) for some of the maths and WebGL2 for the rendering. It uses JSON files for its configuration, and it is distributed with a test dataset in order to illustrate its use. It requires a web server and a modern web browser (such as Chrome or Firefox) to run, as well as a graphic card with OpenGL ES 3.0 capabilities.

## URL parameters
* `advanced=[0,1]` for the switch to the advanced interface
* `ds=dataset_path` for poiting directly to one dataset of the ddbb
* `dsdb=db_path` to point a different dataset DB JSON config file (default is "datasets_db.json")

Example: `http://myserver.net/marlie/?advanced=1&ds=data/ghiberti_ptm&dsdb=custom_db.json`

## Annotation pyramid builder
A tool for building the annotation pyramid is provided within the package. It uses NodeJS and requires the jimp package. It takes a set of transparent annotation patches in a directory, with the specifical filename convention `level_x_y_width_height_descript.png` and creates the pyramid inside another directory. It requires the original resolution sizes of the datasets. Read the paper for more details.

For setting it up, run `npm install` inside the tool directory (tools/annot_builder). Run it without arguments for see the options:

Usage: `node annot_builder patchsFolder outputFolder fullWidth fullHeight`
filename format: `level_x_y_width_height_descript.png` (coords ref to full size)

## Dataset specification & config
### Layers specification
Every layer has a set of images that define its properties, and all of them must have the same dimensions.

### SVBRDF Ward model
The shape of the object is defined with a normal map, encoded as an RGB image so that N = 2 * (RGB) - vec3(1). The resulting vector N must be unitary, otherwise that pixel will be discarded.

The appearance of the object is defined by three maps, which encode the following parameters of a Ward BRDF model:
 * `kd`: albedo, encoded with RGB, linear or sRGB.
 * `ks`: specular color, encoded with RGB, linear or sRGB.
 * `gloss`: a glossiness parameter, encoded with one channel (RGB valid too, will take only the Red channel). It is transformed to the alpha parameter of the original Ward formula using the following function.
 * 

	float glossToAlpha(gloss, alphaLimits) {
		ISO_WARD_EXPONENT = 4.0;
		minGloss = 1.0 - pow(alphaLimits.max, 1.0 / ISO_WARD_EXPONENT);
		maxGloss = 1.0 - pow(alphaLimits.min, 1.0 / ISO_WARD_EXPONENT);
		alpha = pow(1.0 - gloss * (maxGloss - minGloss) - minGloss, ISO_WARD_EXPONENT);
		return alpha;
	}

The `rti_shader` for this type of model is configured this way:

	"rti_shader": {
		"type": "SVBRDF",
		"alphaLimits": [0.01, 0.5],
		"inputColorSpace": "linear"
	}

The layer maps for this type of model is configured this way:

	"maps": {
	"normals": "normalMap.jpg",
	"kd": "kdMap.jpg",
	"ks": "ksMap.jpg",
	"gloss": "glossMap.jpg"
	}

### LRGB PTM model
[Polynomial Texture Maps](https://www.hpl.hp.com/research/ptm/papers/ptm.pdf) are supported in its LRGB format. The rti_shader for this type of model is configured this way:

	"rti_shader": {
		"type": "LRGB_PTM",
		"scale":[2,2,2,2,2,2],
		"bias":[164,166,101,87,78,0]
	}

The layer maps for this type of model is configured this way:

	"maps": {
	"normals": "normal_map.png",
	"coeff_0_1_2": "ghiberti_L100.png",
	"coeff_3_4_5": "ghiberti_L101.png",
	"coeff_6_7_8": "ghiberti_L102.png"
	}

### Annotations
For the multiresolution annotation, we use an image pyramid. The base has the same resolution of the other maps, while for the upper levels, the height and width of each image is the half of the previous level. There is no need to define the whole set of images, and you can define how many levels are present. The image file for each level is expected to be named `file_name = ${file_prefix}${level}${file_postfix}`, where the prefix and postfix are defined in the configuration file, and the level starts at zero. You must also define a set of tuples (`title`, `info`) that define the text displayed when an annotation is rendered.

### Config file
Every dataset have also a configuration file called "viewer_config.json" that defines presets (or "option") to be shown, both for the base render and for the lens.

	{
		"name":"Test",
		"info": "HTML text describing this dataset",
		"dimensions": [2048, 1280],
		"alphaLimits": [0.01, 0.5],
		"inputColorSpace": "linear",
		"layers": [
			{
				"name": "Layer 1",
				"maps": {
					"normals": "normals.jpg",
					"kd": "layer1/kd.jpg",
					"ks": "layer1/ks.jpg",
					"gloss": "layer1/gloss.jpg"
				},
				"annotations": {
					"file_prefix": "annot/annot_",
					"file_postfix": ".png",
					"n": 3,
					"infos": [
						["First level of annotations", "A description of the layer with HTML embed."],
						["Second level of annotations", "A description of the layer with HTML embed."],
						["Third level of annotations", "A description of the layer with HTML embed."]
					]
				}
			},
			{
				"name": "Layer 2",
				"maps": {
					"normals": "normals.jpg",
					"kd": "layer2/kd.jpg",
					"ks": "layer2/ks.jpg",
					"gloss": "layer2/gloss.jpg"
				}
			}
		]
	}

## Viewer Configuration
The "test" dataset in the software distribution shows the usage of MARLIE.

### Dataset database
In the root folder you can find a configuration file called "datasets_db.json" with tuples of datasets to be listed in the interface:

	{
		"Dataset 1": "data/dataset1",
		"Dataset 2": "data/dataset2",
		"And this is dataset 3": "otherpath/dataset3"
	}

### Presets per dataset
Each dataset has also a configuration file called `viewer_config.json` that defines presets (or "option") to be shown, both for the base render and for the lens. These options are combinations of one layer with some render parameters. The layer is defined with its position in the datasets's config.json file, starting with zero. Moreover, some parameters can be set as default for all the options, and can be overwritten inside every preset.

The render parameters currently supported are:

* `renderMode`: Different renders of the relighting:
	* `0`: Standard Ward relighting
	* `1`: Achromatic relighting
	* `2`: Gooch illustrative rendering
	* `3`: Normal map (no lighting)
	* `4`: Albedo (Kd, no lighting)
	* `5`: Only specular lighting (`(ks * ward) * NdotL)`)
* `enhancementK`: amount of geometry enhancement [>0]
* `enhancementLOD`: radius of neighborhood to compute [1-10]
* `brightness`: multiplyer of final pixel value [>0]
* `gamma`: gamma exponent correction (normally 2.2)

This is an example "viewer_config.json" file for a dataset:

	{
		"defaultParams": {
			"renderMode": 0,
			"enhancementK": 0.0,
			"enhancementLOD": 1.0,
			"brightness": 2.0,
			"gamma": 2.0
		},
		"baseOptions": [
			{
				"name": "First layer",
				"info": "This is just an example of a possible layer.",
				"layer": 0
			},
			{
				"name": "Second layer with only specular and low gamma",
				"info": "This is just another example of another possible layer, modifying a parameter",
				"layer": 1
				"params": {
					"renderMode": 5,
					"gamma": 1.8
				}
			}
		],
		"lensOptions": [
			{
				"name": "Second layer achromatic with enhanced geometry",
				"info": "Info of this lens layer with HTML embed",
				"layer": 1,
				"params": {
					"renderMode": 1,
					"enhancementK": 2.27,
					"enhancementLOD": 2.66,
				}
			},
			{
				"name": "Normal map brighty",
				"info": "Info of this lens layer with HTML embed",
				"layer": 0,
				"params": {
					"renderMode": 3,
					"brightness": 3.5
				}
			},
			{
				"name": "Simple second layer",
				"info": "Info of this lens layer with HTML embed",
				"layer": 0
			}
		]
	}


## Version history

* v2.0 - Released 07/07/2020
	* An advanced interface for:
		- Tweaking render parameters
		- Preset creation
		- Framed screenshot for overdrawing annotation
		- A simple online annotation tool
	* A NodeJS tool for building the annotation pyramid from a set of transparent patches
	* LRGB PTM shader and HSH example shaders
	* Minor fixes
  
* v1.0 - Released 01/11/2019
	* First release with the features described in the original GCH 2019 paper.

## Acknowledgment
This project has been developed at the Visual Computing Group, CRS4.
The project received funding from Sardinian Regional Authorities under projects VIGECLAB and TDM (POR FESR 2014-2020 Action 1.2.2)

## Contact
For technical details or bug reports contact Alberto Jaspe at ajaspe@gmail.com.
