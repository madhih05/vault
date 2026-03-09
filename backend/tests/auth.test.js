process.env.NODE_ENV = "test";

const request = require("supertest");

function createApp() {
    jest.resetModules();

    jest.doMock("../src/controllers/authController", () => ({
        login: jest.fn((req, res) =>
            res.status(200).json({ ok: true, user: req.body.username }),
        ),
        register: jest.fn((req, res) => res.status(201).json({ ok: true })),
        changePassword: jest.fn((req, res) =>
            res.status(200).json({ ok: true }),
        ),
        resetWithKey: jest.fn((req, res) => res.status(200).json({ ok: true })),
    }));

    const express = require("express");
    const authRoutes = require("../src/routes/auth");

    const app = express();
    app.use(express.json());
    app.use("/api", authRoutes);

    return app;
}

describe("Auth route hardening", () => {
    test("POST /api/login returns 400 when required fields are missing", async () => {
        const app = createApp();

        const response = await request(app)
            .post("/api/login")
            .send({ username: "" });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Validation failed.");
        expect(Array.isArray(response.body.details)).toBe(true);
    });

    test("POST /api/login returns 429 after too many attempts", async () => {
        const app = createApp();
        const payload = { username: "validUser", password: "validPass123" };

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const response = await request(app)
                .post("/api/login")
                .send(payload);
            expect(response.status).toBe(200);
        }

        const blockedResponse = await request(app)
            .post("/api/login")
            .send(payload);
        expect(blockedResponse.status).toBe(429);
        expect(blockedResponse.body.error).toMatch(/Too many login attempts/i);
    });
});
