/**
 * Crab Cup rivals (UPDATE4_PLAN.md §5.4): three rival crabs drawn from their own race Worlds,
 * positioned relative to the player, with DOM name tags (no extra draw calls) and stumble / dash
 * reactions. Rivals use the low-detail crab without an outline to stay inside the draw-call budget.
 */
import * as THREE from 'three';
import { CFG } from '../config';
import type { Race, Racer } from '../sim/race';
import { type CrabDrive, type CrabSkin, BODY_SKINS, CRAB_SKINS, CrabModel } from './models/crab';
import type { HatKind } from './models/hats';
import type { Materials } from './materials';

interface RivalView {
  racer: Racer;
  crab: CrabModel;
  tag: HTMLElement;
  drive: CrabDrive;
  wasStumbling: boolean;
  wasDashing: boolean;
}

const _v = new THREE.Vector3();

export class Rivals {
  readonly group = new THREE.Group();
  private views: RivalView[] = [];
  private tags: HTMLElement;

  constructor(private mats: Materials, uiRoot: HTMLElement) {
    this.tags = document.createElement('div');
    this.tags.className = 'rival-tags';
    this.tags.setAttribute('aria-hidden', 'true');
    uiRoot.appendChild(this.tags);
  }

  /** Build crabs for a race (looks come from RIVALS: body skin id and hat). */
  setRace(race: Race | null, looks: Record<string, { body: string; hat: string }>, detail: boolean): void {
    this.clear();
    if (!race) return;
    for (const r of race.racers) {
      if (r.you) continue;
      const look = looks[r.id] ?? { body: 'sandy', hat: 'none' };
      const crab = new CrabModel(this.mats);
      crab.setDetail(detail);
      const skin = (BODY_SKINS.find((k) => k.id === look.body) ?? CRAB_SKINS[0]) as CrabSkin;
      crab.setSkin(skin, look.hat as HatKind);
      crab.root.rotation.y = Math.PI;
      this.group.add(crab.root);
      const tag = document.createElement('div');
      tag.className = 'rival-tag';
      tag.textContent = r.name;
      this.tags.appendChild(tag);
      this.views.push({ racer: r, crab, tag, drive: { running: true, grounded: true, vy: 0, vx: 0, speed: 0, crashT: -1, rider: false }, wasStumbling: false, wasDashing: false });
    }
  }

  clear(): void {
    for (const v of this.views) {
      this.group.remove(v.crab.root);
      v.tag.remove();
    }
    this.views = [];
  }

  get active(): boolean {
    return this.views.length > 0;
  }

  /** Per frame: place rivals relative to the player's interpolated distance, animate, move name tags. */
  update(dt: number, playerDist: number, playerX: number, camera: THREE.Camera, visible: boolean): void {
    this.group.visible = visible;
    this.tags.style.display = visible ? '' : 'none';
    if (!visible) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const v of this.views) {
      const w = v.racer.world;
      const p = w.player;
      const rel = w.dist - playerDist;
      let x = p.x;
      // never draw a rival through the player: nudge it aside when they share the spot
      if (Math.abs(rel) < 1.2 && Math.abs(x - playerX) < 1.0) x += x >= playerX ? 0.55 : -0.55;
      v.crab.root.position.set(x, p.y, -rel);
      // rivals right behind the player would sit in front of the camera: hide them until they catch up
      const show = rel > -3 && rel < 90;
      v.crab.root.visible = show;
      const d = v.drive;
      d.running = w.mode === 'running';
      d.grounded = p.grounded;
      d.vy = p.vy;
      // the rival faces away from the camera, so its left is the screen's right
      d.vx = -p.vx;
      d.speed = w.speed;
      d.magnet = w.power.kind === 'magnet';
      d.shield = w.power.kind === 'shield';
      d.rider = w.power.kind === 'rider';
      const stumbling = w.raceStumble > 0;
      if (stumbling && !v.wasStumbling) v.crab.bump();
      v.wasStumbling = stumbling;
      const dashing = w.dashT > 0;
      if (dashing && !v.wasDashing) v.crab.happy();
      v.wasDashing = dashing;
      if (w.mode === 'finished' && d.running === false && v.crab.root.visible) d.running = false;
      v.crab.update(dt, d);
      // name tag: above the crab, fades with distance
      _v.set(x, p.y + 1.9, -rel).project(camera);
      const onScreen = show && _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      v.tag.style.opacity = onScreen ? String(Math.max(0, Math.min(1, 1.2 - Math.abs(rel) / 50))) : '0';
      if (onScreen) v.tag.style.transform = `translate(${((_v.x + 1) / 2) * W}px, ${((1 - _v.y) / 2) * H}px) translate(-50%, -100%)`;
      v.tag.classList.toggle('dash', dashing);
    }
    void CFG;
  }
}
