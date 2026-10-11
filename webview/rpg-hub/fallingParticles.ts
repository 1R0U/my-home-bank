/**
 * 空から舞い落ちる物（花びら・落ち葉・雪。Issue #282）。
 * Issue #399 で webview/rpg-hub/scene.ts から切り出した。
 */
import { SEASON_PARTICLES } from "../../lib/rpg-hub/seasonalLook";
import type { Season } from "../../types/map";
import { toColor3 } from "./partMesh";

// Babylon UMD がグローバルに載せる名前空間（scene.ts と同じ理由で any で受ける）。
declare const BABYLON: any;

/**
 * 舞い落ちる物を出すかどうか。
 * 低スペック端末で重い場合にすぐ止められるよう、影（lighting.ts の SHADOW_ENABLED）と同じく1か所にまとめてある。
 */
const FALLING_PARTICLES_ENABLED = true;

/** 舞い落ちる物を出す高さ。カメラに映る上端より高くして、画面の外から降らせる。 */
const PARTICLE_TOP = 9;

/**
 * 舞い落ちる物を出す範囲の半分の幅。プレイヤーを中心に、カメラに映る範囲を覆えればよい。
 * 広げるほど、同じ数を出しても画面に映る数が減る。
 */
const PARTICLE_AREA_HALF = 13;

/** 同時に出ている舞い落ちる物の上限。 */
const PARTICLE_CAPACITY = 400;

export type FallingParticles = {
  /** 舞い落ちる物を季節に合わせて切り替える。夏は止める */
  applySeason: (season: Season) => void;
  /** 映っている範囲の上から出すよう、出す位置を動かす。毎フレーム呼ぶ */
  follow: (x: number, z: number) => void;
};

/**
 * 舞い落ちる物を作る。`FALLING_PARTICLES_ENABLED` が false なら何もしないものを返す。
 * @param scene - Babylon のシーン
 */
export function createFallingParticles(scene: any): FallingParticles {
  const emitter = new BABYLON.Vector3(0, PARTICLE_TOP, 0);
  if (!FALLING_PARTICLES_ENABLED) {
    return { applySeason: () => {}, follow: () => {} };
  }

  const texture = new BABYLON.DynamicTexture("season-flake", { height: 32, width: 32 }, scene, false);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(16, 16, 2, 16, 16, 15);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  texture.hasAlpha = true;
  texture.update();

  const system = new BABYLON.ParticleSystem("season-particles", PARTICLE_CAPACITY, scene);
  system.particleTexture = texture;
  system.emitter = emitter;
  system.minEmitBox = new BABYLON.Vector3(-PARTICLE_AREA_HALF, 0, -PARTICLE_AREA_HALF);
  system.maxEmitBox = new BABYLON.Vector3(PARTICLE_AREA_HALF, 1, PARTICLE_AREA_HALF);
  system.updateSpeed = 1 / 60;
  system.minEmitPower = 1;
  system.maxEmitPower = 1;
  system.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
  // 花びらと落ち葉がくるくる回るように。雪は丸いので回っても見た目は変わらない
  system.minAngularSpeed = -2;
  system.maxAngularSpeed = 2;

  return {
    applySeason(season) {
      const settings = SEASON_PARTICLES[season];
      if (!settings) {
        system.stop();
        system.reset();
        return;
      }
      const first = toColor3(settings.colors[0]);
      const second = toColor3(settings.colors[1]);
      system.color1 = new BABYLON.Color4(first.r, first.g, first.b, 1);
      system.color2 = new BABYLON.Color4(second.r, second.g, second.b, 1);
      // 消える直前は透明にして、地面の中へ吸い込まれるように見せる
      system.colorDead = new BABYLON.Color4(second.r, second.g, second.b, 0);
      system.minSize = settings.size.min;
      system.maxSize = settings.size.max;
      system.direction1 = new BABYLON.Vector3(-settings.drift, -settings.fallSpeed, -settings.drift);
      system.direction2 = new BABYLON.Vector3(settings.drift, -settings.fallSpeed, settings.drift);
      // 地面（y = 0 付近）に届くまでの時間を寿命にする
      const lifetime = PARTICLE_TOP / settings.fallSpeed;
      system.minLifeTime = lifetime;
      system.maxLifeTime = lifetime;
      system.emitRate = settings.emitRate;
      // 前の季節の色のまま降っている物を残さない
      system.reset();
      system.start();
    },
    follow(x, z) {
      emitter.x = x;
      emitter.z = z;
    },
  };
}
