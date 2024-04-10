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

const applyCategoryRules = async (
  lineItems,
  categoryId,
  criteria,
  totalValue
) => {
  const wantedCategoryId = categoryId;

  const fetchPromises = lineItems.map(async (lineItem) => {
    const response = await fetchCt(`products/${lineItem.productId}`, {
      method: "GET",
    });
    const responseData = await response.json();
    return {
      lineItem: lineItem,
      categories: responseData.masterData?.current?.categories,
    };
  });
  let errorFound = false;
  const result = await Promise.all(fetchPromises)
    .then((promises) => {
      //NEED TO CHECK QTY OF THAT LINE ITEM:
      console.log("Category Quantity Validation");
      let lineQty = 0;
      let lineTtlValue = 0;
      promises.forEach((promise) => {
        promise.categories.forEach((category) => {
          if (category.id === wantedCategoryId) {
            lineQty += promise.lineItem.quantity;
            lineTtlValue += promise.lineItem.totalPrice.centAmount / 100;
          }
        });
      });

      if (criteria === "quantity") {
        console.log("Category Quantity Validation - Line Item qty:");
        console.log("Max value: ", totalValue);
        console.log("LineItem Qty:", lineQty);
        console.log(lineQty > totalValue);
        if (lineQty > totalValue) {
          errorFound = true;
        }
      } else if (criteria === "value") {
        console.log("Category Value Validation - Line Item Value:");
        console.log("Max value: ", totalValue);
        console.log("LineItems Value:", lineTtlValue);
        console.log(lineTtlValue > totalValue);
        if (lineTtlValue > totalValue) {
          errorFound = true;
        }
      }
      return errorFound;
    })
    .catch((error) => {
      console.error("Error fetching categories:", error);
    });

  return result;
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

const applyFlagRules = (lineItems, equals, criteria, totalValue) => {
  let count = 0;
  let value = null;
  let hasError = false;

  lineItems.forEach((lineItem) => {
    const flags = lineItem.variant.attributes.find(
      (attribute) => attribute.name === "flags"
    );

    if (flags?.value.find((flag) => flag === equals)) {
      if (criteria === "quantity") {
        count += lineItem.quantity;
      }
      if (criteria === "value") {
        value += parseInt(lineItem.totalPrice.centAmount);
      }
    }
  });

  if (value !== null) {
    console.log("Flag Maximum Value Validation:");
    console.log("Max Value: ", totalValue);
    console.log("Value on cart:", value);
    console.log(value > totalValue * 100);
    hasError = value > totalValue * 100;
  }

  if (count > 0) {
    console.log("Flag Maximum Quantity Validation:");
    console.log("Max Quantity: ", totalValue);
    console.log("Qty on cart:", count);
    console.log(count > totalValue * 100);
    hasError = count > totalValue;
  }
  return hasError;
};

app.post("/ct-cart", async (req, res) => {
  const storeKey = req.body.resource.obj.store.key;
  const customerId = req.body.resource.obj.customerId;
  const cart = req.body.resource.obj;
  const lineItems = cart.lineItems;

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

  let errorFound = false;
  let ruleFlag = null;

  if (maximumCartValue) {
    console.log("Cart Maximum value Validation:");
    console.log("Max Cart value: ", maximumCartValue);
    console.log("Cart Total Value:", totalPrice);
    console.log(totalPrice > maximumCartValue);
    if (totalPrice > maximumCartValue) {
      errorFound = true;
      ruleFlag = { criteria: "value" };
    }
  }

  if (
    !applySampleRules(
      lineItems,
      maxSamples,
      "600388e2-0976-493e-929d-91800b0b3207"
    )
  ) {
    return res.status(400).json({
      errors: [
        {
          code: "InvalidInput",
          message: "The maximum quantity of Samples has been exceeded.",
        },
      ],
    });
  }

  let productErrorFound = false;

  if (!errorFound) {
    for (const rule of productRules) {
      if (!productErrorFound) {
        ruleFlag = rule;
        if (rule.type === "sku") {
          console.log("SKU validation:");
          productErrorFound = !applySKURules(
            lineItems,
            rule.equals,
            rule.criteria,
            rule.value
          );
        }
        if (rule.type === "category") {
          console.log("Category validation:");
          ruleFlag = {
            type: rule.type,
            value: rule.value,
            criteria: rule.criteria,
            equals: rule.equals.categoryName["en-US"],
          };
          productErrorFound = await applyCategoryRules(
            lineItems,
            rule.equals.categoryId,
            rule.criteria,
            rule.value
          );
        }
        if (rule.type === "flag") {
          console.log("Flag validation:");
          ruleFlag = rule;
          productErrorFound = applyFlagRules(
            lineItems,
            rule.equals,
            rule.criteria,
            rule.value
          );
        }
      }
    }
    errorFound = productErrorFound;
  }

  if (errorFound) {
    return res.status(400).json({
      errors: [
        {
          code: "InvalidInput",
          message: `The maximum total ${ruleFlag.criteria} allowed ${
            ruleFlag.type
              ? `for ${ruleFlag.type} = ${ruleFlag.equals}`
              : `for cart`
          } has been exceeded.`,
        },
      ],
    });
  }

  return res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server up and running on ${PORT}`);
});
