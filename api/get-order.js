const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
)

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })

    try {
        const { orderId } = req.query

        if (!orderId) {
            return res.status(400).json({ success: false, error: "Missing orderId" })
        }

        const { data: order, error } = await supabase
            .from("orders")
            .select("id, status, customer_name, fulfillment_type, delivery_address, postcode, order_note, items, total, created_at")
            .eq("id", orderId)
            .single()

        if (error || !order) {
            return res.status(404).json({ success: false, error: "Order not found" })
        }

        res.status(200).json({
            success: true,
            order: {
                id: order.id,
                status: order.status, // "pending" or "paid"
                name: order.customer_name,
                fulfillment: order.fulfillment_type,
                address: order.delivery_address,
                postcode: order.postcode,
                note: order.order_note,
                items: order.items,
                total: order.total,
                createdAt: order.created_at,
            }
        })

    } catch (error) {
        console.error("Order lookup error:", error)
        res.status(500).json({ success: false, error: "Failed to look up order" })
    }
}
