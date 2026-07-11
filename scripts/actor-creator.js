import { CR_XP_MAP, crToNumber, crToDisplay } from "./cr-engine.js";
import { importSpellItem, buildSpellcastingDesc } from "./spell-engine.js";

export const VALID_DAMAGE_TYPES = new Set([
  "acid", "bludgeoning", "cold", "fire", "force", "lightning",
  "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"
]);

const DAMAGE_FOLDERS = {
  acid: ["icons/magic/acid", "icons/magic/nature"],
  bludgeoning: ["icons/weapons/hammers", "icons/weapons"],
  cold: ["icons/magic/water", "icons/magic/frost"],
  fire: ["icons/magic/fire", "icons/magic/fire"],
  force: ["icons/magic/force", "icons/magic/symbols"],
  lightning: ["icons/magic/lightning", "icons/magic/air"],
  necrotic: ["icons/magic/death", "icons/magic/dark"],
  piercing: ["icons/weapons/spears", "icons/weapons"],
  poison: ["icons/magic/poison", "icons/magic/nature"],
  psychic: ["icons/magic/perception", "icons/magic/scrying"],
  radiant: ["icons/magic/light", "icons/magic/holy"],
  slashing: ["icons/creatures/claws", "icons/weapons/swords"],
  thunder: ["icons/magic/sonic", "icons/magic/air"]
};

const CATEGORY_FOLDERS = {
  defensive: ["icons/equipment/shield", "icons/magic/protect"],
  offensive: ["icons/weapons/swords", "icons/weapons"],
  movement: ["icons/magic/movement", "icons/magic/wind"],
  senses: ["icons/magic/perception", "icons/magic/scrying"],
  passive: ["icons/magic/symbols", "icons/magic/buff"],
  reactions: ["icons/weapons/swords", "icons/weapons"],
  legendary: ["icons/magic/symbols", "icons/magic/holy"]
};

const THEME_FOLDERS = {
  beast: ["icons/creatures/mammals", "icons/creatures/wolves"],
  undead: ["icons/creatures/undead", "icons/magic/death"],
  aberration: ["icons/creatures/tentacles", "icons/creatures/eyes"],
  humanoid: ["icons/creatures/humanoids", "icons/equipment"],
  elemental: ["icons/magic/fire", "icons/magic/earth"],
  fiend: ["icons/creatures/demons", "icons/magic/dark"],
  fey: ["icons/creatures/birds", "icons/magic/nature"],
  construct: ["icons/equipment", "icons/magic/symbols"],
  dragon: ["icons/creatures/dragons", "icons/creatures/reptiles"],
  monstrosity: ["icons/creatures/reptiles", "icons/creatures/mammals"],
  any: ["icons/creatures/mammals", "icons/creatures"]
};

const _folderCache = new Map();

function filePickerSource(folderPath) {
  if (folderPath.startsWith("systems/") || folderPath.startsWith("modules/")) return "data";
  return "public";
}

async function browseFolderFiles(folderPath, depth = 0) {
  if (_folderCache.has(folderPath)) return _folderCache.get(folderPath);
  try {
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    const result = await FP.browse(filePickerSource(folderPath), folderPath);
    let files = (result.files || []).filter(f => /\.(webp|png|svg|jpg)$/i.test(f));

    if (files.length === 0 && depth === 0 && result.dirs?.length > 0) {
      const shuffledDirs = [...result.dirs].sort(() => Math.random() - 0.5);
      for (const dir of shuffledDirs) {
        const sub = await browseFolderFiles(dir, 1);
        files.push(...sub);
        if (files.length >= 20) break;
      }
    }

    _folderCache.set(folderPath, files);
    return files;
  } catch {
    _folderCache.set(folderPath, []);
    return [];
  }
}

async function pickIconFromFolders(folderPairs, fallbackSvg) {
  for (const folder of folderPairs) {
    const files = await browseFolderFiles(folder);
    if (files.length) return files[Math.floor(Math.random() * files.length)];
  }
  return fallbackSvg || "icons/svg/mystery-man.svg";
}

async function getActionIcon(action) {
  const resolved = action._resolvedDamage || action.damage_fallback;
  const damageType = resolved?.[1];

  if (damageType && DAMAGE_FOLDERS[damageType]) {
    return pickIconFromFolders(DAMAGE_FOLDERS[damageType], "icons/svg/combat.svg");
  }
  if (action.action_type === "save") return pickIconFromFolders(CATEGORY_FOLDERS.defensive, "icons/svg/shield.svg");
  if (action.action_type === "util") return "icons/svg/mystery-man.svg";
  return pickIconFromFolders(["icons/weapons/swords", "icons/weapons"], "icons/svg/combat.svg");
}

async function getTraitIcon(trait) {
  const folders = CATEGORY_FOLDERS[trait.category];
  if (folders) return pickIconFromFolders(folders, "icons/svg/mystery-man.svg");
  return "icons/svg/mystery-man.svg";
}

async function getThemeImage(theme) {
  const systemId = game.system.id;
  const typeSlug = (theme && theme !== "any") ? theme : "";

  const systemPaths = typeSlug
    ? [`systems/${systemId}/tokens/${typeSlug}`, `systems/${systemId}/tokens`]
    : [`systems/${systemId}/tokens`];

  const corePaths = THEME_FOLDERS[theme] || THEME_FOLDERS.any;

  return pickIconFromFolders([...systemPaths, ...corePaths], "icons/svg/mystery-man.svg");
}

function resolveDC(profBonus, statValue) {
  return 8 + profBonus + Math.floor((statValue - 10) / 2);
}

function buildConditionEffect(effectDef) {
  const effectId = foundry.utils.randomID();
  const label = effectDef.condition.charAt(0).toUpperCase() + effectDef.condition.slice(1);
  const statusEntry = CONFIG.statusEffects?.find(s => s.id === effectDef.condition);
  const img = statusEntry?.img ?? "icons/svg/mystery-man.svg";
  return {
    _id: effectId,
    name: label,
    img,
    transfer: false,
    disabled: false,
    statuses: [effectDef.condition],
    changes: [],
    flags: {},
    duration: {
      rounds: effectDef.duration === "minute" ? 10 : 1,
      turns: 0,
      seconds: 0,
      startRound: null,
      startTime: null,
      startTurn: null
    }
  };
}

function formatDesc(text, dc, profBonus) {
  return (text || "")
    .replace(/\{dc\}/g, dc)
    .replace(/\{prof\}/g, profBonus);
}

function damageTypeSet(typeStr) {
  if (typeStr && VALID_DAMAGE_TYPES.has(typeStr)) return [typeStr];
  return [];
}

const VALID_DENOMINATIONS = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100]);

function buildDamagePart(formula, damageType, includeModifier = false) {
  const types = damageTypeSet(damageType);

  const parsed = (formula ?? "").match(/^\s*(\d+)d(\d+)\s*$/i);
  if (parsed && VALID_DENOMINATIONS.has(Number(parsed[2]))) {
    return {
      number: Number(parsed[1]),
      denomination: Number(parsed[2]),
      bonus: includeModifier ? "@mod" : "",
      types,
      custom: { enabled: false, formula: "" },
      scaling: { mode: "", number: null, formula: "" }
    };
  }

  const fullFormula = includeModifier ? `${formula} + @mod` : (formula || "");
  return {
    number: null,
    denomination: null,
    bonus: "",
    types,
    custom: { enabled: true, formula: fullFormula },
    scaling: { mode: "", number: null, formula: "" }
  };
}

function buildAttackActivity(action, creatureData, activationType = "action", activationValue = 1, effectRefs = []) {
  const actId = foundry.utils.randomID();
  const isRanged = ["rwak", "rsak"].includes(action.action_type);
  const isSpell = ["rsak", "msak"].includes(action.action_type);
  const ability = (action.uses_dex || isRanged) ? "dex" : "str";

  const resolved = action._resolvedDamage || action.damage_fallback || ["1d6", "bludgeoning"];
  const [formula, damageType] = resolved;

  return {
    [actId]: {
      _id: actId,
      type: "attack",
      activation: { type: activationType, value: activationValue, condition: "" },
      duration: { value: "", units: "inst", special: "" },
      range: {
        value: action.range || (isRanged ? 60 : 5),
        units: "ft",
        special: ""
      },
      target: {
        affects: { count: "1", type: "creature", choice: false, special: "" },
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
        prompt: true
      },
      effects: effectRefs,
      uses: { spent: 0, max: "", recovery: [] },
      attack: {
        ability,
        bonus: "",
        flat: false,
        critical: { threshold: null },
        type: {
          value: isRanged ? "ranged" : "melee",
          classification: isSpell ? "spell" : "weapon"
        }
      },
      damage: {
        critical: { bonus: "" },
        includeBase: true,
        parts: [buildDamagePart(formula, damageType, true)]
      }
    }
  };
}

function buildSaveActivity(action, dc, saveAbility = "wis", activationType = "action", activationValue = 1, effectRefs = []) {
  const actId = foundry.utils.randomID();
  const resolved = action._resolvedDamage || action.damage_fallback;
  const [formula, damageType] = resolved || ["", ""];
  const hasDamage = formula && formula !== "0";

  return {
    [actId]: {
      _id: actId,
      type: "save",
      activation: { type: activationType, value: activationValue, condition: "" },
      duration: { value: "", units: "inst", special: "" },
      range: {
        value: action.range || 30,
        units: "ft",
        special: ""
      },
      target: {
        affects: { count: "", type: "creature", choice: false, special: "" },
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
        prompt: true
      },
      effects: effectRefs,
      uses: { spent: 0, max: "", recovery: [] },
      save: {
        ability: [saveAbility],
        dc: { calculation: "", formula: String(dc) }
      },
      damage: {
        onSave: "half",
        parts: hasDamage ? [buildDamagePart(formula, damageType, false)] : []
      }
    }
  };
}

function buildUtilityActivity(activationType = "action", activationValue = 1) {
  const actId = foundry.utils.randomID();
  return {
    [actId]: {
      _id: actId,
      type: "utility",
      activation: { type: activationType, value: activationValue, condition: "" },
      duration: { value: "", units: "inst", special: "" },
      range: { value: null, units: "", special: "" },
      target: {
        affects: { count: "", type: "", choice: false, special: "" },
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
        prompt: false
      },
      effects: [],
      uses: { spent: 0, max: "", recovery: [] }
    }
  };
}

function buildLegendaryActivity(cost = 1) {
  const actId = foundry.utils.randomID();
  return {
    [actId]: {
      _id: actId,
      type: "utility",
      activation: { type: "legendary", value: cost, condition: "" },
      duration: { value: "", units: "inst", special: "" },
      range: { value: null, units: "", special: "" },
      target: {
        affects: { count: "", type: "", choice: false, special: "" },
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
        prompt: false
      },
      effects: [],
      uses: { spent: 0, max: "", recovery: [] }
    }
  };
}

function buildLairActivity() {
  const actId = foundry.utils.randomID();
  return {
    [actId]: {
      _id: actId,
      type: "utility",
      activation: { type: "lair", value: 1, condition: "" },
      duration: { value: "", units: "inst", special: "" },
      range: { value: null, units: "", special: "" },
      target: {
        affects: { count: "", type: "", choice: false, special: "" },
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
        prompt: false
      },
      effects: [],
      uses: { spent: 0, max: "", recovery: [] }
    }
  };
}

async function buildActionItem(action, creatureData) {
  const { profBonus, stats } = creatureData;
  const dcStatKey = action.effect?.dc_stat;
  const dcStatValue = dcStatKey ? (stats[dcStatKey] ?? Math.max(stats.wis, stats.cha)) : Math.max(stats.wis, stats.cha);
  const dc = resolveDC(profBonus, dcStatValue);
  const desc = formatDesc(action.description, dc, profBonus);

  const isSave = action.action_type === "save";
  const isUtil = action.action_type === "util";

  const builtEffect = action.effect?.condition ? buildConditionEffect(action.effect) : null;
  const effectRefs = builtEffect ? [{ _id: builtEffect._id }] : [];

  const [activities, icon] = await Promise.all([
    isSave ? buildSaveActivity(action, dc, action.effect?.save_stat || action.save_stat || "wis", "action", 1, effectRefs)
    : !isUtil ? buildAttackActivity(action, creatureData, "action", 1, effectRefs)
    : buildUtilityActivity(),
    getActionIcon(action)
  ]);

  return {
    name: action.name,
    type: "feat",
    img: icon,
    system: {
      description: { value: `<p>${desc}</p>` },
      type: { value: "monster", subtype: "" },
      activities
    },
    effects: builtEffect ? [builtEffect] : []
  };
}

async function buildFeatureItem(trait, creatureData) {
  const { profBonus, stats } = creatureData;
  const dc = resolveDC(profBonus, Math.max(stats.wis, stats.cha));
  const desc = formatDesc(trait.description, dc, profBonus);
  const icon = await getTraitIcon(trait);

  const legType = trait.legendary_type;
  const legCost = trait.legendary_cost ?? 1;
  const isAttack = ["mwak", "rwak", "msak", "rsak"].includes(trait.action_type);
  const isSave = trait.action_type === "save";

  let activationType = "action";
  let activationValue = 1;
  if (legType === "action") { activationType = "legendary"; activationValue = legCost; }
  else if (legType === "lair") { activationType = "lair"; }
  else if (trait.activation_type) { activationType = trait.activation_type; }

  let activities;
  if (isAttack) {
    activities = buildAttackActivity(trait, creatureData, activationType, activationValue);
  } else if (isSave) {
    activities = buildSaveActivity(trait, dc, trait.save_stat || "wis", activationType, activationValue);
  } else if (legType === "action" || legType === "lair" || trait.activation_type) {
    activities = buildUtilityActivity(activationType, activationValue);
  }

  return {
    name: trait.name,
    type: "feat",
    img: icon,
    system: {
      description: { value: `<p>${desc}</p>` },
      type: { value: "monster", subtype: "" },
      ...(activities ? { activities } : {})
    }
  };
}

function regenerateClonedItemIds(itemData) {
  const clone = foundry.utils.deepClone(itemData);
  delete clone._id;

  if (clone.system?.activities) {
    const newActivities = {};
    for (const activity of Object.values(clone.system.activities)) {
      const newId = foundry.utils.randomID();
      newActivities[newId] = { ...activity, _id: newId };
    }
    clone.system.activities = newActivities;
  }

  if (Array.isArray(clone.effects)) {
    clone.effects = clone.effects.map(effect => ({ ...effect, _id: foundry.utils.randomID() }));
  }

  return clone;
}

function applyResolvedDamageToClone(itemData, resolvedDamage) {
  if (!resolvedDamage) return;
  const [formula, damageType] = resolvedDamage;
  const activities = itemData.system?.activities;
  if (!activities) return;

  for (const activity of Object.values(activities)) {
    const parts = activity.damage?.parts;
    if (!parts?.length) continue;
    const includeModifier = activity.type === "attack";
    parts[0] = buildDamagePart(formula, damageType, includeModifier);
    break;
  }
}

function buildActionItemFromClone(action) {
  const clone = regenerateClonedItemIds(action._fullClone);
  applyResolvedDamageToClone(clone, action._resolvedDamage);
  return clone;
}

function buildFeatureItemFromClone(trait) {
  return regenerateClonedItemIds(trait._fullClone);
}

async function buildSyntheticSpellItem(spell, creatureData) {
  const { profBonus, stats, spellInfo } = creatureData;
  const { spellDC } = spellInfo;
  const fb = spell.fallback || { type: "util" };
  const [formula, damageType] = fb.damage || ["0", "force"];
  const saveAbility = fb.save_stat || "wis";
  const usageLabel = spell.cantrip ? "at will" : "1/day";
  const schoolLabel = spell.school
    ? spell.school.charAt(0).toUpperCase() + spell.school.slice(1)
    : "Magic";

  const ABILITY_LABELS = {
    str: "Strength", dex: "Dexterity", con: "Constitution",
    int: "Intelligence", wis: "Wisdom", cha: "Charisma"
  };

  let activities;
  let descBody;

  if (fb.type === "attack" && formula !== "0") {
    const attackType = fb.melee ? "msak" : "rsak";
    const attackRange = fb.melee ? 5 : 60;
    const defaultDesc = fb.melee
      ? `Melee spell attack dealing ${formula} ${damageType} damage.`
      : `Ranged spell attack dealing ${formula} ${damageType} damage.`;
    activities = buildAttackActivity(
      { action_type: attackType, uses_dex: !fb.melee, range: attackRange, range_long: null,
        _resolvedDamage: [formula, damageType], damage_fallback: [formula, damageType] },
      creatureData
    );
    descBody = fb.description
      ? fb.description.replace("{damage}", `${formula} ${damageType}`)
      : defaultDesc;
  } else if (fb.type === "save") {
    // saves with no damage still need a DC button on the sheet
    activities = buildSaveActivity(
      { _resolvedDamage: formula !== "0" ? [formula, damageType] : null, range: 30 },
      spellDC,
      saveAbility
    );
    const abilityLabel = ABILITY_LABELS[saveAbility] || "Wisdom";
    if (formula !== "0") {
      const autoDesc = `Each creature must succeed on a DC ${spellDC} ${abilityLabel} saving throw`
        + `, taking ${formula} ${damageType} damage on a failure (half on a success).`;
      descBody = fb.description ? `${fb.description} (DC ${spellDC} ${abilityLabel}, ${formula} ${damageType} on a failure)` : autoDesc;
    } else {
      const autoDesc = `DC ${spellDC} ${abilityLabel} saving throw - `;
      descBody = fb.description ? autoDesc + fb.description : `One or more creatures must succeed on a DC ${spellDC} ${abilityLabel} saving throw or be affected.`;
    }
  } else {
    activities = buildUtilityActivity(fb.activation_type || "action");
    descBody = fb.description || `${schoolLabel} spell (${usageLabel}).`;
  }

  const description = `<p><em>${schoolLabel} (${usageLabel === "at will" ? "At Will" : "1/Day"})</em></p><p>${descBody}</p>`;

  const icon = damageType && DAMAGE_FOLDERS[damageType]
    ? await pickIconFromFolders(DAMAGE_FOLDERS[damageType], "icons/svg/mystery-man.svg")
    : await pickIconFromFolders(CATEGORY_FOLDERS.passive, "icons/svg/mystery-man.svg");

  const displayName = spell.name.charAt(0).toUpperCase() + spell.name.slice(1);

  return {
    name: displayName,
    type: "feat",
    img: icon,
    system: {
      description: { value: description },
      type: { value: "monster", subtype: "" },
      activities
    }
  };
}

const ALL_SKILLS = [
  "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
  "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
];

// dnd5e 5.3 reorganised the senses field; branch on version to keep 4.x and 5.x both working
function dnd5eAtLeast(major, minor = 0) {
  const [v0, v1] = (game.system.version ?? "0.0").split(".").map(Number);
  return v0 > major || (v0 === major && v1 >= minor);
}

async function resolveFolder(name) {
  if (!name) return null;
  let folder = game.folders.find(f => f.type === "Actor" && f.name === name);
  if (!folder) folder = await Folder.create({ name, type: "Actor" });
  return folder?.id ?? null;
}

async function createActor(creatureData) {
  const {
    name, cr, stats, traits, actions,
    resistances, immunities, conditionImmunities, creatureType,
    skills, senses, solo, spellInfo, profBonus,
    img, tokenImg, disposition, folder
  } = creatureData;

  const folderName = folder ?? game.settings.get("encounter-forge", "defaultFolder") ?? "";
  const folderId = await resolveFolder(folderName);

  const xp = CR_XP_MAP[cr] ?? 0;
  const crNum = crToNumber(cr);

  const legresCount = traits
    .filter(t => t.legendary_type === "resistance")
    .reduce((max, t) => Math.max(max, t.resistance_uses ?? 0), 0);
  const hasLegActions = traits.some(t => t.legendary_type === "action");
  const hasLairActions = traits.some(t => t.legendary_type === "lair");

  const needsImage = !img || !tokenImg;
  const themeImage = needsImage ? await getThemeImage(creatureType) : null;
  const finalPortrait = img || themeImage || "icons/svg/mystery-man.svg";
  const finalToken = tokenImg || themeImage || null;

  const actorData = {
    name,
    type: "npc",
    img: finalPortrait,
    folder: folderId,
    prototypeToken: {
      disposition: disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE
    },
    system: {
      abilities: {
        str: { value: stats.str },
        dex: { value: stats.dex },
        con: { value: stats.con },
        int: { value: stats.int },
        wis: { value: stats.wis },
        cha: { value: stats.cha }
      },
      attributes: {
        hp: { value: stats.hp, max: stats.hp, formula: "" },
        ac: { flat: stats.ac, calc: "flat" },
        movement: {
          walk: stats.speeds.walk || 30,
          fly: stats.speeds.fly || 0,
          swim: stats.speeds.swim || 0,
          burrow: stats.speeds.burrow || 0,
          climb: stats.speeds.climb || 0,
          hover: false,
          units: "ft"
        },
        senses: dnd5eAtLeast(5, 3)
          ? {
              ranges: {
                darkvision: senses?.darkvision || null,
                blindsight: senses?.blindsight || null,
                tremorsense: senses?.tremorsense || null,
                truesight: senses?.truesight || null
              },
              units: "ft",
              special: ""
            }
          : {
              darkvision: senses?.darkvision ?? 0,
              blindsight: senses?.blindsight ?? 0,
              tremorsense: senses?.tremorsense ?? 0,
              truesight: senses?.truesight ?? 0,
              units: "ft",
              special: ""
            }
      },
      skills: Object.fromEntries(
        ALL_SKILLS.map(s => [s, { value: skills?.[s] ?? 0 }])
      ),
      details: {
        cr: crNum,
        xp: { value: xp },
        type: { value: creatureType, subtype: "", swarm: "", custom: "" }
      },
      resources: (hasLegActions || legresCount > 0 || hasLairActions) ? {
        legact: { value: hasLegActions ? 3 : 0, max: hasLegActions ? 3 : 0 },
        legres: { value: legresCount, max: legresCount },
        lair: { value: hasLairActions, initiative: 20 }
      } : {},
      traits: {
        size: stats.size || "med",
        dr: { value: resistances, bypasses: [] },
        di: { value: immunities, bypasses: [] },
        dv: { value: [], bypasses: [] },
        ci: { value: conditionImmunities }
      }
    }
  };

  const actor = await Actor.create(actorData, { chatMessage: false });
  if (!actor) return null;

  const multiattackItem = actions.length > 1 ? {
    name: "Multiattack",
    type: "feat",
    img: await pickIconFromFolders(["icons/weapons/swords", "icons/weapons"], "icons/svg/combat.svg"),
    system: {
      description: { value: `<p>The creature makes a ${actions.map(a => a.name).join(" and ")} attack.</p>` },
      type: { value: "monster", subtype: "" },
      activities: buildUtilityActivity()
    }
  } : null;

  const [actionItems, traitItems] = await Promise.all([
    Promise.all(actions.map(a => a._fullClone
      ? buildActionItemFromClone(a)
      : buildActionItem(a, creatureData))),
    Promise.all(traits.map(t => t._fullClone
      ? buildFeatureItemFromClone(t)
      : buildFeatureItem(t, creatureData)))
  ]);

  let legendaryIntroItem = null;
  if (hasLegActions) {
    const legActionTraits = traits.filter(t => t.legendary_type === "action");
    const dc = resolveDC(profBonus, Math.max(stats.wis, stats.cha));

    const optionLines = legActionTraits.map(t => {
      const cost = t.legendary_cost ?? 1;
      const costStr = cost > 1 ? `Costs ${cost} Actions` : "Costs 1 Action";
      const summary = formatDesc(t.description, dc, profBonus)
        .replace(/<[^>]+>/g, "").trim().slice(0, 120);
      const ellipsis = summary.length === 120 ? "..." : "";
      return `<li><strong>${t.name}</strong> (${costStr}). ${summary}${ellipsis}</li>`;
    }).join("");

    const optionBlock = optionLines
      ? `<ul>${optionLines}</ul>`
      : "";

    legendaryIntroItem = {
      name: "Legendary Actions",
      type: "feat",
      img: await pickIconFromFolders(CATEGORY_FOLDERS.legendary, "icons/svg/mystery-man.svg"),
      system: {
        description: {
          value: `<p>The creature can take 3 legendary actions per round, choosing from the options listed below. Only one legendary action can be used at a time and only at the end of another creature's turn. Spent legendary actions are regained at the start of each turn.</p>${optionBlock}`
        },
        type: { value: "monster", subtype: "" }
      }
    };
  }

  const items = [
    ...(multiattackItem ? [multiattackItem] : []),
    ...actionItems,
    ...traitItems,
    ...(legendaryIntroItem ? [legendaryIntroItem] : [])
  ];

  if (items.length) await actor.createEmbeddedDocuments("Item", items, { chatMessage: false });

  if (spellInfo) {
    const allSpells = [...spellInfo.cantrips, ...spellInfo.leveled];

    const resolvedItems = await Promise.all(
      allSpells.map(async spell => {
        const result = await importSpellItem(spell);
        if (result.source === "compendium") return regenerateClonedItemIds(result.data);
        return buildSyntheticSpellItem(spell, creatureData);
      })
    );

    const spellcastingIcon = await pickIconFromFolders(
      ["icons/magic/symbols", "icons/magic/holy"],
      "icons/svg/mystery-man.svg"
    );
    const spellcastingFeature = {
      name: "Spellcasting",
      type: "feat",
      img: spellcastingIcon,
      system: {
        description: { value: buildSpellcastingDesc(spellInfo, name) },
        type: { value: "monster", subtype: "" }
      }
    };

    await actor.createEmbeddedDocuments("Item",
      [spellcastingFeature, ...resolvedItems],
      { chatMessage: false }
    );
  }

  if (finalToken) {
    await actor.update({ "prototypeToken.texture.src": finalToken });
  }

  Hooks.callAll("encounterForge.creatureCreated", { actor, creatureData });

  actor.sheet.render(true);
  ui.notifications.info(
    game.i18n.format("ENCOUNTERFORGE.Notify.Created", { name, cr: crToDisplay(cr) })
  );

  return actor;
}

export { createActor };
