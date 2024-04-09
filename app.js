import express from "express";
import bodyParser from "body-parser";
const app = express();
import { fetchCt } from "./commercetools/auth.js";

const PORT = process.env.PORT || 8080;
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Welcome to subscription handler.");
});

const applySampleRules = (lineItems, maxQty, sampleProductType) => {
  let count = 0;
  lineItems.forEach((lineItem) => {
    if (lineItem?.productType.id === sampleProductType) {
      count += lineItem.quantity;
    }
  });

  console.log(count);
  return count <= maxQty;
};

app.post("/ct-cart", async (req, res) => {
  //const store = req.body.resource.obj.store;
  const storeKey = req.body.resource.obj.store.key;
  const customerId = req.body.resource.obj.customerId;
  const cart = req.body.resource.obj;
  const lineItems = cart.lineItems;
  //console.log("LineItems are:");
  //console.log(JSON.stringify(lineItems));

  const totalPrice = cart.totalPrice.centAmount / 100;

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

  let objectKey = "general-cart-rules";
  if (customerGroupKey === "employee") {
    objectKey = "employee-cart-rules";
  }

  const { maximumCartValue, productRules } = await fetchCt(
    `custom-objects/${objectKey}/${storeKey}`,
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

  if (totalPrice > maximumCartValue) {
    res.status(400).json({
      errors: [
        {
          code: "InvalidInput",
          message: "The maximum value for the cart has been exceeded.",
        },
      ],
    });
  }

  if (!applySampleRules(lineItems, 2, "600388e2-0976-493e-929d-91800b0b3207")) {
    res.status(400).json({
      errors: [
        {
          code: "InvalidInput",
          message: "The maximum qty of Samples has been exceeded.",
        },
      ],
    });
  }

  return res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server up and running on ${PORT}`);
});
