#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000/api";
const USERNAME = process.env.TEST_USERNAME || "madhih";
const PASSWORD = process.env.TEST_PASSWORD || "madhih030702?";

function logStep(message) {
    console.log(`\n[STEP] ${message}`);
}

function fail(message, details) {
    console.error(`\n[FAIL] ${message}`);
    if (details) {
        console.error(details);
    }
    process.exit(1);
}

function assert(condition, message, details) {
    if (!condition) {
        fail(message, details);
    }
}

async function requestJson(pathname, options = {}) {
    const response = await fetch(`${BASE_URL}${pathname}`, options);
    let body = null;

    try {
        body = await response.json();
    } catch (_error) {
        body = null;
    }

    return { response, body };
}

async function run() {
    console.log("Running Vault functional API checks...");
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Username: ${USERNAME}`);

    logStep("Unauthorized access check on GET /files");
    {
        const { response, body } = await requestJson("/files");
        assert(response.status === 401, "Expected 401 for missing token", body);
    }

    logStep("Login with provided credentials");
    let token;
    {
        const { response, body } = await requestJson("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        });

        assert(
            response.status === 200,
            "Login failed. Check credentials/server state.",
            body,
        );
        assert(
            body && typeof body.token === "string",
            "Token missing in login response",
            body,
        );
        token = body.token;
    }

    logStep("Invalid login should fail");
    {
        const { response, body } = await requestJson("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: USERNAME,
                password: `${PASSWORD}-wrong`,
            }),
        });

        assert(
            response.status === 400,
            "Expected 400 for invalid credentials",
            body,
        );
    }

    logStep("List files with auth");
    {
        const { response, body } = await requestJson("/files?page=1&limit=5", {
            headers: { "x-auth-token": token },
        });

        assert(response.status === 200, "Expected 200 from GET /files", body);
        assert(
            body && Array.isArray(body.files),
            "Expected files array from GET /files",
            body,
        );
    }

    logStep("Upload an audio file (.mp3)");
    const uniqueName = `functional-test-${Date.now()}.mp3`;
    const tempPath = path.join(os.tmpdir(), uniqueName);
    fs.writeFileSync(tempPath, "functional test audio payload", "utf8");

    let uploadedId;

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(tempPath);
        const blob = new Blob([fileBuffer], { type: "audio/mpeg" });
        formData.append("vaultFile", blob, uniqueName);

        const uploadResponse = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            headers: { "x-auth-token": token },
            body: formData,
        });
        const uploadBody = await uploadResponse.json();

        assert(uploadResponse.status === 200, "Upload failed", uploadBody);
        assert(
            uploadBody && uploadBody.fileData && uploadBody.fileData._id,
            "Missing fileData._id after upload",
            uploadBody,
        );
        uploadedId = uploadBody.fileData._id;

        if (uploadBody.fileData.mimeType) {
            assert(
                uploadBody.fileData.mimeType.includes("audio") ||
                    uploadBody.fileData.mimeType === "application/octet-stream",
                "Unexpected uploaded mimeType",
                uploadBody.fileData,
            );
        }
    } finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }

    logStep("Filter file list by uploaded filename");
    {
        const { response, body } = await requestJson(
            `/files?page=1&limit=20&fileName=${encodeURIComponent(uniqueName)}`,
            {
                headers: { "x-auth-token": token },
            },
        );

        assert(response.status === 200, "Filtered list request failed", body);
        assert(
            body && Array.isArray(body.files),
            "Expected files array in filtered list",
            body,
        );
    }

    logStep("View uploaded file stream");
    {
        const viewResponse = await fetch(
            `${BASE_URL}/files/${uploadedId}/view`,
            {
                headers: { "x-auth-token": token },
            },
        );

        assert(
            viewResponse.status === 200,
            "Expected 200 when viewing uploaded file",
            {
                status: viewResponse.status,
            },
        );

        const contentType = viewResponse.headers.get("content-type") || "";
        const disposition =
            viewResponse.headers.get("content-disposition") || "";
        assert(contentType.length > 0, "Missing content-type on view response");
        assert(
            disposition.includes("inline") ||
                disposition.includes("attachment"),
            "Missing expected content-disposition",
            disposition,
        );

        // Consume body so stream is fully handled during test execution.
        await viewResponse.arrayBuffer();
    }

    logStep("Delete uploaded file");
    {
        const { response, body } = await requestJson(`/files/${uploadedId}`, {
            method: "DELETE",
            headers: { "x-auth-token": token },
        });

        assert(response.status === 200, "Delete failed", body);
    }

    logStep("View after delete should return not found");
    {
        const { response, body } = await requestJson(
            `/files/${uploadedId}/view`,
            {
                headers: { "x-auth-token": token },
            },
        );

        assert(
            response.status === 404,
            "Expected 404 after deleting file",
            body,
        );
    }

    logStep("change-password negative case (wrong currentPassword)");
    {
        const { response, body } = await requestJson("/change-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": token,
            },
            body: JSON.stringify({
                currentPassword: "wrong-current-password",
                newPassword: "temporaryNewPass123",
            }),
        });

        assert(
            response.status === 400,
            "Expected 400 when currentPassword is wrong",
            body,
        );
    }

    logStep("reset-with-key validation negative case");
    {
        const { response, body } = await requestJson("/reset-with-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: USERNAME,
                recoveryKey: "INVALID",
                newPassword: "temporaryNewPass123",
            }),
        });

        assert(
            response.status === 400,
            "Expected 400 for invalid recoveryKey format",
            body,
        );
    }

    console.log("\n[PASS] Functional checks completed successfully.");
}

run().catch((error) => {
    fail("Unexpected error while running tests", error);
});
