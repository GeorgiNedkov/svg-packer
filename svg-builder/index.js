import { MaxRectsPacker } from "maxrects-packer";
import * as fs from "fs";
import sharp from "sharp";
import path from "path";
import { DOMParser, XMLSerializer } from "xmldom";

const inputDir = "./svgs";

const padding = 2;
const maxWidth = 4096;
const maxHeight = 4096;

const packer = new MaxRectsPacker(maxWidth, maxHeight, padding, {
  smart: true,
  pot: false,
  border: padding,
  allowRotation: false,
});

let finalTextureData = { width: 0, height: 0 };
const files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".svg"));
const textureDatas = await Promise.all(
  files.map(async (file) => {
    const pathToFile = path.resolve(inputDir, file);
    let sharpImg = await sharp(pathToFile).png();
    const metaData = await sharpImg.metadata();
    const res = await sharpImg
      .trim({
        threshold: 0,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer({ resolveWithObject: true })
      .catch((error) => {
        console.error(file, error);

        return { data: null, info: null };
      });

    const info = res.info;

    return {
      originalWidth: metaData.width,
      originalHeight: metaData.height,
      width: info?.width ?? metaData.width,
      height: info?.height ?? metaData.height,
      trimOffsetLeft: -(info?.trimOffsetLeft ?? 0),
      trimOffsetTop: -(info?.trimOffsetTop ?? 0),
      path: pathToFile,
      trimmed: true,
    };
  })
);
textureDatas.forEach((textureData, i) => {
  packer.add({
    width: textureData.width,
    height: textureData.height,
    path: textureData.path,
    textureData,
  });
});
// calc w and h
{
  let width = 0;
  let height = 0;

  for (let j = 0; j < packer.rects.length; j++) {
    const rect = packer.rects[j];

    width = Math.max(width, rect.x + rect.width);
    height = Math.max(height, rect.y + rect.height);
  }

  height += padding ?? 0;
  width += padding ?? 0;

  finalTextureData = { width, height };
}

const bins = packer.bins;
const svgTextures = [];
for (let i = 0; i < bins.length; i++) {
  let mergedSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${finalTextureData.width}" height="${finalTextureData.height}" viewBox="0 0 ${finalTextureData.width} ${finalTextureData.height}">\n`;
  const bin = bins[i];

  for (let j = 0; j < bin.rects.length; j++) {
    const rect = bin.rects[j];

    const rawSVG = fs.readFileSync(rect.textureData.path, "utf8");
    const doc = new DOMParser().parseFromString(rawSVG, "image/svg+xml");
    const svgEl = doc.documentElement;

    let gAttrs = "";
    for (let i = 0; i < svgEl.attributes.length; i++) {
      const attr = svgEl.attributes[i];
      const skipAttrs = new Set(["width", "height", "viewBox"]);
      if (!skipAttrs.has(attr.name)) gAttrs += ` ${attr.name}="${attr.value}"`;
    }

    let inner = "";
    for (let i = 0; i < svgEl.childNodes.length; i++) {
      const node = svgEl.childNodes[i];
      inner += new XMLSerializer().serializeToString(node);
    }

    const x = rect.x - rect.textureData.trimOffsetLeft;
    const y = rect.y - rect.textureData.trimOffsetTop;

    mergedSVG += `<g transform="translate(${x},${y})"${gAttrs}>${inner}</g>\n`;
  }
  mergedSVG += `</svg>`;

  svgTextures.push(mergedSVG);
}

export function createJsons(packer, width, height, options) {
  const bins = packer.bins;

  const jsons = [];

  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];

    const json = {
      frames: {},
    };

    for (let j = 0; j < bin.rects.length; j++) {
      const rect = bin.rects[j];

      json.frames[path.basename(rect.path)] = {
        frame: {
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
        },
        rotated: rect.rot,
        trimmed: rect.textureData.trimmed,
        spriteSourceSize: {
          x: rect.textureData.trimOffsetLeft,
          y: rect.textureData.trimOffsetTop,
          w: rect.width,
          h: rect.height,
        },
        sourceSize: {
          w: rect.textureData.originalWidth,
          h: rect.textureData.originalHeight,
        },
      };
    }

    json.meta = {
      app: "",
      version: "1.0",
      image: `svgAtlas-${i}.svg`,
      format: "RGBA8888",
      size: {
        w: width,
        h: height,
      },
      scale: 1,
      related_multi_packs: null,
    };

    jsons.push({
      name: `svgAtlas-${i}.json`,
      json,
    });
  }

  // before we leave, lets connect all the jsons to the first json..

  const firstJsonMeta = jsons[0].json.meta;

  firstJsonMeta.related_multi_packs = [];

  for (let i = 1; i < jsons.length; i++) {
    firstJsonMeta.related_multi_packs.push(jsons[i].name);
  }

  return jsons;
}

console.error("|-----");

const jsons = createJsons(packer, maxWidth, maxHeight, {});
jsons.forEach((j, i) => {
  fs.writeFileSync(`svgAtlas-${i}.json`, JSON.stringify(j.json));
});

svgTextures.forEach((svg, i) => {
  fs.writeFileSync(`svgAtlas-${i}.svg`, svg);
});

console.error(svgTextures.length, jsons.length);
