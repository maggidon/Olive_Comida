const { createClient } = require("@supabase/supabase-js")

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
        const { password, order } = req.body

        // Same password gate as the dashboard itself
        if (password !== process.env.ORDERS_DASHBOARD_PASSWORD) {
            return res.status(401).json({ success: false, error: "Unauthorized" })
        }

        if (!order || !order.customerName || !order.items || order.items.length === 0) {
            return res.status(400).json({ success: false, error: "Missing required order details" })
        }

        const total = order.items.reduce((sum, item) => sum + (item.price || 0), 0)
        const markPaid = !!order.markAsPaid

        let orderNumber = null
        if (markPaid) {
            // Assign the next sequential number, same logic as the webhook —
            // only paid orders ever consume a number.
            const { data: maxRow } = await supabase
                .from("orders")
                .select("order_number")
                .not("order_number", "is", null)
                .order("order_number", { ascending: false })
                .limit(1)
                .maybeSingle()

            orderNumber = (maxRow?.order_number || 0) + 1
        }

        const { data: savedOrder, error: dbError } = await supabase
            .from("orders")
            .insert({
                status: markPaid ? "paid" : "pending",
                order_number: orderNumber,
                customer_name: order.customerName,
                customer_phone: order.customerPhone || "Not provided",
                fulfillment_type: order.fulfillment || "collection",
                delivery_address: order.address || "Collection",
                postcode: order.postcode || null,
                order_note: order.note || "Manual order — placed via WhatsApp",
                items: order.items,
                total: total,
                square_order_id: null,
                square_payment_link_url: null,
            })
            .select()
            .single()

        if (dbError) {
            console.error("Manual order insert error:", dbError)
            return res.status(500).json({ success: false, error: "Failed to save order" })
        }

        res.status(200).json({ success: true, order: savedOrder })

    } catch (error) {
        console.error("Manual order error:", error)
        res.status(500).json({ success: false, error: "Failed to create order" })
    }
}
