const { SquareClient, SquareEnvironment } = require("square")
const { createClient } = require("@supabase/supabase-js")

const client = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === "production"
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
})

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
)

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

        const total = orderDetails.basket.reduce((sum, item) => sum + item.price, 0)

        // 1. Save the order to our own database FIRST, status = pending
        const { data: savedOrder, error: dbError } = await supabase
            .from("orders")
            .insert({
                status: "pending",
                customer_name: orderDetails.name || "Collection",
                customer_phone: orderDetails.phone || "Not provided",
                fulfillment_type: orderDetails.fulfillment || "collection",
                delivery_address: orderDetails.address || "Collection",
                postcode: orderDetails.postcode || null,
                order_note: orderDetails.note || "None",
                items: orderDetails.basket,
                total: total,
            })
            .select()
            .single()

        if (dbError) {
            console.error("Supabase insert error:", dbError)
            return res.status(500).json({ success: false, error: "Failed to save order" })
        }

        // 2. Create the Square payment link, redirecting to our confirmation page with our internal order ID
        const response = await client.checkout.paymentLinks.create({
            idempotencyKey: crypto.randomUUID(),
            order: {
                locationId: process.env.SQUARE_LOCATION_ID,
                lineItems,
                metadata: {
                    internalOrderId: savedOrder.id,
                    customerName: orderDetails.name || "Collection",
                    phone: orderDetails.phone || "Not provided",
                    address: orderDetails.address || "Collection",
                    fulfillment: orderDetails.fulfillment || "collection",
                    note: orderDetails.note || "None",
                }
            },
            checkoutOptions: {
                redirectUrl: `https://www.olivecomida.com/order-confirmed?order=${savedOrder.id}`,
                askForShippingAddress: false,
            }
        })

        const url = response.paymentLink.url
        const squareOrderId = response.paymentLink.orderId

        // 3. Update our saved order with the Square order ID and payment link, for matching later
        await supabase
            .from("orders")
            .update({
                square_order_id: squareOrderId,
                square_payment_link_url: url,
            })
            .eq("id", savedOrder.id)

        res.status(200).json({ success: true, checkoutUrl: url, orderId: savedOrder.id })

    } catch (error) {
        console.error("Payment error:", error)
        res.status(500).json({ success: false, error: error.message || "Failed to create checkout" })
    }
}
