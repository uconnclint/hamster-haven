// Shared constants for Hamster Haven. Units are centimeters.
export const GRID = 10;               // build grid cell size (horizontal)
export const VSTEP = 2.5;             // vertical snap step (gy is in these units)

export const ROOM = { x: 500, z: 400, h: 260 }; // room interior, centered on origin

export const DESK = {
  minX: 90, maxX: 230,
  minZ: -195, maxZ: -115,
  topY: 75,                            // desk surface height
};

export const CAGE = {
  cx: 160, cz: -155,                   // center of cage on the desk
  w: 80, d: 50,                        // footprint
  baseY: 75,                           // sits on desk top
  floorY: 78,                          // inside floor (3cm base)
  wallH: 32,                           // bar height above floor
};

export const PLAYER = {
  radius: 3.2,
  height: 6.5,
  speed: 60,
  dashSpeed: 145,
  accel: 420,
  jumpVel: 175,
  gravity: 750,
  climbSpeed: 45,
  maxCarry: 10,
};

export const NET = {
  sendHz: 15,
  interpDelay: 120,                    // ms behind for remote interpolation
};

export const PALETTE = {
  wallA: 0xf2e3c6, wallB: 0xead7b5,
  floorWood: 0xc8965a, floorWoodDark: 0xb9854c,
  rug: 0xe86a5e, rugRing: 0xf4a261,
  deskWood: 0x8d6748, deskWoodLight: 0xa07d5a,
  cageBase: 0x7fb069, cageBar: 0xd9d9d9,
  bedding: 0xf5e6c8,
  tubeYellow: 0xf6c453, tubeGreen: 0x8fbf6b, tubeBlue: 0x6ec6e6,
  tubeRed: 0xef767a, tubePurple: 0xb28dd9,
  seed: 0x8a5a2b, seedStripe: 0xd9b98a,
  night: 0x24304d, day: 0xbfe3f2,
};

export const HAMSTER_COLORS = [
  { name: 'Golden', body: 0xe8a552, belly: 0xf7e3c2 },
  { name: 'Cream',  body: 0xf0d9a8, belly: 0xfbf1dc },
  { name: 'Cocoa',  body: 0x8a5f3e, belly: 0xd6b895 },
  { name: 'Smoke',  body: 0x9aa0a8, belly: 0xdadde2 },
  { name: 'Snow',   body: 0xf2f2ee, belly: 0xffffff },
  { name: 'Berry',  body: 0xc97b9d, belly: 0xf0d3e0 },
];

export const EMOTES = [
  'assets/emote-love.png',
  'assets/emote-happy.png',
  'assets/emote-sleep.png',
  'assets/emote-alert.png',
];
