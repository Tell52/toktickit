import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /api/tickets", () => {
    it("returns 200 and a paginated list of tickets for a valid requester", async () => {
        // สมมติว่า Requester ID 1 มีอยู่ในระบบจากการ Seed
        const res = await request(app).get("/api/tickets?requesterId=1");

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("data");
        expect(res.body).toHaveProperty("meta");
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("returns 403 Forbidden if requesterId is missing", async () => {
        const res = await request(app).get("/api/tickets");

        expect(res.status).toBe(403);
        expect(res.body.error).toBe("Requester ID is required to view tickets");
    });
});
