import axios from "axios";

async function test() {
  try {
    const response = await axios.post(
      "http://localhost:3000/api/v1/payments/authorize",
      {
        order_id: "order-" + Date.now(),
        customer_id: "cust-123",
        amount: 5000,
        currency: "USD",
        card_details: {
          number: "4111111111111111",
          expiry: "12/2030",
          cvv: "123",
        },
      },
      {
        headers: {
          "Idempotency-Key": "test-" + Date.now(),
        },
      }
    );

    console.log("Success:", response.data);
  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message);
  }
}

test();
