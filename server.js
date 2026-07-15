// Production entry point for Phusion Passenger (cPanel "Setup Node.js App").
// cPanel runs this file directly with Node, so we boot Next.js in production and
// let Passenger intercept `.listen()` to bind the request socket it manages.
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Cashflow ready on port ${port}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start server:", err);
    process.exit(1);
  });
