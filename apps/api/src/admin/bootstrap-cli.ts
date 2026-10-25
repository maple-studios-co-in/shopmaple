import { PrismaClient } from "@prisma/client";
import { hashPassword, staffInputSchema } from "./auth.js";
async function main() {
    if (process.argv.length !== 4 || process.stdin.isTTY)
        throw Error("Usage: provide email and editor|publisher arguments, with the password on private standard input.");
    let input = "";
    for await (const chunk of process.stdin) {
        input += chunk.toString();
        if (Buffer.byteLength(input) > 512)
            throw Error("Invalid input");
    }
    const data = staffInputSchema.parse({ email: process.argv[2], role: process.argv[3], password: input.replace(/\r?\n$/, "") });
    const passwordHash = await hashPassword(data.password);
    const db = new PrismaClient();
    try {
        // Creation only: an existing identity cannot be silently reset or promoted.
        await db.shopAdmin.create({ data: { email: data.email, role: data.role, passwordHash } });
        console.log("Staff account created.");
    }
    finally {
        await db.$disconnect();
    }
}
main().catch(() => { console.error("Staff account was not created. Check the private input, role, database and whether the account already exists."); process.exitCode = 1; });
