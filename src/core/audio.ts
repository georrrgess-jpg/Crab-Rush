/** Audio facade. Filled in at milestone M4 (synthesised SFX + music). */
export type Sfx =
  | 'shell' | 'bigShell' | 'lane' | 'hop' | 'land' | 'slam' | 'bump' | 'crash' | 'powerup' | 'shieldPop'
  | 'rider' | 'closeShave' | 'goal' | 'newBest' | 'zone' | 'tap' | 'purchase' | 'countdown' | 'go' | 'milestone' | 'deny';

export class Audio {
  unlocked = false;
  musicVolume = 0.5;
  sfxVolume = 0.8;
  unlock(): void {
    this.unlocked = true;
  }
  play(_s: Sfx, _opt?: { streak?: number; pan?: number }): void {}
  setMusicMode(_m: 'menu' | 'run' | 'off'): void {}
  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
  }
  suspend(): void {}
  resume(): void {}
}
