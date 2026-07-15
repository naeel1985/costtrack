// Local-only Postgres-wire server backed by PGlite, for verifying the app
// without a full Postgres install. NOT for production.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create({ dataDir: "./.pglite-data" });
const server = new PGLiteSocketServer({ db, port: 5432, host: "127.0.0.1" });
await server.start();
console.log("PGlite socket server listening on 127.0.0.1:5432");

process.on("SIGINT", async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
