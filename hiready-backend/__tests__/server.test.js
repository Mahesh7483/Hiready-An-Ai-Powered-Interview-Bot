process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-ci";
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
  await mongoose.disconnect().catch(() => {});
});
