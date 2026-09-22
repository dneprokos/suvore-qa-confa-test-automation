const http = require("node:http");

const port = Number(process.env.PORT ?? 3000);

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/webhooks/orders") {
      res.writeHead(202).end();
      return;
    }
    res.writeHead(404).end();
  })
  .listen(port);
