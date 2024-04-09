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

  return count <= maxQty;
};

const applySKURules = (lineItems, sku, criteria, totalValue) => {
  let count = 0;

  let value = null;

  lineItems.forEach((lineItem) => {
    if (lineItem?.variant.sku === sku) {
      if (criteria === "quantity") {
        count += lineItem.quantity;
      }
      if (criteria === "value") {
        value = parseInt(lineItem.totalPrice.centAmount) <= totalValue * 100;
      }
    }
  });

  if (value !== null) {
    return value;
  }
  return count <= totalValue;
};

app.post("/ct-cart", async (req, res) => {
  const storeKey = req.body.resource.obj.store.key;
  const customerId = req.body.resource.obj.customerId;
  const cart = req.body.resource.obj;
  const lineItems = cart.lineItems;

  console.log(JSON.stringify(lineItems));
  const totalPrice = cart.totalPrice.centAmount / 100;

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

  const { maximumCartValue, maxSamples, productRules } = await fetchCt(
    `custom-objects/${objectKey}/${storeKey}`,
    {
      method: "GET",
    }
  )
    .then((response) => response.json())
    .then((response) => {
      return response.value;
    });

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

  if (
    !applySampleRules(
      lineItems,
      maxSamples,
      "600388e2-0976-493e-929d-91800b0b3207"
    )
  ) {
    res.status(400).json({
      errors: [
        {
          code: "InvalidInput",
          message: "The maximum quantity of Samples has been exceeded.",
        },
      ],
    });
  }

  let productErrorFound = false;
  let ruleFlag = null;
  productRules.forEach((rule) => {
    if (!productErrorFound) {
      ruleFlag = rule;
      if (rule.type === "sku") {
        productErrorFound = !applySKURules(
          lineItems,
          rule.equals,
          rule.criteria,
          rule.value
        );
      }
    }
  });

  if (productErrorFound) {
    return res.status(400).json({
      errors: [
        {
          code: "InvalidInput",
          message: `The maximum total ${ruleFlag.criteria} allowed for ${ruleFlag.type} = ${ruleFlag.equals} has been exceeded.`,
        },
      ],
    });
  }
  return res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server up and running on ${PORT}`);
});
