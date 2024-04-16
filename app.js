import express from "express";
import bodyParser from "body-parser";
const app = express();
import { fetchCt } from "./commercetools/auth.js";

const PORT = process.env.PORT || 8080;
app.use(bodyParser.json());

const applySampleRules = (lineItems, maxQty, sampleProductType) => {
  let count = 0;
  lineItems.forEach((lineItem) => {
    if (lineItem?.productType.id === sampleProductType) {
      count += lineItem.quantity;
    }
  });

  console.log("Samples Quantity Validation:");
  console.log("Max Qty: ", maxQty);
  console.log("Quantity on Cart:", count);
  console.log("Quota exceeded? ", count > maxQty);
  return count > maxQty;
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
      console.log("Category Quantity Validation");
      let lineQty = 0;
      let lineTtlValue = 0;
      let currency = "";
      promises.forEach((promise) => {
        promise.categories.forEach((category) => {
          if (category.id === wantedCategoryId) {
            lineQty += promise.lineItem.quantity;
            lineTtlValue += promise.lineItem.totalPrice.centAmount;
            currency = promise.lineItem.totalPrice.currencyCode;
          }
        });
      });
      if (criteria === "quantity") {
        console.log("Category Quantity Validation - Line Item qty:");
        console.log("Max value: ", totalValue);
        console.log("LineItem Qty:", lineQty);
        console.log("Quota exceeded? ", lineQty > totalValue);
        if (lineQty > totalValue) {
          errorFound = true;
        }
      } else if (criteria === "value") {
        console.log(
          "Checking if LineItem has value on currency ",
          totalValue.currencyCode
        );
        if (currency === totalValue.currencyCode) {
          console.log("Category Value Validation - Line Item Value:");
          console.log("Max value: ", totalValue);
          console.log("LineItems Value:", lineTtlValue);
          console.log("Quota exceeded? ", lineTtlValue > totalValue.centAmount);
          if (lineTtlValue > totalValue.centAmount) {
            return true;
          }
        } else {
          console.log(
            "No entries for currency ",
            totalValue.currencyCode,
            " found. Skipping..."
          );
          return false;
        }

        return errorFound;
      }
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
        value = lineItem.totalPrice;
      }
    }
  });

  if (value !== null) {
    console.log(
      "Checking if SKU ",
      sku,
      " has value on currency ",
      totalValue.currencyCode
    );
    if (totalValue.currencyCode === value.currencyCode) {
      console.log("SKU Maximum Value Validation:");
      console.log("Max Value: ", totalValue);
      console.log("Value on cart:", value);
      console.log(
        "Value Quota exceeded? ",
        value.centAmount > totalValue.centAmount
      );
      if (value.centAmount > totalValue.centAmount) {
        return true;
      } else {
        return false;
      }
    } else {
      console.log(
        "No entries for currency ",
        totalValue.currencyCode,
        " found. Skipping..."
      );
      return false;
    }
  }

  console.log("SKU Maximum Quantity Validation:");
  console.log("Max Quantity: ", totalValue);
  console.log("Qty on cart:", count);
  console.log("Quota exceeded? ", count > totalValue * 100);
  return count > totalValue;
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
        value += lineItem.totalPrice.centAmount;
      }
    }
  });

  if (value !== null) {
    console.log(
      "Checking if LineItem has value on currency ",
      totalValue.currencyCode
    );
    if (totalValue.currencyCode === value.currencyCode) {
      console.log("Flag Maximum Value Validation:");
      console.log("Max Value: ", totalValue);
      console.log("Value on cart:", value);
      console.log("Quota exceeded? ", value > totalValue.centAmount);
      hasError = value > totalValue.centAmount;
    }
  } else {
    console.log(
      "No entries for currency ",
      totalValue.currencyCode,
      " found. Skipping..."
    );
    return false;
  }

  if (count > 0) {
    console.log("Flag Maximum Quantity Validation:");
    console.log("Max Quantity: ", totalValue);
    console.log("Qty on cart:", count);
    console.log("Quota exceeded? ", count > totalValue * 100);
    hasError = count > totalValue;
  }
  return hasError;
};

app.post("/ct-cart", async (req, res) => {
  const storeKey = req.body.resource.obj.store?.key || "";
  const customerId = req.body.resource.obj.customerId;
  const cart = req.body.resource.obj;
  const lineItems = cart.lineItems;

  if (storeKey !== "") {
    const totalPrice = cart.totalPrice;

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

    /**
    let objectKey = "general-cart-rules";
    if (customerGroupKey === "employee") {
      objectKey = "employee-cart-rules";
    }
     */

    const objectKey = customerGroupKey;

    try {
      console.log("Fetching rules for ", objectKey);
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
    } catch (error) {
      console.log("Fetching rules for All Customers");
      try {
        const { maximumCartValue, maxSamples, productRules } = await fetchCt(
          `custom-objects/general-cart-rules/${storeKey}`,
          {
            method: "GET",
          }
        )
          .then((response) => response.json())
          .then((response) => {
            return response.value;
          });
      } catch (error) {
        console.log("No rules found... skipping");
        const maximumCartValue = null;
        const maxSamples = null;
        const productRules = [];
        return res.status(200).end();
      }
    }
    let errorFound = false;
    let ruleFlag = null;

    if (maximumCartValue) {
      console.log("Cart Maximum value Validation:");
      console.log("Max Cart values: ", maximumCartValue);
      console.log("Cart Total Value:", totalPrice);
      console.log(totalPrice > maximumCartValue);
      maximumCartValue.map((maxCartRule) => {
        if (totalPrice.currencyCode === maxCartRule.currencyCode) {
          if (totalPrice.centAmount > maxCartRule.centAmount) {
            errorFound = true;
            ruleFlag = { criteria: "value" };
          }
        }
      });
    }

    if (!errorFound && maxSamples) {
      console.log("Samples validation:");
      ruleFlag = { type: "samples", criteria: "quantity", equals: "Samples" };
      errorFound = applySampleRules(
        lineItems,
        maxSamples,
        "600388e2-0976-493e-929d-91800b0b3207"
      );
    }

    let productErrorFound = false;

    if (!errorFound && storeKey !== "") {
      for (const rule of productRules) {
        if (!productErrorFound) {
          ruleFlag = rule;
          if (rule.type === "sku") {
            productErrorFound = applySKURules(
              lineItems,
              rule.equals,
              rule.criteria,
              rule.value
            );
          }
          if (rule.type === "category") {
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
  }
  return res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server up and running on ${PORT}`);
});
