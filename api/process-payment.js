const { ApiError, Client, Environment } = require("squareup")

const client = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === "production"
        ? Environment.Production
        : Environment.Sandbox,
})

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "https://www.olivecomida.com")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    try {
        const { sourceId, amount, orderDetails } = req.body

        const response = await client.paymentsApi.createPayment({
            sourceId,
            idempotencyKey: crypto.randomUUID(),
            amountMoney: {
                amount: Math.round(amount * 100),
                currency: "GBP",
            },
            locationId: process.env.SQUARE_LOCATION_ID,
            note: JSON.stringify(orderDetails),
        })

        const payment = response.result.payment
        res.status(200).json({ success: true, paymentId: payment.id })

    } catch (error) {
        console.error("Payment error:", error)
        res.status(500).json({ success: false, error: error.message || "Payment failed" })
    }
}
