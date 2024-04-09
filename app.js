import express from "express";
import bodyParser from "body-parser";
const app = express();
import { fetchCt } from "./commercetools/auth.js";

const PORT = process.env.PORT || 8080;
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Welcome to subscription handler.");
});

app.post("/ct-cart", (req, res) => {
  // console.log("what?");
  const message = req.body ? req.body.message : null;

  console.log(JSON.stringify(req));

  const buffer = Buffer.from(message.data, "base64");
  const data = buffer ? JSON.parse(buffer.toString()) : null;

  fetchCt(`custom-objects/general-cart-rules/french-store-test`, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((response) => {
      console.log("Custom objects:");
      console.log(JSON.stringify(response, null, 4));
      // console.log("Locale is", response.locale);
    });

  return res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server up and running on ${PORT}`);
});
