import { DEFAULTS, saveSettings, loadBest } from './config.js';
import { MOUNTS } from './player.js';

// DOM glue: overlays, HUD, and the customize panel (inputs are declared in
// index.html with data-key attributes matching the settings object).

const $ = id => document.getElementById(id);

export class UI {
  constructor(settings, actions) {
    this.settings = settings;
    this.actions = actions; // { play, retry, quit, resume, pause, settingsChanged }

    $('btn-play').addEventListener('click', () => actions.play());
    $('btn-retry').addEventListener('click', () => actions.retry());
    $('btn-menu').addEventListener('click', () => actions.quit());
    $('btn-resume').addEventListener('click', () => actions.resume());
    $('btn-quit').addEventListener('click', () => actions.quit());
    $('btn-pause').addEventListener('click', () => actions.pause());
    $('btn-customize').addEventListener('click', () => this.showOnly('customize'));
    $('btn-customize-done').addEventListener('click', () => {
      this.showOnly('menu');
      this.refreshBest();
    });
    $('btn-reset-settings').addEventListener('click', () => {
      Object.assign(this.settings, DEFAULTS);
      saveSettings(this.settings);
      this.syncInputs();
      this.actions.settingsChanged();
    });

    this.bindInputs();
    this.syncInputs();
    this.refreshBest();
  }

  bindInputs() {
    for (const el of document.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      el.addEventListener('input', () => {
        if (el.type === 'checkbox') this.settings[key] = el.checked;
        else if (el.type === 'range') this.settings[key] = Number(el.value);
        else this.settings[key] = el.value;
        this.updateOutput(el);
        saveSettings(this.settings);
        this.actions.settingsChanged();
      });
    }
  }

  syncInputs() {
    for (const el of document.querySelectorAll('[data-key]')) {
      const v = this.settings[el.dataset.key];
      if (el.type === 'checkbox') el.checked = v;
      else el.value = v;
      this.updateOutput(el);
    }
  }

  updateOutput(el) {
    if (el.type !== 'range') return;
    const out = el.parentElement.querySelector('output');
    if (out) out.textContent = `×${Number(el.value).toFixed(2).replace(/0$/, '')}`;
  }

  refreshBest() {
    const best = loadBest();
    $('menu-best').textContent = best > 0 ? `best score ${best.toLocaleString()}` : '';
  }

  showOnly(id) {
    for (const ov of ['menu', 'customize', 'paused', 'gameover']) {
      $(ov).classList.toggle('hidden', ov !== id);
    }
    $('hud').classList.toggle('hidden', id !== null);
  }

  showGame() {
    for (const ov of ['menu', 'customize', 'paused', 'gameover']) $(ov).classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  updateHUD(dist, coins, score, mount) {
    $('hud-dist').textContent = `${Math.floor(dist)} m`;
    $('hud-coins').textContent = `● ${coins}`;
    $('hud-score').textContent = `score ${Math.floor(score).toLocaleString()}`;
    $('hud-mount').textContent = mount ? MOUNTS[mount].label : '';
  }

  showGameOver(stats, isBest) {
    $('go-title').textContent = stats.caught ? 'Buried by the avalanche!' : 'Wiped out!';
    $('go-dist').textContent = `${Math.floor(stats.dist)} m`;
    $('go-coins').textContent = stats.coins;
    $('go-tricks').textContent = Math.floor(stats.trickScore).toLocaleString();
    $('go-score').textContent = Math.floor(stats.score).toLocaleString();
    $('go-best').textContent = isBest
      ? '★ New best score! ★'
      : `best ${loadBest().toLocaleString()}`;
    this.showOnly('gameover');
    $('hud').classList.add('hidden');
  }
}
