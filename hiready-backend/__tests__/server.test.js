process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-ci-at-least-32-chars-long";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/hiready-test";

const request = require("supertest");
const jwt = require("jsonwebtoken");

// Import app without starting server (require.main !== module guards listen)
const app = require("../server");

describe("Backend health & routing", () => {
  test("GET /api/test returns 200 with working message", async () => {
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Backend is working");
  });

  test("unknown route returns 404", async () => {
    const res = await request(app).get("/api/does-not-exist-xyz");
    expect(res.status).toBe(404);
  });

  test("CORS headers present on api response", async () => {
    const res = await request(app).get("/api/test").set("Origin", "http://localhost:3000");
    // cors middleware should allow configured origin
    expect(res.headers).toHaveProperty("access-control-allow-origin");
  });
});

describe("GET /api/health reports dependencies, not just liveness", () => {
  const mongoose = require("mongoose");

  /**
   * The bug this guards: /api/test returned 200 "Backend is working" while
   * Mongo was unreachable and every login took 30 seconds to fail with a
   * generic 500. The Docker HEALTHCHECK pointed at it, so the container
   * reported healthy right through the outage.
   *
   * These tests drive readyState directly rather than stopping a real mongod,
   * because the thing under test is the mapping from connection state to
   * status code — not mongoose itself.
   */
  /**
   * readyState is a GETTER on the connection prototype. Overwriting it with a
   * plain value and then "restoring" the number leaves a data property in its
   * place — mongoose's own buffering logic reads it, so the stub leaks into
   * every later suite. (It did: the auth test two describes down went from
   * 10s to a timeout.) Capture and restore the descriptor itself.
   */
  const OWN = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");

  const setReadyState = (value) => {
    Object.defineProperty(mongoose.connection, "readyState", {
      value,
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    if (OWN) Object.defineProperty(mongoose.connection, "readyState", OWN);
    else delete mongoose.connection.readyState; // fall back to the prototype getter
  });

  test("a disconnected database makes the endpoint fail", async () => {
    setReadyState(0);
    const res = await request(app).get("/api/health");
    // 503, not 200. This is the whole point.
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.database).toBe("disconnected");
  });

  test("a connected database reports ok", async () => {
    setReadyState(1);
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
  });

  test("it never leaks a provider key, only whether one is set", async () => {
    // The endpoint is unauthenticated so a probe can reach it, which means it
    // must give an attacker nothing. Booleans only — no value, no prefix, no
    // length.
    const secret = "gsk_thisisafakekeyusedonlyinthistest";
    const prevGroq = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = secret;
    try {
      setReadyState(1);
      const res = await request(app).get("/api/health");
      expect(res.body.providers.groq).toBe(true);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(secret);
      expect(body).not.toContain(secret.slice(0, 8));
    } finally {
      if (prevGroq === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = prevGroq;
    }
  });

  test("an unset provider reads false rather than being omitted", async () => {
    const prev = process.env.DEEPGRAM_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
    try {
      setReadyState(1);
      const res = await request(app).get("/api/health");
      expect(res.body.providers.deepgram).toBe(false);
    } finally {
      if (prev !== undefined) process.env.DEEPGRAM_API_KEY = prev;
    }
  });
});

describe("the server refuses to boot without a database URI", () => {
  test("MONGO_URI is required, like JWT_SECRET", () => {
    // It used to skip the connect entirely and boot a database-less server
    // that only failed at request time.
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    expect(src).toMatch(/if \(!process\.env\.MONGO_URI\) \{[\s\S]{0,200}throw new Error/);
  });

  test("connection failure is bounded well below the 30s default", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const match = src.match(/serverSelectionTimeoutMS:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeLessThanOrEqual(10000);
  });
});

describe("Auth middleware", () => {
  test("protected route without token returns strict 401", async () => {
    const res = await request(app).get("/api/questions/wrong-answers/me");
    expect(res.status).toBe(401);
  });

  test("protected route with invalid token returns strict 401", async () => {
    const res = await request(app)
      .get("/api/questions/wrong-answers/me")
      .set("Authorization", "Bearer invalid.token.here");
    expect(res.status).toBe(401);
  });

  test("protected route with valid token but no DB still reaches handler (auth passes)", async () => {
    const token = jwt.sign({ id: "000000000000000000000001" }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [] });
    // Should be 400 (validation) not 401 – proves auth passed
    expect(res.status).toBe(400);
  });
});

describe("AI routes validation", () => {
  const authHeader = () => {
    const token = jwt.sign({ id: "test-user" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    return `Bearer ${token}`;
  };

  test("POST /api/ai/chat with empty messages returns 400", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", authHeader())
      .send({ messages: [] });
    expect(res.status).toBe(400);
  });

  test("POST /api/ai/chat with valid shape attempts provider (may be 502 without key) but not 400", async () => {
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", authHeader())
      .send({ messages: [{ role: "user", content: "hello" }] });
    // Without GROQ_API_KEY it will be 502, with key would be 200 – neither 400 nor 401
    expect([200, 502]).toContain(res.status);
  });
});

afterAll(async () => {
  const mongoose = require("mongoose");
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect().catch(() => {});
  }
});
