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
  const store = req.body.resource.obj.store;
  const customerId = req.body.resource.obj.customerId;

  console.log("store is:");
  console.log(store);

  /**
  const buffer = Buffer.from(message.data, "base64");
  const data = buffer ? JSON.parse(buffer.toString()) : null;
 */

  fetchCt(`customers/${customerId}?expand=customerGroup`, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((response) => {
      console.log("Customer group key:");
      console.log(JSON.stringify(response?.customerGroup?.obj?.key, null, 4));
      // console.log("Locale is", response.locale);
    });

  fetchCt(`custom-objects/general-cart-rules/french-store-test`, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((response) => {
      //console.log("Custom objects:");
      //console.log(JSON.stringify(response, null, 4));
      // console.log("Locale is", response.locale);
    });

  return res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server up and running on ${PORT}`);
});
