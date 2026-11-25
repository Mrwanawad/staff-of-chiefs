#!/usr/bin/env node
// Draws the staff-of-chiefs chef bots as SVG.
//
//   node assets/make-art.js
//
// Writes assets/kitchen.svg (the animated README hero), assets/chef-<tier>.svg (one bot each,
// plus a -still variant without animation)
// and assets/icon.svg (the plugin icon source). Colours match the terminal status line tiers.
'use strict';
const fs = require('fs');
const path = require('path');

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const TIERS = {
  lead:   { color: '#ffc861', dark: '#b9852a', name: 'lead',   role: 'main session · core code' },
  fable:  { color: '#d787ff', dark: '#9256b8', name: 'fable',  role: 'plans · architecture' },
  opus:   { color: '#ff8a3d', dark: '#b85a1e', name: 'opus',   role: 'review · hard bugs' },
  sonnet: { color: '#3fd2ff', dark: '#1f8fb3', name: 'sonnet', role: 'tests · docs · config' },
  haiku:  { color: '#5fef8a', dark: '#2f9e55', name: 'haiku',  role: 'search · scouting' },
};

const spin = (vals, dur, begin = '0s') =>
  `<animateTransform attributeName="transform" type="rotate" values="${vals}" dur="${dur}" begin="${begin}" repeatCount="indefinite" additive="sum" calcMode="spline" keySplines="${Array(vals.split(';').length - 1).fill('.45 0 .55 1').join(';')}"/>`;
const hop = (vals, dur, begin = '0s') =>
  `<animateTransform attributeName="transform" type="translate" values="${vals}" dur="${dur}" begin="${begin}" repeatCount="indefinite" additive="sum" calcMode="spline" keySplines="${Array(vals.split(';').length - 1).fill('.45 0 .55 1').join(';')}"/>`;

function hat(tall = 0) {
  return `<g class="hat">
    ${tall ? `<rect x="-22" y="${-88 - tall}" width="44" height="${tall + 2}" fill="#f7f7f4"/>` : ''}
    <path transform="translate(0 ${-tall})" d="M-25 -86 C-44 -88 -44 -118 -22 -116 C-20 -138 20 -138 22 -116 C44 -118 44 -88 25 -86 Z" fill="#f7f7f4" stroke="#d6dae2" stroke-width="2"/>
    <path transform="translate(0 ${-tall})" d="M-8 -118 C-6 -126 6 -126 8 -118" fill="none" stroke="#d6dae2" stroke-width="2" stroke-linecap="round"/>
    <rect x="-27" y="-89" width="54" height="16" rx="4" fill="#ffffff" stroke="#d6dae2" stroke-width="2"/>
  </g>`;
}

function face(t, blinkBegin) {
  const eye = cx => `<ellipse cx="${cx}" cy="-47" rx="4.6" ry="5.6" fill="#eaf6ff">
      <animate attributeName="ry" values="5.6;5.6;.6;5.6" keyTimes="0;.9;.95;1" dur="4.2s" begin="${blinkBegin}" repeatCount="indefinite"/></ellipse>`;
  return `<rect x="-36" y="-74" width="72" height="80" rx="18" fill="${t.color}"/>
    <rect x="-36" y="-74" width="72" height="80" rx="18" fill="url(#shine)"/>
    <rect x="-26" y="-63" width="52" height="33" rx="10" fill="#0b1220"/>
    ${eye(-11)}${eye(11)}
    <path d="M-6 -38 Q0 -33 6 -38" fill="none" stroke="#eaf6ff" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="-19" cy="-37" r="3" fill="${t.color}" opacity=".55"/><circle cx="19" cy="-37" r="3" fill="${t.color}" opacity=".55"/>
    <path d="M-14 -24 L14 -24 L0 -12 Z" fill="#e8665c"/><circle cx="0" cy="-23" r="3.4" fill="#c94c43"/>`;
}

const arm = (t, d) => `<path d="${d}" fill="none" stroke="${t.dark}" stroke-width="9" stroke-linecap="round"/>`;
const hand = (t, x, y) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${t.dark}"/>`;
const knife = `<rect x="-9" y="-4" width="17" height="9" rx="3" fill="#5b3a29"/>
  <path d="M8 -5 L46 -1 Q47 5 41 6 L8 6 Z" fill="#d7dde6"/><path d="M8 -5 L46 -1 L44 1 L8 -1 Z" fill="#ffffff" opacity=".7"/>`;

// Each tool is drawn in the bot's local space; (0,0) is the bot's spot on the counter top.
const TOOLS = {
  lead(t) { // holds up the order ticket and calls the plan
    return `${arm(t, 'M-34 -34 Q-46 -20 -42 -6')}${hand(t, -42, -6)}
      <g transform="translate(46 -58)">${spin('-8;6;-8', '2.4s')}
        ${arm(t, 'M-12 26 Q-2 14 0 0')}
        <rect x="-4" y="-34" width="30" height="38" rx="2" fill="#fbf6e9" stroke="#d8cfb8"/>
        <rect x="1" y="-28" width="20" height="3" fill="#8e99ae"/><rect x="1" y="-21" width="14" height="3" fill="#8e99ae"/>
        <rect x="1" y="-14" width="18" height="3" fill="#8e99ae"/><rect x="1" y="-7" width="10" height="3" fill="${t.dark}"/>
        ${hand(t, 0, 0)}</g>`;
  },
  fable(t) { // clipboard plan; the steps tick off one by one
    const tick = (y, k) => `<path d="M-50 ${y} l3 3 l6 -7" fill="none" stroke="#2f9e55" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${(0.15 + k * 0.2).toFixed(2)};${(0.2 + k * 0.2).toFixed(2)};.92;1" dur="4.8s" repeatCount="indefinite"/></path>`;
    return `<g>${spin('0 -40 -30;-4 -40 -30;0 -40 -30', '3.2s')}
        <rect x="-60" y="-58" width="38" height="50" rx="3" fill="#f4ecd8" stroke="#cdbf9f"/>
        <rect x="-49" y="-62" width="16" height="7" rx="2" fill="#6b5a3e"/>
        ${[-46, -34, -22].map((y, k) => `<rect x="-38" y="${y - 2}" width="12" height="3" fill="#8e99ae"/>${tick(y, k)}`).join('')}
        ${arm(t, 'M-34 -36 Q-44 -30 -46 -22')}${hand(t, -46, -22)}</g>
      <g transform="translate(40 -40)">${spin('0;-14;0', '1.6s')}
        ${arm(t, 'M-6 6 Q2 -2 6 -14')}
        <rect x="3" y="-34" width="5" height="22" rx="2" fill="#9256b8" transform="rotate(18 6 -14)"/>${hand(t, 6, -14)}</g>`;
  },
  opus(t) { // chops a carrot on the board
    return `<rect x="-6" y="-8" width="96" height="9" rx="3" fill="#b98552"/><rect x="-6" y="-8" width="96" height="3" rx="2" fill="#d9a46d"/>
      <rect x="54" y="-18" width="30" height="10" rx="5" fill="#ff8a3d"/>
      <path d="M84 -14 l10 -8 M84 -13 l12 -2 M84 -12 l9 5" stroke="#3faa5a" stroke-width="3" stroke-linecap="round"/>
      ${[0, 1, 2].map(k => `<ellipse cx="${20 + k * 10}" cy="-11" rx="4" ry="2.6" fill="#ffa25e"/>`).join('')}
      ${arm(t, 'M-34 -34 Q-40 -18 -30 -10')}${hand(t, -30, -10)}
      ${arm(t, 'M34 -34 Q44 -26 46 -18')}
      <g transform="translate(46 -18)">${spin('0;-32;0', '.62s')}${knife}${hand(t, 0, 0)}</g>
      <g opacity="0"><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.45;.55;1" dur=".62s" repeatCount="indefinite"/>
        <path d="M58 -30 l-4 -6 M66 -32 l0 -7 M74 -30 l4 -6" stroke="#ffe2b0" stroke-width="2" stroke-linecap="round"/></g>`;
  },
  sonnet(t) { // whisks a bowl
    return `${arm(t, 'M-34 -34 Q-44 -20 -36 -10')}${hand(t, -36, -10)}
      ${arm(t, 'M34 -34 Q40 -50 22 -62')}
      <g transform="translate(18 -62)">${spin('-16;16;-16', '.5s')}
        <rect x="-2.5" y="-4" width="5" height="22" rx="2" fill="#6a7a8c"/>
        <path d="M0 18 C-12 26 -10 40 0 40 C10 40 12 26 0 18 M0 18 C-5 28 -4 38 0 40 C4 38 5 28 0 18" fill="none" stroke="#d7dde6" stroke-width="2"/>
        ${hand(t, 0, 0)}</g>
      <ellipse cx="18" cy="-24" rx="34" ry="5" fill="#c9d6e3"/>
      <ellipse cx="18" cy="-24" rx="28" ry="3.2" fill="#fff4d6"/>
      <path d="M-16 -24 A34 22 0 0 0 52 -24 Z" fill="#9fb3c8"/><path d="M-10 -18 A30 14 0 0 0 20 -6" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>`;
  },
  haiku(t) { // scouts with a magnifying glass
    return `${arm(t, 'M-34 -34 Q-44 -22 -38 -10')}${hand(t, -38, -10)}
      <g transform="translate(40 -48)">${spin('-10;14;-10', '1.8s')}
        ${arm(t, 'M-6 18 Q2 8 4 0')}
        <path d="M4 0 L-2 -10" stroke="#5b3a29" stroke-width="6" stroke-linecap="round"/>
        <circle cx="-8" cy="-22" r="13" fill="#8cc4ff" fill-opacity=".28" stroke="#d7dde6" stroke-width="4"/>
        <path d="M-15 -27 Q-11 -31 -6 -30" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>
        ${hand(t, 4, 0)}</g>`;
  },
};

function bot(tier, { tall = 0, blink = '0s', bob = '2.6s', bobBegin = '0s', hopH = 3 } = {}) {
  const t = TIERS[tier];
  return `<g>${hop(`0 0;0 ${-hopH};0 0`, bob, bobBegin)}
      ${hat(tall)}${face(t, blink)}${TOOLS[tier](t)}</g>`;
}

const DEFS = `<defs>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a63"/><stop offset="1" stop-color="#1b263a"/></linearGradient>
    <pattern id="tiles" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#0b1426"/><path d="M40 0H0V40" fill="none" stroke="#14223d" stroke-width="2"/></pattern>
    <radialGradient id="glow" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#1b2f55" stop-opacity=".9"/><stop offset="1" stop-color="#0b1426" stop-opacity="0"/></radialGradient>
  </defs>`;

function kitchen() {
  const W = 960, H = 390, TOP = 292;
  const spots = [
    ['haiku', 110, { blink: '.4s', bob: '.9s', hopH: 7 }],
    ['sonnet', 290, { blink: '1.7s', bob: '2.2s' }],
    ['lead', 480, { tall: 22, blink: '2.9s', bob: '3s' }],
    ['opus', 670, { blink: '.9s', bob: '2.4s', bobBegin: '.3s' }],
    ['fable', 850, { tall: 8, blink: '2.2s', bob: '3.4s' }],
  ];
  const tickets = [130, 230, 330, 610, 710, 810].map((x, k) => `<g transform="translate(${x} 34)">${spin(`${k % 2 ? 3 : -3};${k % 2 ? -3 : 3};${k % 2 ? 3 : -3}`, `${2.8 + k * 0.3}s`)}
      <rect x="-15" y="0" width="30" height="40" rx="2" fill="#fbf6e9" opacity=".92"/><rect x="-6" y="-3" width="12" height="6" rx="1" fill="#8e99ae"/>
      <rect x="-10" y="10" width="20" height="2.5" fill="#8e99ae"/><rect x="-10" y="17" width="14" height="2.5" fill="#8e99ae"/><rect x="-10" y="24" width="17" height="2.5" fill="#8e99ae"/></g>`).join('');
  const lines = ['1 · you ask for a plan', '2 · you approve it', '3 · the team cooks'];
  const bubble = `<g transform="translate(520 112)">
      <path d="M0 0 H200 Q210 0 210 10 V34 Q210 44 200 44 H34 L20 58 L22 44 H0 Q-10 44 -10 34 V10 Q-10 0 0 0 Z" fill="#f2ece1"/>
      ${lines.map((s, k) => `<text x="100" y="28" text-anchor="middle" font-family="${MONO}" font-size="15" fill="#0b1426" opacity="0">${s}
        <animate attributeName="opacity" values="${['1;1;0;0;0;0;1', '0;0;1;1;0;0;0', '0;0;0;0;1;1;0'][k]}" keyTimes="0;.3;.333;.63;.666;.97;1" dur="7.5s" repeatCount="indefinite"/></text>`).join('')}
    </g>`;
  const labels = spots.map(([tier, x]) => `<text x="${x}" y="${TOP + 44}" text-anchor="middle" font-family="${MONO}" font-size="17" font-weight="700" fill="${TIERS[tier].color}">${TIERS[tier].name}</text>
      <text x="${x}" y="${TOP + 66}" text-anchor="middle" font-family="${MONO}" font-size="12.5" fill="#a9b4c6">${TIERS[tier].role}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Five chef bots behind a kitchen counter: haiku scouts with a magnifying glass, sonnet whisks, the lead holds up the order, opus chops, fable ticks off the plan.">
  <title>staff-of-chiefs: a kitchen staff of models</title>
  ${DEFS}
  <rect width="${W}" height="${H}" rx="18" fill="url(#tiles)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#glow)"/>
  <rect x="60" y="30" width="840" height="5" rx="2.5" fill="#56657e"/>
  ${tickets}
  <text x="480" y="66" text-anchor="middle" font-family="${MONO}" font-size="22" font-weight="700" fill="#f2ece1" letter-spacing="1">staff<tspan fill="#ffc861">-of-</tspan>chiefs</text>
  <text x="480" y="88" text-anchor="middle" font-family="${MONO}" font-size="12.5" fill="#8e99ae" letter-spacing="2">ONE COMMAND · A KITCHEN OF MODELS</text>
  ${spots.map(([tier, x, o]) => `<g transform="translate(${x} ${TOP})">${bot(tier, o)}</g>`).join('\n  ')}
  ${bubble}
  <rect x="0" y="${TOP}" width="${W}" height="${H - TOP}" fill="url(#steel)"/>
  <rect x="0" y="${TOP}" width="${W}" height="6" fill="#6f80a0"/>
  <path d="M0 ${H - 18} V${H} H${W} V${H - 18}" fill="none"/>
  ${labels}
</svg>`;
}

function single(tier, size = 160) {
  const tall = tier === 'lead' ? 22 : tier === 'fable' ? 8 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -175 160 190" width="${size}" height="${Math.round(size * 190 / 160)}" role="img" aria-label="${tier} chef bot">
  ${DEFS}${bot(tier, { tall, hopH: tier === 'haiku' ? 6 : 3, bob: tier === 'haiku' ? '.9s' : '2.6s' })}
  <rect x="-80" y="0" width="160" height="15" fill="url(#steel)"/><rect x="-80" y="0" width="160" height="4" fill="#6f80a0"/>
</svg>`;
}

function icon() { // static, square, for .claude-plugin/icon.png
  const t = TIERS.lead;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -170 200 200" width="512" height="512">
  ${DEFS}<rect x="-100" y="-170" width="200" height="200" rx="44" fill="#0b1426"/>
  <circle cx="0" cy="-70" r="92" fill="url(#glow)"/>
  <g transform="translate(0 2)">${hat(18)}${face(t, '99s')}</g>
  <rect x="-100" y="-4" width="200" height="34" fill="url(#steel)"/><rect x="-100" y="-4" width="200" height="5" fill="#6f80a0"/>
</svg>`;
}

const out = (f, s) => { fs.writeFileSync(path.join(__dirname, f), s.replace(/\n\s*\n/g, '\n') + '\n'); console.log('wrote assets/' + f); };
out('kitchen.svg', kitchen());
const still = svg => svg.replace(/<animate(Transform)?\b[^>]*\/>/g, '').replace(/<animate\b[^>]*>/g, '');
for (const tier of Object.keys(TIERS)) {
  out(`chef-${tier}.svg`, single(tier));
  out(`chef-${tier}-still.svg`, still(single(tier))); // for idle states and small sizes
}
out('icon.svg', icon());
module.exports = { TIERS, bot, single };
