
const { SquareClient, SquareEnvironment } = require("square")
const { createClient } = require("@supabase/supabase-js")

const DELIVERY_FEE_PENCE = 300

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
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { orderDetails } = req.body

        if (
            !orderDetails ||
            !Array.isArray(orderDetails.basket) ||
            orderDetails.basket.length === 0
        ) {
            return res.status(400).json({
                success: false,
                error: "Your basket is empty."
            })
        }

        const fulfillment =
            orderDetails.fulfillment === "delivery"
                ? "delivery"
                : "collection"

        const deliveryFee =
            fulfillment === "delivery"
                ? DELIVERY_FEE_PENCE / 100
                : 0

        const lineItems = orderDetails.basket.map(item => ({
            name:
                item.sauce && item.sauce !== "Comida Standard"
                    ? `${item.name} (${item.spice} · ${item.sauce})`
                    : `${item.name} (${item.spice})`,
            quantity: "1",
            basePriceMoney: {
                amount: BigInt(Math.round(Number(item.price) * 100)),
                currency: "GBP"
            }
        }))

        // Add delivery as a separate Square line item.
        if (deliveryFee > 0) {
            lineItems.push({
                name: "Delivery Fee",
                quantity: "1",
                basePriceMoney: {
                    amount: BigInt(DELIVERY_FEE_PENCE),
                    currency: "GBP"
                }
            })
        }

        const subtotal = orderDetails.basket.reduce(
            (sum, item) => sum + Number(item.price),
            0
        )

        const total = Number((subtotal + deliveryFee).toFixed(2))

        // 1. Save the order before creating the payment link.
        const { data: savedOrder, error: dbError } = await supabase
            .from("orders")
            .insert({
                status: "pending",
                customer_name: orderDetails.name || "Collection",
                customer_phone: orderDetails.phone || "Not provided",
                fulfillment_type: fulfillment,
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
            return res.status(500).json({
                success: false,
                error: "Failed to save order"
            })
        }

        // 2. Create the Square payment link.
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
                    fulfillment,
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

        // 3. Save the Square order ID and payment link.
        await supabase
            .from("orders")
            .update({
                square_order_id: squareOrderId,
                square_payment_link_url: url,
            })
            .eq("id", savedOrder.id)

        return res.status(200).json({
            success: true,
            checkoutUrl: url,
            orderId: savedOrder.id
        })

    } catch (error) {
        console.error("Payment error:", error)
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to create checkout"
        })
    }
}
