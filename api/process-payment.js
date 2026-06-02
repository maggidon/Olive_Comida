const { SquareClient, SquareEnvironment } = require("square")

const client = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === "production"
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
})

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    try {
        const { orderDetails } = req.body

        const lineItems = orderDetails.basket.map(item => ({
            name: `${item.name} (${item.spice})`,
            quantity: "1",
            basePriceMoney: {
                amount: BigInt(Math.round(item.price * 100)),
                currency: "GBP"
            }
        }))

        const response = await client.checkout.paymentLinks.create({
            idempotencyKey: crypto.randomUUID(),
            order: {
                locationId: process.env.SQUARE_LOCATION_ID,
                lineItems,
                metadata: {
                    customerName: orderDetails.name || "Collection",
                    phone: orderDetails.phone || "Not provided",
                    address: orderDetails.address || "Collection",
                    fulfillment: orderDetails.fulfillment || "collection",
                }
            },
            checkoutOptions: {
                redirectUrl: "https://www.olivecomida.com",
                askForShippingAddress: false,
            }
        })

        const url = response.paymentLink.url
        res.status(200).json({ success: true, checkoutUrl: url })

    } catch (error) {
        console.error("Payment error:", error)
        res.status(500).json({ success: false, error: error.message || "Failed to create checkout" })
    }
}
