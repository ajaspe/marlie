const fs = require('fs');
const jimp = require('jimp');

function getPatches() {
  let patches = [];
  fs.readdirSync(inDir).forEach(file => {
    const k = file.split("_");
    if(k.length<5) return;
    const levScale = 1/Math.pow(2,k[0]);
    let patch = {
      "file": file,
      "level": parseInt(k[0]),
      "x": parseInt(k[1])*levScale,
      "y": parseInt(k[2])*levScale,
      "w": parseInt(k[3])*levScale,
      "h": parseInt(k[4])*levScale,
      "info": k[5].split(".")[0]
    };

    for(let i=patches.length; i<patch.level+1; i++)
      patches.push([]);

    patches[patch.level].push(patch);
    console.log(`  - Lev ${patch.level} (${patch.x}, ${patch.y}) [${patch.w} x ${patch.h}] ${patch.info}`);
  });
  return patches;
}

function genPyramid(width, height, levels) {
  let pyramid = new Array(levels);
  for(let i=0; i<levels; i++) {
    const w = Math.floor(width/Math.pow(2, i));
    const h = Math.floor(height/Math.pow(2, i));
    pyramid[i] = new jimp(w, h);
  }
  return pyramid;
}

function writePyramid(pyramid) {
  for(let lev = 0; lev<nLevels; lev++)  {
    console.log(`  - Writing annot_${lev}.png  [${pyramid[lev].bitmap.width} x ${pyramid[lev].bitmap.height}]`);
    pyramid[lev].write(`${outDir}/annot_${lev}.png`);
  }
}

function patchPyramid(patches, pyramid, nLevels) {
  let res = [];
  for(let lev = 0; lev<nLevels; lev++)  {
    for(let patch of patches[lev]) {
      res.push(jimp.read(`${inDir}/${patch.file}`).then(image => {
        console.log(`  - Processing ${patch.file}`);
        pyramid[lev].composite(image.resize(patch.w, patch.h), patch.x, patch.y, {
          mode: jimp.BLEND_SOURCE_OVER,
          opacitySource: 1.0,
          opacityDest: 1.0
        });
      }));
    }
  }
  return res;
}

if(process.argv.length<6) {
  console.warn(`Usage: node annot_builder patchsFolder outputFolder fullWidth fullHeight`);
  console.warn('Patch filename format: level_x_y_width_height_descript.png (coords ref to full size)');
  return;
}

const inDir = process.argv[2];
const outDir = process.argv[3];
const origWidth = process.argv[4];
const origHeight = process.argv[5];

console.log(`* Collecting patches from "${inDir}":`);
const patches = getPatches(inDir);
const nLevels = patches.length;
let pyramid = genPyramid(origWidth, origHeight, nLevels);
console.log("* Loading & processing patches:");
const loads = patchPyramid(patches, pyramid, nLevels);
Promise.all(loads).then(() => {
  console.log(`* Writing pyramid files in "${outDir}"`);
  writePyramid(pyramid);
  console.log("* Done!");
});
