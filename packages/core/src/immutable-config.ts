export function cloneAndDeepFreeze<T>(value: T): T {
  return cloneValue(value, new WeakMap<object, unknown>()) as T;
}

function cloneValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  if (typeof value === "function") {
    return value;
  }

  const existing = seen.get(value);
  if (existing) return existing;

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const entry of value) copy.push(cloneValue(entry, seen));
    return Object.freeze(copy);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Configuration values must use plain objects and arrays");
  }

  const copy: Record<string, unknown> = Object.create(prototype) as Record<string, unknown>;
  seen.set(value, copy);
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value: cloneValue(entry, seen),
      writable: true
    });
  }
  return Object.freeze(copy);
}
