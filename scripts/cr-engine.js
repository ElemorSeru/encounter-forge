const CR_XP_MAP = {
  0: 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000
};

function crToNumber(cr) {
  if (cr === "1/8") return 0.125;
  if (cr === "1/4") return 0.25;
  if (cr === "1/2") return 0.5;
  return Number(cr);
}

function getProfBonus(cr) {
  const n = crToNumber(cr);
  if (n < 5) return 2;
  if (n < 9) return 3;
  if (n < 13) return 4;
  if (n < 17) return 5;
  if (n < 21) return 6;
  if (n < 25) return 7;
  if (n < 29) return 8;
  return 9;
}

function getCRTier(cr) {
  const n = crToNumber(cr);
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 7) return 3;
  if (n <= 10) return 4;
  if (n <= 13) return 5;
  return 6;
}

function crToDisplay(cr) {
  if (typeof cr === "string") return cr;
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

function halfCR(cr) {
  const n = crToNumber(cr);
  const half = n / 2;
  const table = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
  const floor = table.filter(c => c <= half).pop() ?? 0;
  return crToDisplay(floor);
}

export { CR_XP_MAP, crToNumber, getProfBonus, getCRTier, crToDisplay, halfCR };
