const { createClient } = require("@supabase/supabase-js")
const crypto = require("crypto")

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
)

// Verifies the webhook actually came from Square, not someone else hitting this URL
function isValidSquareSignature(req, rawBody) {
    const signature = req.headers["x-square-hmacsha256-signature"]
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
    const notificationUrl = "https://olive-comida-gxdv.vercel.app/api/square-webhook"

    if (!signature || !signatureKey) return false

    const hmac = crypto.createHmac("sha256", signatureKey)
    hmac.update(notificationUrl + rawBody)
    const expectedSignature = hmac.digest("base64")

    return signature === expectedSignature
}

module.exports = async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    try {
        const rawBody = JSON.stringify(req.body)

        // Verify this request genuinely came from Square
        if (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
            const valid = isValidSquareSignature(req, rawBody)
            if (!valid) {
                console.error("Invalid Square webhook signature")
                return res.status(401).json({ error: "Invalid signature" })
            }
        }

        const event = req.body

        // We only care about payment events
        if (event.type === "payment.updated" || event.type === "payment.created") {
            const payment = event.data?.object?.payment

            if (payment && payment.status === "COMPLETED") {
                const squareOrderId = payment.order_id

                // Find the matching order in our database by Square order ID
                const { data: order, error: findError } = await supabase
                    .from("orders")
                    .select("id, status")
                    .eq("square_order_id", squareOrderId)
                    .single()

                if (findError || !order) {
                    console.error("Could not find matching order for Square order ID:", squareOrderId)
                    return res.status(200).json({ received: true, matched: false })
                }

                if (order.status !== "paid") {
                    await supabase
                        .from("orders")
                        .update({ status: "paid" })
                        .eq("id", order.id)
                }
            }
        }

        res.status(200).json({ received: true })

    } catch (error) {
        console.error("Webhook error:", error)
        res.status(500).json({ error: "Webhook processing failed" })
    }
}
