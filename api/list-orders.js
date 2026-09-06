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
        const { password } = req.query

        // Simple shared-password gate — not high security, just keeps random visitors out
        if (password !== process.env.ORDERS_DASHBOARD_PASSWORD) {
            return res.status(401).json({ success: false, error: "Unauthorized" })
        }

        const { data: orders, error } = await supabase
            .from("orders")
            .select("id, order_number, status, customer_name, customer_phone, fulfillment_type, delivery_address, postcode, order_note, items, total, created_at, paid_at")
            .order("created_at", { ascending: false })
            .limit(200)

        if (error) {
            console.error("Supabase fetch error:", error)
            return res.status(500).json({ success: false, error: "Failed to fetch orders" })
        }

        res.status(200).json({
            success: true,
            orders: orders.map(o => ({
                id: o.id,
                orderNumber: o.order_number,
                status: o.status,
                name: o.customer_name,
                phone: o.customer_phone,
                fulfillment: o.fulfillment_type,
                address: o.delivery_address,
                postcode: o.postcode,
                note: o.order_note,
                items: o.items,
                total: o.total,
                createdAt: o.created_at,
                paidAt: o.paid_at,
            }))
        })

    } catch (error) {
        console.error("List orders error:", error)
        res.status(500).json({ success: false, error: "Failed to fetch orders" })
    }
}
