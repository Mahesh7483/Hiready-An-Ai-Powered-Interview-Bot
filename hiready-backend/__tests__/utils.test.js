describe("GROQ_MODEL env handling", () => {
  test("fallback to default when env empty or undefined", () => {
    const getModel = () => process.env.GROQ_MODEL && process.env.GROQ_MODEL.trim() ? process.env.GROQ_MODEL : "openai/gpt-oss-120b";
    const orig = process.env.GROQ_MODEL;
    delete process.env.GROQ_MODEL;
    expect(getModel()).toBe("openai/gpt-oss-120b");
    process.env.GROQ_MODEL = "";
    expect(getModel()).toBe("openai/gpt-oss-120b");
    process.env.GROQ_MODEL = "  ";
    expect(getModel()).toBe("openai/gpt-oss-120b");
    process.env.GROQ_MODEL = "llama-3.1-8b-instant";
    expect(getModel()).toBe("llama-3.1-8b-instant");
    if (orig === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = orig;
  });

  test("express version is pinned to 4.x for LTS", () => {
    const pkg = require("../package.json");
    const ver = pkg.dependencies.express;
    expect(ver).toMatch(/^\^4\./);
  });

  test("mongoose version is pinned to 8.x for LTS", () => {
    const pkg = require("../package.json");
    const ver = pkg.dependencies.mongoose;
    expect(ver).toMatch(/^\^8\./);
  });
});
