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

const applyCategoryRules = (lineItems, categoryId, criteria, totalValue) => {
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
  errorFound = Promise.all(fetchPromises)
    .then((promises) => {
      if (criteria === "quantity") {
        //NEED TO CHECK QTY OF THAT LINE ITEM:
        console.log("Category Quantity Validation");
        let lineQty = 0;
        promises.forEach((promise) => {
          promise.categories.forEach((category) => {
            if (category.id === wantedCategoryId) {
              lineQty += promise.lineItem.quantity;
            }
          });
        });

        console.log("Category Quantity Validation - Line Item qty:");
        console.log("Max value: ", totalValue);
        console.log("LineItem Qty:", lineQty);
        console.log(lineQty > totalValue);

        if (lineQty > totalValue) {
          errorFound = true;
        }

        /**
        const categoriesForFlatten = promises.map((promise) => {
          if (promise.categories.length > 0) {
            return promise.categories;
          }
        });

        const flatCategories = categoriesForFlatten.flat();

        let categoryIds = flatCategories.map((category) => {
          if (category) {
            return category.id;
          }
        });

        categoryIds = categoryIds.filter(Boolean);

        let categoryIdsAndCounts = categoryIds?.reduce(function (
          value,
          value2
        ) {
          return value[value2] ? ++value[value2] : (value[value2] = 1), value;
        },
        {});

        if (!errorFound) {
          console.log("Category Quantity Validation - Line Items count:");
          console.log("Max value count: ", totalValue);
          console.log(
            "LineItem Qty count:",
            categoryIdsAndCounts[wantedCategoryId]
          );
          console.log(categoryIdsAndCounts[wantedCategoryId] > totalValue);
          if (parseInt(categoryIdsAndCounts[wantedCategoryId]) > totalValue) {
            errorFound = true;
          }
        }
      } */
      }
      return errorFound;
    })
    .catch((error) => {
      console.error("Error fetching categories:", error);
    });
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

  const totalPrice = cart.totalPrice.centAmount / 100;

  console.log(cart);

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

  if (totalPrice > maximumCartValue) {
    errorFound = true;
    ruleFlag = { criteria: "value" };
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

  if (!errorFound) {
    let productErrorFound = false;
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
        if (rule.type === "category") {
          console.log("Category validation:");
          console.log(rule);
          ruleFlag = {
            type: rule.type,
            value: rule.value,
            criteria: rule.criteria,
            equals: rule.equals.categoryName["en-US"],
          };
          productErrorFound = applyCategoryRules(
            lineItems,
            rule.equals.categoryId,
            rule.criteria,
            rule.value
          );
        }
      }
    });
    errorFound = productErrorFound;
  }

  if (errorFound) {
    return res.status(400).json({
      errors: [
        {
          code: "InvalidInput",
          message: `The maximum total ${ruleFlag.criteria} allowed ${
            ruleFlag.type ? `for ${ruleFlag.type} = ${ruleFlag.equals}` : `cart`
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
