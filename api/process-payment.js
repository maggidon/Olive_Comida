const { Client, Environment } = require("square")

const client = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === "production"
        ? Environment.Production
        : Environment.Sandbox,
})

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    try {
        const { amount, orderDetails } = req.body

        const lineItems = orderDetails.items.split(", ").map(item => ({
            name: item,
            quantity: "1",
            basePriceMoney: {
                amount: BigInt(Math.round((amount / orderDetails.items.split(", ").length) * 100)),
                currency: "GBP"
            }
        }))

        const response = await client.checkoutApi.createPaymentLink({
            idempotencyKey: crypto.randomUUID(),
            order: {
                locationId: process.env.SQUARE_LOCATION_ID,
                lineItems,
                metadata: {
                    customerName: orderDetails.name,
                    phone: orderDetails.phone,
                    address: orderDetails.address,
                    fulfillment: orderDetails.fulfillment,
                    total: orderDetails.total
                }
            },
            checkoutOptions: {
                redirectUrl: "https://www.olivecomida.com",
                askForShippingAddress: false,
            },
            prePopulatedData: {
                buyerPhoneNumber: orderDetails.phone,
            }
        })

        const url = response.result.paymentLink.url
        res.status(200).json({ success: true, checkoutUrl: url })

    } catch (error) {
        console.error("Payment error:", error)
        res.status(500).json({ success: false, error: error.message || "Failed to create checkout" })
    }
}
