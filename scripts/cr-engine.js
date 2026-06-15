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
  15: 13000
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
  return 6;
}

function getCRTier(cr) {
  const n = crToNumber(cr);
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 7)  return 3;
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

export { CR_XP_MAP, crToNumber, getProfBonus, getCRTier, crToDisplay };
