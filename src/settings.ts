export type Setting = {
  key: string;
  value: string;
};

/** Where a setting's control lives. The key can be shared; the control cannot. */
export type ControlPlace = "text-toolbar";

type TypeSpec = {
  keys: readonly string[];
  controls: Partial<Record<string, ControlPlace>>;
};

const registry: Record<string, TypeSpec> = {
  text: {
    keys: ["content", "fill", "padding", "color"],
    controls: { color: "text-toolbar" },
  },
};

export function knownElementTypes(): string[] {
  return Object.keys(registry);
}

export function allowedKeys(type: string): readonly string[] | undefined {
  return registry[type]?.keys;
}

/** Control location for a key on this element type. Absent when that type has no control yet. */
export function controlFor(type: string, key: string): ControlPlace | undefined {
  return registry[type]?.controls[key];
}

/** Split `key=value` on the first `=`. Duplicate keys are rejected. */
export function parseSettings(pairs: string[]): Setting[] {
  if (pairs.length === 0) throw new Error("--set is empty");
  const settings: Setting[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) throw new Error(`--set needs key=value: ${pair}`);
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1);
    if (!key) throw new Error(`--set needs key=value: ${pair}`);
    if (seen.has(key)) throw new Error(`Duplicate --set key: ${key}`);
    seen.add(key);
    settings.push({ key, value });
  }
  return settings;
}

/**
 * Reject an unknown type or key before any editor change.
 * The error names the keys that type allows, or the known types.
 */
export function validateSettings(type: string, settings: Setting[]): void {
  const allowed = registry[type]?.keys;
  if (!allowed) {
    throw new Error(`No settings for element type ${type}. Known types: ${knownElementTypes().join(", ")}`);
  }
  for (const setting of settings) {
    if (!allowed.includes(setting.key)) {
      throw new Error(`Unknown setting ${setting.key} for ${type}. Allowed: ${allowed.join(", ")}`);
    }
    if (setting.key === "fill") {
      if (!/^theme:[A-Za-z][A-Za-z0-9 _.-]*$/.test(setting.value) || setting.value.includes("#")) {
        throw new Error(`fill must be theme:<swatch>, not ${JSON.stringify(setting.value)}`);
      }
    }
    if (setting.key === "padding" && setting.value !== "on" && setting.value !== "off") {
      throw new Error(`padding must be on or off, not ${JSON.stringify(setting.value)}`);
    }
    if (setting.key === "color" && setting.value !== "white") {
      throw new Error(`color must be white, not ${JSON.stringify(setting.value)}`);
    }
  }
}
