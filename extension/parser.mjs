import './original-gwt-runtime.mjs';

/** Deserialize a successful GWT-RPC response with the original generated serializers. */
export function deserializeWfmRpc(responseText) {
  if (typeof responseText !== 'string' || !responseText.startsWith('//OK')) {
    throw new Error('Expected successful //OK GWT-RPC response');
  }
  const runtime = globalThis.__wfmGwt;
  if (!runtime) throw new Error('GWT runtime not initialized');
  const reader = runtime.createReader(runtime.createSerializer());
  reader.a4c(responseText.slice(4));
  const value = reader.G3c();
  if (reader.a !== 0) throw new Error(`Unread GWT fields: ${reader.a}`);
  return value;
}

/** Produces JSON-safe data while retaining object identity using $id / $ref. */
export function snapshotGwtObject(value, { maxDepth = 32 } = {}) {
  const seen = new WeakMap();
  let nextId = 0;
  function walk(input, depth) {
    if (input === null || typeof input !== 'object') {
      return typeof input === 'function' ? '[Function]' : input;
    }
    if (seen.has(input)) return { $ref: seen.get(input) };
    const id = ++nextId;
    seen.set(input, id);
    if (depth >= maxDepth) return { $id: id, $truncated: true };
    if (Array.isArray(input)) return { $id: id, $array: Array.from(input, x => walk(x, depth + 1)) };
    const output = { $id: id };
    const constructorInfo = Object.getPrototypeOf(input)?.Und;
    if (constructorInfo && typeof constructorInfo.Ih === 'function') {
      try { output.$type = constructorInfo.Ih(); } catch { /* optional metadata */ }
    }
    for (const key of Object.keys(input)) {
      if (key !== 'Und' && key !== 'Wnd') output[key] = walk(input[key], depth + 1);
    }
    return output;
  }
  return walk(value, 0);
}
