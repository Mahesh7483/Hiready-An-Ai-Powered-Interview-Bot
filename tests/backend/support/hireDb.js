/**
 * A tiny in-memory stand-in for the mongoose models the /hire tree touches.
 *
 * WHY THIS EXISTS
 *
 * The guarantees under test — tenancy, consent, role scoping, suspension,
 * revocation — live in middleware and query filters, not in Mongo. Running
 * them against a real database would make the suite slow, order-dependent and
 * unrunnable in CI, and would test mongoose rather than the boundary.
 *
 * So this implements just enough of the query surface those routes actually
 * use. It is deliberately NOT a mongoose emulator: anything unsupported throws
 * loudly rather than quietly returning nothing, because a filter silently
 * matching zero documents is exactly the failure mode that produced half the
 * bugs this suite exists to catch.
 */
const mongoose = require('mongoose');

/** Every collection the hire surface reads. Reset between tests. */
const db = {
  companies: [],
  memberships: [],
  consents: [],
  users: [],
  invites: [],
  templates: [],
  attempts: [],
  interviews: [],
  resumes: [],
  audits: [],
  jobs: [],
  applications: [],
};

const oid = () => new mongoose.Types.ObjectId();
const id = (v) => String(v && v._id ? v._id : v);

/** Aggregation results, keyed by collection, that a test can stub. */
const aggregates = {};

function reset() {
  Object.keys(db).forEach((k) => { db[k] = []; });
  Object.keys(aggregates).forEach((k) => { delete aggregates[k]; });
}

// ── filter matching ────────────────────────────────────────────────────────

function matchOp(actual, op, operand) {
  switch (op) {
    case '$in': return operand.some((o) => id(o) === id(actual));
    case '$nin': return !operand.some((o) => id(o) === id(actual));
    case '$ne': return id(actual) !== id(operand);
    case '$gte': return actual >= operand;
    case '$lte': return actual <= operand;
    case '$gt': return actual > operand;
    case '$lt': return actual < operand;
    default: throw new Error(`hireDb: unsupported operator ${op}`);
  }
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((f) => matches(doc, f));
    if (key === '$and') return expected.every((f) => matches(doc, f));

    const actual = doc[key];
    const isOps = expected && typeof expected === 'object'
      && !Array.isArray(expected) && !(expected instanceof Date)
      && !(expected instanceof mongoose.Types.ObjectId)
      && Object.keys(expected).some((k) => k.startsWith('$'));

    if (isOps) {
      return Object.entries(expected).every(([op, operand]) => matchOp(actual, op, operand));
    }
    if (expected === null) return actual === null || actual === undefined;
    return id(actual) === id(expected);
  });
}

// ── query chains ───────────────────────────────────────────────────────────

/**
 * Which collection a reference field points at, so .populate() resolves.
 * Only the paths the hire surface actually populates.
 */
const REFERENCES = {
  companyId: 'companies',
  candidateId: 'users',
  userId: 'users',
  jobId: 'jobs',
};

/**
 * Applies a mongoose projection string.
 *
 * Load-bearing rather than cosmetic: several routes rely on select() alone to
 * withhold a field — GET /api/hire/invites keeps tokenHash out of the response
 * that way, and services/hire/readers.js keeps sectionState (the answer key)
 * and the raw violation list out of every scorecard. A shim that ignored
 * projection would let all three regress in silence.
 */
function project(doc, fields) {
  if (!doc || !fields) return doc;
  const names = String(fields).split(/\s+/).filter(Boolean);
  if (!names.length) return doc;

  const excluding = names.every((n) => n.startsWith('-'));
  const out = {};
  if (excluding) {
    const drop = new Set(names.map((n) => n.slice(1)));
    Object.keys(doc).forEach((k) => { if (!drop.has(k)) out[k] = doc[k]; });
  } else {
    names.filter((n) => !n.startsWith('-')).forEach((n) => {
      if (n in doc) out[n] = doc[n];
    });
    if (!names.includes('-_id')) out._id = doc._id;
  }
  return out;
}

/**
 * Supports both `.lean()` and a bare `await`, because the routes use each.
 * Ordering is accepted and ignored; limit, projection and population are not,
 * because routes depend on each of them for correctness rather than for shape.
 */
function chain(produce) {
  let cap = null;
  let fields = null;
  const populated = [];

  const c = {
    sort: () => c,
    skip: () => c,
    select(f) { fields = f; return c; },
    limit(n) { cap = n; return c; },
    populate(path) { populated.push(path); return c; },
    lean: () => Promise.resolve(apply()),
    then: (onOk, onErr) => Promise.resolve(apply()).then(onOk, onErr),
  };

  function resolve(doc) {
    if (!doc || typeof doc !== 'object') return doc;
    let out = doc;
    populated.forEach((path) => {
      const target = REFERENCES[path];
      if (!target) throw new Error(`hireDb: no reference mapping for populate('${path}')`);
      const ref = db[target].find((d) => id(d._id) === id(doc[path]));
      out = { ...out, [path]: ref || null };
    });
    return project(out, fields);
  }

  function apply() {
    const out = produce();
    if (Array.isArray(out)) {
      return (cap === null ? out : out.slice(0, cap)).map(resolve);
    }
    if (typeof out === 'number' || out === null) return out;
    // A single document keeps its identity (and its .save()) unless the query
    // asked for a projection or a join — mirroring mongoose closely enough that
    // routes calling doc.save() after findOne() still work.
    return fields || populated.length ? resolve(out) : out;
  }

  return c;
}

/** Documents behave enough like mongoose docs for `.set()` and `.save()`. */
function hydrate(doc) {
  if (!doc || typeof doc.save === 'function') return doc;
  Object.defineProperty(doc, 'save', {
    value: async function save() { return this; },
    enumerable: false,
  });
  Object.defineProperty(doc, 'set', {
    value: function set(path, value) { this[path] = value; return this; },
    enumerable: false,
  });
  return doc;
}

function applyUpdate(doc, update) {
  Object.entries(update.$set || {}).forEach(([k, v]) => { doc[k] = v; });
  Object.entries(update.$push || {}).forEach(([k, v]) => {
    doc[k] = [...(doc[k] || []), v];
  });
  return doc;
}

function collection(name) {
  const rows = () => db[name];
  return {
    find: jest.fn((filter = {}) => chain(() => rows().filter((d) => matches(d, filter)))),
    findOne: jest.fn((filter = {}) => chain(
      () => hydrate(rows().find((d) => matches(d, filter)) || null)
    )),
    findById: jest.fn((v) => chain(
      () => hydrate(rows().find((d) => id(d._id) === id(v)) || null)
    )),
    // requireAuth now confirms the account still exists on every request.
    exists: jest.fn(async (filter = {}) => {
      const hit = rows().find((d) => matches(d, filter));
      return hit ? { _id: hit._id } : null;
    }),
    countDocuments: jest.fn((filter = {}) => chain(
      () => rows().filter((d) => matches(d, filter)).length
    )),
    distinct: jest.fn((field) => chain(() => rows().map((d) => d[field]))),
    create: jest.fn(async (doc) => {
      const d = hydrate({ _id: oid(), createdAt: new Date(), updatedAt: new Date(), ...doc });
      rows().push(d);
      return d;
    }),
    findOneAndUpdate: jest.fn((filter, update = {}, options = {}) => chain(() => {
      const existing = rows().find((d) => matches(d, filter));
      if (existing) return hydrate(applyUpdate(existing, update));
      if (!options.upsert) return null;
      const created = hydrate({
        _id: oid(), createdAt: new Date(), ...(update.$setOnInsert || {}),
      });
      applyUpdate(created, update);
      rows().push(created);
      return created;
    })),
    updateMany: jest.fn(async (filter, update = {}) => {
      const hits = rows().filter((d) => matches(d, filter));
      hits.forEach((d) => applyUpdate(d, update));
      return { matchedCount: hits.length, modifiedCount: hits.length };
    }),
    deleteMany: jest.fn(async (filter) => {
      const before = rows().length;
      db[name] = rows().filter((d) => !matches(d, filter));
      return { deletedCount: before - db[name].length };
    }),
    // Pipelines are opaque to this shim; a test that needs one stubs its result
    // rather than letting an unimplemented stage return a misleading [].
    aggregate: jest.fn(async () => aggregates[name] || []),
  };
}

/** Insert a document directly, bypassing route logic. Returns it. */
function seed(name, doc) {
  const d = hydrate({ _id: doc._id || oid(), createdAt: new Date(), ...doc });
  db[name].push(d);
  return d;
}

module.exports = { db, aggregates, collection, seed, reset, oid, matches };
