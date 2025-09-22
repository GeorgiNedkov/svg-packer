import { Application, Assets, Sprite } from "pixi.js";

(async () => {
  const app = new Application();
  await app.init({ background: "#13bb10ff", width: 1920, height: 1080 });
  const canvas = app.canvas;
  document.getElementById("pixi-container")!.appendChild(canvas);

  Assets.add({
    alias: "svg_atlas",
    src: "assets/svgAtlas-0.json",
  });

  await Assets.load(["svg_atlas"]);

  const s3 = Sprite.from("weighing-scale-svgrepo-com.svg");

  app.stage.addChild(s3);
})();
