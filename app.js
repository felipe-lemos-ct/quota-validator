import express from "express";
import bodyParser from "body-parser";
const app = express();
import { fetchCt } from "./commercetools/auth.js";

const PORT = process.env.PORT || 8080;
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Welcome to subscription handler.");
});

app.post("/ct-cart", async (req, res) => {
  //const store = req.body.resource.obj.store;
  const storeKey = req.body.resource.obj.store.key;
  const customerId = req.body.resource.obj.customerId;
  const cart = req.body.resource.obj;
  //console.log("Cart is:");
  //console.log(JSON.stringify(cart.totalPrice));

  totalPrice = cart.totalPrice.centAmount / 100;

  console.log("Total price is:");
  console.log(totalPrice);

  const customerGroupKey = await fetchCt(
    `customers/${customerId}?expand=customerGroup`,
    {
      method: "GET",
    }
  )
    .then((response) => response.json())
    .then((response) => {
      return response?.customerGroup?.obj?.key;
    });

  const { maximumCartValue, productRules } = await fetchCt(
    `custom-objects/general-cart-rules/${storeKey}`,
    {
      method: "GET",
    }
  )
    .then((response) => response.json())
    .then((response) => {
      return response.value;
    });

  console.log("Maximum value for cart:");
  console.log(maximumCartValue);
  console.log("Product rules:");
  console.log(productRules);

  return res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server up and running on ${PORT}`);
});
